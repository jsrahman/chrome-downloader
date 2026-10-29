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
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.parse import urlparse


MAX_REQUEST_BYTES = 16 * 1024
EXTENSION_ORIGIN = re.compile(r"^chrome-extension://[a-p]{32}$")
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{6,20}$")
PLAYLIST_ID = re.compile(r"^(?:PL|UU|FL|RD|OLAK5uy_)[A-Za-z0-9_-]{10,60}|[A-Za-z0-9_-]{13,64}$")
QUALITY_FORMATS = {
    "best": "bv*+ba/b",
    "2160": "bv*[height<=2160]+ba/b[height<=2160]",
    "1440": "bv*[height<=1440]+ba/b[height<=1440]",
    "1080": "bv*[height<=1080]+ba/b[height<=1080]",
    "720": "bv*[height<=720]+ba/b[height<=720]",
    "480": "bv*[height<=480]+ba/b[height<=480]",
    "360": "bv*[height<=360]+ba/b[height<=360]",
}

AUDIO_QUALITY_FORMATS = {
    "best": "0",
    "320": "320k",
    "256": "256k",
    "192": "192k",
    "128": "128k",
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


def extract_video_id(url: str) -> str:
    """Extract YouTube video ID from supported video URLs."""
    try:
        parsed = urlparse(url.strip())
        host = (parsed.hostname or "").lower().rstrip(".")
        if host not in {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}:
            return ""
        if host == "youtu.be":
            vid = parsed.path.strip("/").split("/", 1)[0]
        elif parsed.path == "/watch":
            from urllib.parse import parse_qs
            vid = parse_qs(parsed.query).get("v", [""])[0]
        elif parsed.path.startswith(("/shorts/", "/live/", "/embed/")):
            parts = parsed.path.strip("/").split("/")
            vid = parts[1] if len(parts) > 1 else ""
        else:
            vid = ""
        if vid and VIDEO_ID.fullmatch(vid):
            return vid
    except Exception:
        pass
    return ""


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
    video_id = extract_video_id(value)
    if video_id:
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


def is_partial_or_temp_file(path: Path | str) -> bool:
    """Return True if path represents a broken, incomplete, or temporary download file.

    Never matches completed media files (e.g. .mp4, .mp3, .m4a, .webm, .mkv).
    """
    p = Path(path)
    name = p.name.lower()

    # Incomplete download / state extensions
    if name.endswith((".part", ".ytdl", ".temp", ".tmp", ".frag")):
        return True

    # Fragment / temp patterns used by yt-dlp, aria2, and ffmpeg
    if (
        ".part-" in name
        or ".part." in name
        or ".temp." in name
        or ".tmp." in name
        or ".frag" in name
    ):
        return True

    # Intermediate separate stream files before ffmpeg merges them (e.g., .f137.mp4, .f248.webm, .f140.m4a)
    if re.search(r"\.f\d+\.[a-z0-9]+$", name):
        return True

    return False


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

    quality = str(payload.get("quality", "best"))
    if kind == "audio":
        if quality not in AUDIO_QUALITY_FORMATS and quality not in QUALITY_FORMATS:
            raise ValueError(f"Unsupported audio quality: {quality}")
    else:
        if quality not in QUALITY_FORMATS:
            raise ValueError(f"Unsupported video quality: {quality}")

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

    try:
        channels = int(payload.get("channels", 8))
        if channels not in {1, 2, 4, 8, 16, 32}:
            channels = 8
    except (TypeError, ValueError):
        channels = 8

    return {
        "url": url,
        "kind": kind,
        "quality": quality,
        "title": title,
        "is_playlist": is_playlist,
        "prefix_type": prefix_type,
        "custom_prefix": custom_prefix,
        "folder": folder,
        "channels": channels,
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
    channels: int = 8
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
            "channels": self.channels,
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
        idle_timeout: int = 0,
    ) -> None:
        self.download_dir = download_dir
        self.yt_dlp = yt_dlp
        self.player_client = player_client
        self.cookies_from_browser = cookies_from_browser
        self.idle_timeout = idle_timeout
        self._jobs: dict[str, Job] = {}
        self._queue: list[str] = []
        self._active_job_id: Optional[str] = None
        self._lock = threading.Lock()
        self._shutdown_callback: Optional[Callable[[], None]] = None
        self._idle_timer: Optional[threading.Timer] = None
        self._cache_file = self.download_dir / ".okja_download_cache.json"
        self._cache: dict[str, dict[str, Any]] = self._load_cache()
        self._last_playlist_skipped: int = 0
        self._arm_idle_timer()

    def _load_cache(self) -> dict[str, dict[str, Any]]:
        if not self._cache_file.is_file():
            return {}
        try:
            with open(self._cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception:
            pass
        return {}

    def _save_cache(self) -> None:
        try:
            self.download_dir.mkdir(parents=True, exist_ok=True)
            with open(self._cache_file, "w", encoding="utf-8") as f:
                json.dump(self._cache, f, indent=2)
        except Exception:
            pass

    def add_to_cache(self, video_id: str, kind: str, title: str = "", filename: str = "") -> None:
        if not video_id or not kind:
            return
        key = f"{video_id}:{kind}"
        with self._lock:
            self._cache[key] = {
                "videoId": video_id,
                "kind": kind,
                "title": title,
                "filename": filename,
                "timestamp": int(time.time()),
            }
            self._save_cache()

    def is_cached(self, video_id: str, kind: str) -> bool:
        if not video_id or not kind:
            return False
        key = f"{video_id}:{kind}"
        with self._lock:
            return key in self._cache

    def is_queued_or_active(self, video_id: str, kind: str) -> bool:
        if not video_id or not kind:
            return False
        with self._lock:
            if self._active_job_id:
                active = self._jobs.get(self._active_job_id)
                if active and active.status in {"downloading", "queued"}:
                    if extract_video_id(active.url) == video_id and active.kind == kind:
                        return True
            for q_id in self._queue:
                q_job = self._jobs.get(q_id)
                if q_job and q_job.status == "queued":
                    if extract_video_id(q_job.url) == video_id and q_job.kind == kind:
                        return True
        return False

    def clear_cache(self) -> int:
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            try:
                if self._cache_file.is_file():
                    self._cache_file.unlink(missing_ok=True)
            except Exception:
                pass
            return count

    def clear_queue(self) -> int:
        with self._lock:
            count = 0
            while self._queue:
                job_id = self._queue.pop(0)
                job = self._jobs.get(job_id)
                if job:
                    job.status = "cancelled"
                    self._cleanup_job_files(job)
                    count += 1
            if self._active_job_id is None and len(self._queue) == 0:
                self._arm_idle_timer()
            return count

    def stop_all(self) -> dict[str, Any]:
        with self._lock:
            stopped_active = False
            if self._active_job_id:
                active_job = self._jobs.get(self._active_job_id)
                if active_job:
                    active_job.status = "cancelled"
                    proc = active_job.process
                    if proc and proc.poll() is None:
                        try:
                            proc.terminate()
                            try:
                                proc.wait(timeout=0.2)
                            except subprocess.TimeoutExpired:
                                proc.kill()
                        except OSError:
                            pass
                    self._cleanup_job_files(active_job)
                    stopped_active = True
                self._active_job_id = None

            cleared_queue_count = 0
            while self._queue:
                job_id = self._queue.pop(0)
                job = self._jobs.get(job_id)
                if job:
                    job.status = "cancelled"
                    self._cleanup_job_files(job)
                    cleared_queue_count += 1

            self._arm_idle_timer()
            return {
                "stoppedActive": stopped_active,
                "clearedQueue": cleared_queue_count,
            }

    def set_shutdown_callback(self, callback: Callable[[], None]) -> None:
        with self._lock:
            self._shutdown_callback = callback

    def _arm_idle_timer(self) -> None:
        if self.idle_timeout <= 0:
            return
        self._cancel_idle_timer()

        def on_timeout() -> None:
            with self._lock:
                if self._active_job_id is None and len(self._queue) == 0:
                    print(
                        f"[{datetime.now().strftime('%d/%b/%Y %H:%M:%S')}] All downloads completed. Idle timeout ({self.idle_timeout}s) reached. Shutting down service.",
                        flush=True,
                    )
                    cb = self._shutdown_callback
                else:
                    cb = None
            if cb:
                cb()

        self._idle_timer = threading.Timer(float(self.idle_timeout), on_timeout)
        self._idle_timer.daemon = True
        self._idle_timer.start()

    def _cancel_idle_timer(self) -> None:
        if self._idle_timer:
            self._idle_timer.cancel()
            self._idle_timer = None

    def create(self, request: dict[str, Any]) -> Job:
        url = request["url"]
        kind = request.get("kind", "video")
        video_id = extract_video_id(url)

        if video_id and not request.get("is_playlist"):
            if self.is_queued_or_active(video_id, kind):
                raise ValueError("This video is already downloading or in queue")
            if self.is_cached(video_id, kind):
                fmt = "MP3 audio" if kind == "audio" else "video"
                raise ValueError(f"This video is already downloaded as {fmt}. (Use 'Clear Cache' to re-download)")

        subfolder = request.get("subfolder") or request.get("folder") or ""
        file_prefix = request.get("file_prefix") or ""
        prefix_type = request.get("prefix_type")
        if not file_prefix and prefix_type and prefix_type != "none":
            file_prefix = format_prefix(prefix_type, 1, request.get("custom_prefix", ""))

        channels = int(request.get("channels", 8))
        job = Job(
            id=uuid.uuid4().hex,
            url=url,
            kind=kind,
            quality=request.get("quality", "best"),
            title=request.get("title", ""),
            is_playlist=bool(request.get("is_playlist", False)),
            subfolder=subfolder,
            file_prefix=file_prefix,
            channels=channels,
        )
        with self._lock:
            self._cancel_idle_timer()
            self._jobs[job.id] = job
            if self._active_job_id is None:
                self._active_job_id = job.id
                threading.Thread(target=self._run, args=(job,), daemon=True).start()
            else:
                job.status = "queued"
                self._queue.append(job.id)
        return job

    def create_playlist(self, request: dict[str, Any]) -> list[Job]:
        with self._lock:
            self._cancel_idle_timer()
        url = request["url"]
        kind = request.get("kind", "video")
        playlist_title, entries = extract_playlist_items(self.yt_dlp, url)
        if not entries:
            self._last_playlist_skipped = 0
            return [self.create(request)]

        # Filter out videos in the playlist that are already cached in this format or in queue
        valid_entries = []
        skipped_count = 0
        for entry in entries:
            v_id = extract_video_id(entry.get("url", ""))
            if v_id and (self.is_cached(v_id, kind) or self.is_queued_or_active(v_id, kind)):
                skipped_count += 1
            else:
                valid_entries.append(entry)

        self._last_playlist_skipped = skipped_count
        if not valid_entries:
            return []

        custom_folder = sanitize_folder_name(request.get("folder", "")) if request.get("folder") else ""
        req_title = str(request.get("title", "")).removeprefix("Playlist:").strip()
        folder_name = custom_folder or sanitize_folder_name(playlist_title if playlist_title != "Playlist" else (req_title or "Playlist"))
        prefix_type = request.get("prefix_type", "number")
        custom_prefix = request.get("custom_prefix", "")
        channels = int(request.get("channels", 8))

        jobs: list[Job] = []
        with self._lock:
            for idx, entry in enumerate(valid_entries, 1):
                prefix = format_prefix(prefix_type, idx, custom_prefix)
                job = Job(
                    id=uuid.uuid4().hex,
                    url=entry["url"],
                    kind=kind,
                    quality=request.get("quality", "best"),
                    title=entry.get("title", ""),
                    is_playlist=False,
                    subfolder=folder_name,
                    file_prefix=prefix,
                    channels=channels,
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

    def _cleanup_job_files(self, job: Job) -> None:
        """Remove any broken or incomplete partial files on disk associated with a cancelled job.
        Completed media files (.mp4, .mp3, etc.) are strictly preserved.
        """
        target_dir = self.download_dir / sanitize_folder_name(job.subfolder) if job.subfolder else self.download_dir

        # 1. If job has a recorded filename, clean only its partial/temp counterparts
        if job.filename:
            try:
                base_path = Path(job.filename)
                # If base_path itself is an incomplete/partial file, remove it
                if base_path.is_file() and is_partial_or_temp_file(base_path):
                    base_path.unlink(missing_ok=True)
                # Also delete known partial extensions for this filename
                for ext in [".part", ".ytdl", ".temp", ".tmp"]:
                    part_p = Path(f"{job.filename}{ext}")
                    if part_p.is_file():
                        part_p.unlink(missing_ok=True)
            except OSError:
                pass

        # 2. Match any broken/partial file containing the video ID in target_dir or download_dir
        vid = extract_video_id(job.url)
        if vid:
            patterns = [f"*[{vid}]*", f"*{vid}*"]
            dirs_to_search = [target_dir]
            if target_dir != self.download_dir and self.download_dir.is_dir():
                dirs_to_search.append(self.download_dir)

            for d in dirs_to_search:
                if not d.is_dir():
                    continue
                for pat in patterns:
                    try:
                        for matched in d.rglob(pat):
                            if matched.is_file() and is_partial_or_temp_file(matched):
                                try:
                                    matched.unlink(missing_ok=True)
                                except OSError:
                                    pass
                    except OSError:
                        pass

        # 3. If target_dir was a custom playlist subfolder and is now empty, remove it
        if job.subfolder:
            try:
                sub_dir = self.download_dir / sanitize_folder_name(job.subfolder)
                if sub_dir.is_dir() and not any(sub_dir.iterdir()):
                    sub_dir.rmdir()
            except OSError:
                pass

    def cancel(self, job_id: str) -> Optional[Job]:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            if job_id in self._queue:
                self._queue.remove(job_id)
                job.status = "cancelled"
                self._cleanup_job_files(job)
                if self._active_job_id is None and len(self._queue) == 0:
                    self._arm_idle_timer()
                return job
            if self._active_job_id == job_id:
                process = job.process
                job.status = "cancelled"
                if process and process.poll() is None:
                    try:
                        process.terminate()
                        try:
                            process.wait(timeout=0.2)
                        except subprocess.TimeoutExpired:
                            process.kill()
                    except OSError:
                        pass
                self._cleanup_job_files(job)
                # When the process exits, _run()'s finally block will call _next_job()
                return job
            job.status = "cancelled"
            self._cleanup_job_files(job)
            if self._active_job_id is None and len(self._queue) == 0:
                self._arm_idle_timer()
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
                    return
            if self._active_job_id is None and len(self._queue) == 0:
                self._arm_idle_timer()

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
            "--concurrent-fragments", str(job.channels or 8),
            "--buffer-size", "16M",
            "--http-chunk-size", "10M",
            "--fragment-retries", "10",
            "--retries", "10",
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

        project_dir = Path(__file__).resolve().parent.parent
        scripts_dir = project_dir / ".venv" / "Scripts"
        venv_bin = scripts_dir if scripts_dir.is_dir() else (project_dir / ".venv" / "bin")
        if (venv_bin / "ffmpeg").is_file() or (venv_bin / "ffmpeg.exe").is_file():
            command.extend(["--ffmpeg-location", str(venv_bin)])
        if job.kind == "audio":
            audio_quality_val = AUDIO_QUALITY_FORMATS.get(job.quality, "0")
            command.extend(["--extract-audio", "--audio-format", "mp3", "--audio-quality", audio_quality_val])
        else:
            format_spec = QUALITY_FORMATS.get(job.quality, QUALITY_FORMATS["best"])
            command.extend([
                "--format", format_spec,
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
                if job.status == "cancelled":
                    try:
                        process.kill()
                    except OSError:
                        pass
                    break
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

            try:
                return_code = process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                return_code = process.wait()

            if job.status == "cancelled":
                self._cleanup_job_files(job)
                return
            if return_code == 0:
                job.progress = 100.0
                job.status = "complete"
                vid = extract_video_id(job.url)
                if vid:
                    self.add_to_cache(vid, job.kind, job.title, job.filename)
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
            if job.status == "cancelled":
                self._cleanup_job_files(job)
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
            yt_dlp_bin = self.server.manager.yt_dlp
            yt_dlp_ok = bool(shutil.which(yt_dlp_bin) or (Path(yt_dlp_bin).is_file() and os.access(yt_dlp_bin, os.X_OK)))
            project_dir = Path(__file__).resolve().parent.parent
            scripts_dir = project_dir / ".venv" / "Scripts"
            venv_bin = scripts_dir if scripts_dir.is_dir() else (project_dir / ".venv" / "bin")
            local_ffmpeg = venv_bin / "ffmpeg"
            if not local_ffmpeg.is_file():
                local_ffmpeg = venv_bin / "ffmpeg.exe"
            ffmpeg_ok = bool(shutil.which("ffmpeg") or local_ffmpeg.is_file())
            missing = []
            errors = []
            if not yt_dlp_ok:
                missing.append("yt-dlp")
                errors.append("yt-dlp executable was not found. Run scripts/setup.sh.")
            if not ffmpeg_ok:
                missing.append("ffmpeg")
                errors.append("ffmpeg is not installed. High-resolution merging and MP3 conversion require ffmpeg.")

            from service.distro import detect_distro
            distro_info = detect_distro()

            script_name = "setup-windows.bat" if sys.platform == "win32" else ("setup-mac.sh" if sys.platform == "darwin" else "setup-linux.sh")
            setup_script = str(project_dir / script_name)

            self._json(HTTPStatus.OK, {
                "ok": True,
                "projectDir": str(project_dir),
                "setupScript": setup_script,
                "ytDlpAvailable": yt_dlp_ok,
                "ffmpegAvailable": ffmpeg_ok,
                "allPackagesReady": yt_dlp_ok and ffmpeg_ok,
                "missing": missing,
                "errors": errors,
                "distro": distro_info,
                "pythonVersion": sys.version.split()[0],
                "platform": sys.platform,
                "downloadDir": str(self.server.manager.download_dir),
                **self.server.manager.status_summary(),
            })
            return
        if self.path == "/api/status":
            self._json(HTTPStatus.OK, self.server.manager.status_summary())
            return
        if self.path == "/api/cache":
            with self.server.manager._lock:
                items = list(self.server.manager._cache.values())
            self._json(HTTPStatus.OK, {"ok": True, "count": len(items), "items": items})
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
        if self.path == "/api/queue/clear":
            cleared = self.server.manager.clear_queue()
            self._json(HTTPStatus.OK, {"ok": True, "clearedCount": cleared})
            return
        if self.path == "/api/downloads/stop-all":
            res = self.server.manager.stop_all()
            self._json(HTTPStatus.OK, {"ok": True, **res})
            return
        if self.path == "/api/cache/clear":
            cleared = self.server.manager.clear_cache()
            self._json(HTTPStatus.OK, {"ok": True, "clearedCount": cleared, "message": "Cache cleared"})
            return
        if self.path == "/api/setup":
            from service.native_host import run_setup
            project_dir = Path(__file__).resolve().parent.parent
            result = run_setup(project_dir)
            self._json(HTTPStatus.OK, result)
            return
        if self.path == "/api/shutdown":
            self._json(HTTPStatus.OK, {"status": "shutting_down"})
            cb = self.server.manager._shutdown_callback
            if cb:
                def _delayed_shutdown() -> None:
                    time.sleep(0.15)
                    cb()
                threading.Thread(target=_delayed_shutdown, daemon=True).start()
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
            skipped = getattr(self.server.manager, "_last_playlist_skipped", 0)
            if not jobs and skipped > 0:
                self._json(HTTPStatus.ACCEPTED, {
                    "ok": True,
                    "playlistCount": 0,
                    "skippedCount": skipped,
                    "allSkipped": True,
                    "message": "All videos in this playlist are already downloaded or in queue.",
                })
                return
            if jobs:
                first = jobs[0]
                self._json(HTTPStatus.ACCEPTED, {
                    "job": first.public(),
                    "queued": first.status == "queued",
                    "playlistCount": len(jobs),
                    "skippedCount": skipped,
                })
                return
        try:
            job = self.server.manager.create(request)
            self._json(HTTPStatus.ACCEPTED, {"job": job.public(), "queued": job.status == "queued"})
        except ValueError as exc:
            msg = str(exc)
            is_cached = "already downloaded" in msg
            is_queued = "already downloading" in msg
            self._json(HTTPStatus.CONFLICT if (is_cached or is_queued) else HTTPStatus.BAD_REQUEST, {
                "error": msg,
                "alreadyDownloaded": is_cached,
                "alreadyQueued": is_queued,
            })

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
    parser.add_argument(
        "--idle-timeout",
        type=int,
        default=int(os.environ.get("OKJA_IDLE_TIMEOUT", "25")),
        help="Seconds of inactivity before auto-shutting down (0 to disable)",
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
        idle_timeout=args.idle_timeout,
    )
    server = ApiServer((args.host, args.port), manager)
    manager.set_shutdown_callback(lambda: threading.Thread(target=server.shutdown, daemon=True).start())

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
