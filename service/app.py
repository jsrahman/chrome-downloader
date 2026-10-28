#!/usr/bin/env python3
"""Authenticated localhost service that runs yt-dlp download jobs."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse


MAX_REQUEST_BYTES = 16 * 1024
EXTENSION_ORIGIN = re.compile(r"^chrome-extension://[a-p]{32}$")
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{6,20}$")
PLAYLIST_ID = re.compile(r"^(?:PL|UU|FL|RD|OLAK5uy_)[A-Za-z0-9_-]{10,60}|[A-Za-z0-9_-]{13,64}$")
QUALITY_FORMATS = {
    "best": "bv*+ba/b",
    "1080": "bv*[height<=1080]+ba/b[height<=1080]",
    "720": "bv*[height<=720]+ba/b[height<=720]",
    "480": "bv*[height<=480]+ba/b[height<=480]",
    "360": "bv*[height<=360]+ba/b[height<=360]",
}


def is_extension_origin(origin: Optional[str]) -> bool:
    """Return true only for a normal Chromium extension origin."""
    return bool(origin and EXTENSION_ORIGIN.fullmatch(origin))


def is_playlist_url(url: str) -> bool:
    """Return true if url is a YouTube playlist URL."""
    try:
        parsed = urlparse(url)
        return parsed.path == "/playlist" or bool("list=" in url and "/watch" not in parsed.path)
    except Exception:
        return False


def normalize_youtube_url(value: object, is_playlist: bool = False) -> str:
    """Validate and normalize a single YouTube video or playlist URL."""
    if not isinstance(value, str) or len(value) > 2_048:
        raise ValueError("A valid YouTube URL is required")

    parsed = urlparse(value.strip())
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port:
        raise ValueError("Only HTTPS YouTube URLs are supported")

    host = (parsed.hostname or "").lower().rstrip(".")
    allowed_hosts = {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be",
    }
    if host not in allowed_hosts:
        raise ValueError("Only youtube.com and youtu.be URLs are supported")

    from urllib.parse import parse_qs
    query = parse_qs(parsed.query)

    # 1. Check playlist URL
    if parsed.path == "/playlist":
        playlist_id = query.get("list", [""])[0]
        if not PLAYLIST_ID.fullmatch(playlist_id):
            raise ValueError("The URL must point to a valid YouTube playlist")
        return f"https://www.youtube.com/playlist?list={playlist_id}"

    # 2. Check video URL
    video_id = ""
    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/", 1)[0]
    elif parsed.path == "/watch":
        video_id = query.get("v", [""])[0]
    elif parsed.path.startswith(("/shorts/", "/live/", "/embed/")):
        parts = parsed.path.strip("/").split("/")
        video_id = parts[1] if len(parts) > 1 else ""

    if video_id and VIDEO_ID.fullmatch(video_id):
        playlist_id = query.get("list", [""])[0]
        if is_playlist and playlist_id and PLAYLIST_ID.fullmatch(playlist_id):
            return f"https://www.youtube.com/playlist?list={playlist_id}"
        return f"https://www.youtube.com/watch?v={video_id}"

    raise ValueError("The URL must point to a YouTube video or playlist")


def to_roman(n: int) -> str:
    """Convert a positive integer to Roman numerals (e.g. 1 -> I, 4 -> IV)."""
    if n <= 0:
        return str(n)
    val = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
    syms = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"]
    roman = ""
    for i, v in enumerate(val):
        while n >= v:
            roman += syms[i]
            n -= v
    return roman


def to_alphabet(n: int) -> str:
    """Convert a 1-based index to spreadsheet-style alphabet (1 -> A, 26 -> Z, 27 -> AA)."""
    if n <= 0:
        return ""
    result = ""
    while n > 0:
        n -= 1
        result = chr(ord("A") + (n % 26)) + result
        n //= 26
    return result


def format_prefix(prefix_type: str, index: int, custom_prefix: str = "") -> str:
    """Format the filename prefix based on the selected prefix type and item index."""
    if prefix_type == "number":
        return f"{index:02d} - "
    elif prefix_type == "roman":
        return f"{to_roman(index)} - "
    elif prefix_type == "alphabet":
        return f"{to_alphabet(index)} - "
    elif prefix_type == "custom":
        if not custom_prefix:
            return f"{index:02d} - "
        if "{index}" in custom_prefix:
            return custom_prefix.replace("{index}", str(index))
        elif "{num}" in custom_prefix:
            return custom_prefix.replace("{num}", f"{index:02d}")
        else:
            sep = "" if custom_prefix.endswith(("-", " ", "_", ".")) else " - "
            return f"{custom_prefix}{sep}"
    elif prefix_type == "none":
        return ""
    return f"{index:02d} - "


def sanitize_folder_name(name: str) -> str:
    """Return a filesystem-safe folder name."""
    cleaned = re.sub(r'[\\/:*?"<>|]', "_", name.strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip(". ")
    return cleaned[:150] or "Playlist"


def extract_playlist_items(yt_dlp: str, url: str) -> tuple[str, list[dict[str, str]]]:
    """Extract playlist title and individual video items without downloading."""
    try:
        cmd = [yt_dlp, "--flat-playlist", "-J", "--no-warnings", url]
        out = subprocess.check_output(cmd, text=True, encoding="utf-8", timeout=35)
        data = json.loads(out)
        playlist_title = data.get("title") or "Playlist"
        entries: list[dict[str, str]] = []
        for item in data.get("entries") or []:
            if not item:
                continue
            vid_id = item.get("id") or ""
            vid_title = item.get("title") or "YouTube video"
            vid_url = item.get("url") or f"https://www.youtube.com/watch?v={vid_id}"
            if not vid_url.startswith("http"):
                vid_url = f"https://www.youtube.com/watch?v={vid_id}"
            entries.append({
                "id": vid_id,
                "title": vid_title,
                "url": vid_url,
            })
        return playlist_title, entries
    except Exception as exc:
        print(f"Playlist extraction fallback: {exc}", flush=True)
        return "Playlist", []


def validate_download_request(payload: object) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("The request body must be a JSON object")
    kind = payload.get("kind", "video")
    if kind not in {"video", "audio"}:
        raise ValueError("Format must be video or audio")

    quality = payload.get("quality", "best")
    if quality not in QUALITY_FORMATS:
        raise ValueError("Unsupported video quality")

    title = str(payload.get("title", "")).strip()[:300]
    raw_url = str(payload.get("url", ""))
    is_playlist_flag = is_playlist_url(raw_url) or bool(payload.get("isPlaylist") or payload.get("is_playlist"))
    url = normalize_youtube_url(raw_url, is_playlist=is_playlist_flag)
    is_playlist = is_playlist_flag or is_playlist_url(url)

    prefix_type = str(payload.get("prefixType") or payload.get("prefix_type") or "number").strip().lower()
    if prefix_type not in {"number", "roman", "alphabet", "custom", "none"}:
        prefix_type = "number"

    custom_prefix = str(payload.get("customPrefix") or payload.get("custom_prefix") or "").strip()[:100]
    folder = str(payload.get("folder") or payload.get("subfolder") or "").strip()[:200]

    return {
        "url": url,
        "kind": kind,
        "quality": quality,
        "title": title,
        "is_playlist": is_playlist,
        "prefix_type": prefix_type,
        "custom_prefix": custom_prefix,
        "folder": folder,
    }


@dataclass
class Job:
    id: str
    url: str
    kind: str
    quality: str
    title: str = ""
    status: str = "queued"
    is_playlist: bool = False
    subfolder: str = ""
    file_prefix: str = ""
    progress: float = 0.0
    speed: str = ""
    eta: str = ""
    filename: str = ""
    error: str = ""
    created_at: float = field(default_factory=time.time)
    process: Optional[subprocess.Popen] = field(default=None, repr=False)

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "url": self.url,
            "title": self.title,
            "kind": self.kind,
            "quality": self.quality,
            "status": self.status,
            "is_playlist": self.is_playlist,
            "subfolder": self.subfolder,
            "file_prefix": self.file_prefix,
            "progress": self.progress,
            "speed": self.speed,
            "eta": self.eta,
            "filename": self.filename,
            "error": self.error,
            "created_at": self.created_at,
        }


class JobManager:
    def __init__(
        self,
        download_dir: Path,
        yt_dlp: str,
        player_client: Optional[str] = None,
        cookies_from_browser: Optional[str] = None,
    ) -> None:
        self.download_dir = download_dir
        self.yt_dlp = yt_dlp
        self.player_client = player_client
        self.cookies_from_browser = cookies_from_browser
        self._jobs: dict[str, Job] = {}
        self._queue: list[str] = []
        self._active_job_id: Optional[str] = None
        self._lock = threading.Lock()

    def create(self, request: dict[str, Any]) -> Job:
        subfolder = request.get("subfolder") or request.get("folder") or ""
        file_prefix = request.get("file_prefix") or ""
        prefix_type = request.get("prefix_type")
        if not file_prefix and prefix_type and prefix_type != "none":
            file_prefix = format_prefix(prefix_type, 1, request.get("custom_prefix", ""))

        job = Job(
            id=uuid.uuid4().hex,
            url=request["url"],
            kind=request.get("kind", "video"),
            quality=request.get("quality", "best"),
            title=request.get("title", ""),
            is_playlist=bool(request.get("is_playlist", False)),
            subfolder=subfolder,
            file_prefix=file_prefix,
        )
        with self._lock:
            self._jobs[job.id] = job
            if self._active_job_id is None:
                self._active_job_id = job.id
                threading.Thread(target=self._run, args=(job,), daemon=True).start()
            else:
                job.status = "queued"
                self._queue.append(job.id)
        return job

    def create_playlist(self, request: dict[str, Any]) -> list[Job]:
        url = request["url"]
        playlist_title, entries = extract_playlist_items(self.yt_dlp, url)
        if not entries:
            return [self.create(request)]

        custom_folder = sanitize_folder_name(request.get("folder", "")) if request.get("folder") else ""
        req_title = str(request.get("title", "")).removeprefix("Playlist:").strip()
        folder_name = custom_folder or sanitize_folder_name(playlist_title if playlist_title != "Playlist" else (req_title or "Playlist"))
        prefix_type = request.get("prefix_type", "number")
        custom_prefix = request.get("custom_prefix", "")

        jobs: list[Job] = []
        with self._lock:
            for idx, entry in enumerate(entries, 1):
                prefix = format_prefix(prefix_type, idx, custom_prefix)
                job = Job(
                    id=uuid.uuid4().hex,
                    url=entry["url"],
                    kind=request.get("kind", "video"),
                    quality=request.get("quality", "best"),
                    title=entry.get("title", ""),
                    is_playlist=False,
                    subfolder=folder_name,
                    file_prefix=prefix,
                )
                self._jobs[job.id] = job
                jobs.append(job)

                if self._active_job_id is None:
                    self._active_job_id = job.id
                    threading.Thread(target=self._run, args=(job,), daemon=True).start()
                else:
                    job.status = "queued"
                    self._queue.append(job.id)

        return jobs

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel(self, job_id: str) -> Optional[Job]:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            if job_id in self._queue:
                self._queue.remove(job_id)
                job.status = "cancelled"
                return job
            if self._active_job_id == job_id:
                process = job.process
                if process and process.poll() is None:
                    process.terminate()
                job.status = "cancelled"
                return job
            job.status = "cancelled"
            return job

    def status_summary(self) -> dict[str, Any]:
        with self._lock:
            active_job = self._jobs.get(self._active_job_id) if self._active_job_id else None
            queue_jobs = [self._jobs[jid].public() for jid in self._queue if jid in self._jobs]
            return {
                "activeJob": active_job.public() if active_job else None,
                "queue": queue_jobs,
                "queueCount": len(queue_jobs),
            }

    def _next_job(self) -> None:
        with self._lock:
            self._active_job_id = None
            while self._queue:
                next_id = self._queue.pop(0)
                next_job = self._jobs.get(next_id)
                if next_job and next_job.status == "queued":
                    self._active_job_id = next_id
                    threading.Thread(target=self._run, args=(next_job,), daemon=True).start()
                    break

    def _command(self, job: Job) -> list[str]:
        target_dir = self.download_dir / sanitize_folder_name(job.subfolder) if job.subfolder else self.download_dir
        if job.is_playlist:
            output = str(target_dir / "%(playlist_title,playlist)s" / f"{job.file_prefix}%(playlist_index&{{:02d}} - |)s%(title).180B [%(id)s].%(ext)s")
        else:
            output = str(target_dir / f"{job.file_prefix}%(title).180B [%(id)s].%(ext)s")

        command = [
            self.yt_dlp,
            "--newline",
            "--progress",
            "--progress-delta",
            "0.3",
            "--no-colors",
        ]

        if job.is_playlist:
            command.extend(["--yes-playlist", "--ignore-errors"])
        else:
            command.append("--no-playlist")

        command.extend([
            "--no-warnings",
            "--progress-template",
            "download:OKJA_PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s",
            "--progress-template",
            "postprocess:OKJA_POSTPROCESS:%(progress.status)s",
            "--print",
            "after_move:OKJA_FILE:%(filepath)s",
            "--output",
            output,
        ])
        if self.player_client:
            command.extend(["--extractor-args", f"youtube:player_client={self.player_client}"])
        if self.cookies_from_browser:
            command.extend(["--cookies-from-browser", self.cookies_from_browser])
        if job.kind == "audio":
            command.extend(["--extract-audio", "--audio-format", "mp3", "--audio-quality", "0"])
        else:
            command.extend([
                "--format", QUALITY_FORMATS[job.quality],
                "--merge-output-format", "mp4",
                "--remux-video", "mp4",
            ])
        command.append(job.url)
        return command

    def _run(self, job: Job) -> None:
        try:
            target_dir = self.download_dir / sanitize_folder_name(job.subfolder) if job.subfolder else self.download_dir
            target_dir.mkdir(parents=True, exist_ok=True)
            job.status = "downloading"
            process = subprocess.Popen(
                self._command(job),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                shell=False,
                bufsize=1,
            )
            job.process = process
            recent_lines: list[str] = []
            stream_count = 0
            last_stream_raw = 0.0
            assert process.stdout is not None
            while True:
                raw_line = process.stdout.readline()
                if not raw_line:
                    break
                line = raw_line.strip()
                if line.startswith("OKJA_PROGRESS:"):
                    clean_line = re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", line)
                    values = clean_line.removeprefix("OKJA_PROGRESS:").split("|", 2)
                    match = re.search(r"(\d+(?:\.\d+)?)", values[0])
                    if match:
                        raw_pct = float(match.group(1))
                        if raw_pct < (last_stream_raw - 20.0):
                            stream_count += 1
                        last_stream_raw = raw_pct

                        if job.kind == "video":
                            if stream_count == 0:
                                job.progress = min(90.0, round(raw_pct * 0.9, 1))
                            else:
                                job.progress = min(98.0, round(90.0 + (raw_pct * 0.08), 1))
                        else:
                            job.progress = min(98.0, round(raw_pct, 1))
                    speed = values[1].strip() if len(values) > 1 else ""
                    eta = values[2].strip() if len(values) > 2 else ""
                    job.speed = speed if speed and "unknown" not in speed.lower() else ""
                    job.eta = eta if eta and "unknown" not in eta.lower() and eta != "NA" else ""
                elif line.startswith("OKJA_POSTPROCESS:"):
                    job.progress = 99.0
                    job.speed = "Finalizing..."
                    job.eta = ""
                elif line.startswith("OKJA_FILE:"):
                    job.filename = line.removeprefix("OKJA_FILE:")
                elif line:
                    recent_lines.append(line)
                    recent_lines = recent_lines[-5:]

            return_code = process.wait()
            if job.status == "cancelled":
                return
            if return_code == 0:
                job.progress = 100.0
                job.status = "complete"
            else:
                job.status = "error"
                job.error = recent_lines[-1] if recent_lines else f"yt-dlp exited with code {return_code}"
        except FileNotFoundError:
            job.status = "error"
            job.error = "yt-dlp was not found. Run scripts/setup.sh first."
        except Exception as exc:  # Keep failures visible to the popup.
            job.status = "error"
            job.error = f"Download failed: {exc}"
        finally:
            job.process = None
            self._next_job()


class ApiServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], manager: JobManager):
        super().__init__(address, RequestHandler)
        self.manager = manager


class RequestHandler(BaseHTTPRequestHandler):
    server: ApiServer

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}", flush=True)

    def _origin_allowed(self) -> bool:
        return is_extension_origin(self.headers.get("Origin"))

    def _cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if is_extension_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _json(self, status: int, body: dict[str, Any]) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(encoded)

    def _guard(self) -> bool:
        # Chromium can omit Origin on a same-extension follow-up GET. Reject a
        # supplied web origin, but allow an absent one for those local polls.
        origin = self.headers.get("Origin")
        if origin and not self._origin_allowed():
            self._json(HTTPStatus.FORBIDDEN, {"error": "Requests must come from the browser extension"})
            return False
        return True

    def do_OPTIONS(self) -> None:
        if not self._origin_allowed():
            self._json(HTTPStatus.FORBIDDEN, {"error": "Origin not allowed"})
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors_headers()
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        if not self._guard():
            return
        if self.path == "/api/health":
            self._json(HTTPStatus.OK, {
                "ok": True,
                "ytDlpAvailable": shutil.which(self.server.manager.yt_dlp) is not None,
                "downloadDir": str(self.server.manager.download_dir),
                **self.server.manager.status_summary(),
            })
            return
        if self.path == "/api/status":
            self._json(HTTPStatus.OK, self.server.manager.status_summary())
            return
        match = re.fullmatch(r"/api/downloads/([a-f0-9]{32})", self.path)
        if match:
            job = self.server.manager.get(match.group(1))
            if job:
                self._json(HTTPStatus.OK, {"job": job.public()})
            else:
                self._json(HTTPStatus.NOT_FOUND, {"error": "Download job not found"})
            return
        self._json(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_POST(self) -> None:
        if not self._guard():
            return
        if self.path != "/api/downloads":
            self._json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        if self.headers.get_content_type() != "application/json":
            self._json(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": "Content-Type must be application/json"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length < 2 or length > MAX_REQUEST_BYTES:
            self._json(HTTPStatus.BAD_REQUEST, {"error": "Invalid request size"})
            return
        try:
            payload = json.loads(self.rfile.read(length))
            request = validate_download_request(payload)
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
            self._json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return
        if request.get("is_playlist"):
            jobs = self.server.manager.create_playlist(request)
            if jobs:
                first = jobs[0]
                self._json(HTTPStatus.ACCEPTED, {
                    "job": first.public(),
                    "queued": first.status == "queued",
                    "playlistCount": len(jobs),
                })
                return
        job = self.server.manager.create(request)
        self._json(HTTPStatus.ACCEPTED, {"job": job.public(), "queued": job.status == "queued"})

    def do_DELETE(self) -> None:
        if not self._guard():
            return
        match = re.fullmatch(r"/api/downloads/([a-f0-9]{32})", self.path)
        if not match:
            self._json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        job = self.server.manager.cancel(match.group(1))
        if job:
            self._json(HTTPStatus.OK, {"job": job.public()})
        else:
            self._json(HTTPStatus.NOT_FOUND, {"error": "Download job not found"})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.environ.get("OKJA_PORT", "43117")))
    parser.add_argument(
        "--download-dir",
        type=Path,
        default=Path(os.environ.get("OKJA_DOWNLOAD_DIR", "~/Downloads/Okja YouTube Saver")).expanduser(),
    )
    parser.add_argument("--yt-dlp", default=os.environ.get("OKJA_YT_DLP", "yt-dlp"))
    parser.add_argument(
        "--player-client",
        default=os.environ.get("OKJA_PLAYER_CLIENT"),
        help="Optional YouTube player clients to try (comma-separated, e.g. android,web,ios,mweb)",
    )
    parser.add_argument(
        "--cookies-from-browser",
        default=os.environ.get("OKJA_COOKIES_FROM_BROWSER"),
        help="Browser to import YouTube cookies from (e.g., chrome, safari, firefox, brave)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Refusing to bind outside the local machine")
    manager = JobManager(
        args.download_dir.resolve(),
        args.yt_dlp,
        player_client=args.player_client or None,
        cookies_from_browser=args.cookies_from_browser or None,
    )
    server = ApiServer((args.host, args.port), manager)

    print("Okja YouTube Saver service is ready")
    print(f"Address: http://{args.host}:{args.port}")
    print(f"Download directory: {manager.download_dir}")
    print("Keep this terminal open. Press Ctrl+C to stop.")

    def stop(_signum: int, _frame: object) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
