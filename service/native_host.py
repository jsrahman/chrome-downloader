#!/usr/bin/env python3
"""
Okja YouTube Saver - Chrome Native Messaging Host
Allows the Chrome extension to automatically launch the companion download service
on demand before downloading, verify installed packages, and cleanly shut down.
"""

import json
import os
import shutil
import struct
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

# Ensure project root and service directory are in Python search path
PROJECT_DIR = Path(__file__).resolve().parent.parent
SERVICE_DIR = Path(__file__).resolve().parent
for p in [str(PROJECT_DIR), str(SERVICE_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

# Ensure standard user, brew, and system tool paths are visible to spawned processes
EXTRA_PATHS = [
    str(Path.home() / ".local" / "bin"),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
]
current_path = os.environ.get("PATH", "")
os.environ["PATH"] = ":".join(EXTRA_PATHS) + ":" + current_path

DEFAULT_PORT = 43117


def get_venv_bin_dir(project_dir: Path) -> Path:
    scripts = project_dir / ".venv" / "Scripts"
    if scripts.is_dir() or sys.platform in {"win32", "cygwin"}:
        return scripts
    return project_dir / ".venv" / "bin"


def get_venv_python(project_dir: Path) -> Path:
    bin_dir = get_venv_bin_dir(project_dir)
    exe = bin_dir / "python.exe"
    if exe.is_file():
        return exe
    return bin_dir / "python"


def read_native_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    length = struct.unpack("@I", raw_length)[0]
    message_bytes = sys.stdin.buffer.read(length)
    return json.loads(message_bytes.decode("utf-8"))


def send_native_message(message):
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("@I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def is_service_alive(port: int = DEFAULT_PORT) -> bool:
    try:
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/status",
            headers={"Origin": "chrome-extension://enfcgiajdbdmggdicbjndajnmlmolflo"},
        )
        with urllib.request.urlopen(req, timeout=0.35) as resp:
            return resp.status == 200
    except Exception:
        return False


def get_diagnostics(project_dir: Path, port: int = DEFAULT_PORT) -> dict:
    bin_dir = get_venv_bin_dir(project_dir)

    yt_dlp_candidates = [bin_dir / "yt-dlp", bin_dir / "yt-dlp.exe"]
    yt_dlp_path = ""
    for cand in yt_dlp_candidates:
        if cand.is_file():
            yt_dlp_path = str(cand)
            break
    if not yt_dlp_path:
        yt_dlp_path = shutil.which("yt-dlp") or ""
    yt_dlp_ok = bool(yt_dlp_path)

    ffmpeg_candidates = [bin_dir / "ffmpeg", bin_dir / "ffmpeg.exe"]
    ffmpeg_path = ""
    for cand in ffmpeg_candidates:
        if cand.is_file():
            ffmpeg_path = str(cand)
            break
    if not ffmpeg_path:
        ffmpeg_path = shutil.which("ffmpeg") or ""
    if not ffmpeg_path:
        try:
            import imageio_ffmpeg
            cand_ff = imageio_ffmpeg.get_ffmpeg_exe()
            if cand_ff and os.path.isfile(cand_ff):
                ffmpeg_path = cand_ff
                dst = bin_dir / ("ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
                if not dst.exists():
                    try:
                        os.symlink(cand_ff, dst)
                    except OSError:
                        shutil.copy2(cand_ff, dst)
                    try:
                        os.chmod(dst, 0o755)
                    except OSError:
                        pass
        except Exception:
            pass
    ffmpeg_ok = bool(ffmpeg_path)

    missing = []
    errors = []
    if not yt_dlp_ok:
        missing.append("yt-dlp")
        errors.append("yt-dlp core engine is not installed in the environment.")
    if not ffmpeg_ok:
        missing.append("ffmpeg")
        errors.append("ffmpeg stream multiplexer is not installed (required for video/audio merge & MP3).")

    from service.distro import detect_distro
    distro_info = detect_distro()

    script_name = "setup-windows.bat" if sys.platform == "win32" else ("setup-mac.sh" if sys.platform == "darwin" else "setup-linux.sh")
    setup_script = str(project_dir / script_name)

    return {
        "status": "ok",
        "python_version": sys.version.split()[0],
        "platform": sys.platform,
        "distro": distro_info,
        "project_dir": str(project_dir),
        "setup_script": setup_script,
        "yt_dlp": {"ok": yt_dlp_ok, "path": yt_dlp_path},
        "ffmpeg": {"ok": ffmpeg_ok, "path": ffmpeg_path},
        "service_alive": is_service_alive(port),
        "all_packages_ready": yt_dlp_ok and ffmpeg_ok,
        "missing": missing,
        "errors": errors,
    }


def run_setup(project_dir: Path) -> dict:
    venv_dir = project_dir / ".venv"
    venv_python = get_venv_python(project_dir)

    # 1. Ensure Python virtual environment exists
    if not venv_python.is_file():
        python_cmd = sys.executable
        if not python_cmd or not shutil.which(python_cmd):
            candidates = [
                "python3", "python3.15", "python3.14", "python3.13",
                "python3.12", "python3.11", "python3.10",
                "/opt/homebrew/bin/python3", "/usr/bin/python3",
                "python", "py",
            ]
            for cand in candidates:
                if shutil.which(cand):
                    python_cmd = shutil.which(cand)
                    break
        if not python_cmd:
            return {"status": "error", "error": "Python 3 was not found on your system."}
        try:
            subprocess.run([python_cmd, "-m", "venv", "--clear", str(venv_dir)], capture_output=True, text=True, timeout=60)
        except Exception as exc:
            return {"status": "error", "error": f"Failed creating virtual environment: {exc}"}

    venv_python = get_venv_python(project_dir)
    if not venv_python.is_file():
        return {"status": "error", "error": "Virtual environment python was not created."}

    # 2. Automated pip install of yt-dlp and standalone imageio-ffmpeg
    try:
        pip_cmd = [
            str(venv_python),
            "-m",
            "pip",
            "install",
            "--quiet",
            "--upgrade",
            "pip",
            "yt-dlp[default]",
            "imageio-ffmpeg",
        ]
        res = subprocess.run(pip_cmd, cwd=str(project_dir), capture_output=True, text=True, timeout=180)
        if res.returncode != 0:
            fallback = [str(venv_python), "-m", "pip", "install", "--quiet", "yt-dlp[default]", "imageio-ffmpeg"]
            subprocess.run(fallback, cwd=str(project_dir), capture_output=True, text=True, timeout=120)
    except Exception as exc:
        return {"status": "error", "error": f"pip install error: {exc}"}

    # 3. Automatically link standalone ffmpeg to .venv/bin/ffmpeg or .venv/Scripts/ffmpeg.exe
    try:
        script = (
            "import os, sys, shutil, imageio_ffmpeg\n"
            "src = imageio_ffmpeg.get_ffmpeg_exe()\n"
            "bin_name = 'Scripts' if sys.platform.startswith('win') else 'bin'\n"
            "exe_ext = '.exe' if sys.platform.startswith('win') else ''\n"
            "dst = os.path.join(sys.prefix, bin_name, 'ffmpeg' + exe_ext)\n"
            "if os.path.isfile(src):\n"
            "    if os.path.islink(dst) or os.path.exists(dst):\n"
            "        try:\n"
            "            os.remove(dst)\n"
            "        except OSError:\n"
            "            pass\n"
            "    try:\n"
            "        os.symlink(src, dst)\n"
            "    except OSError:\n"
            "        shutil.copy2(src, dst)\n"
            "    try:\n"
            "        os.chmod(dst, 0o755)\n"
            "    except OSError:\n"
            "        pass\n"
        )
        subprocess.run([str(venv_python), "-c", script], capture_output=True, timeout=15)
    except Exception:
        pass

    # 4. Refresh native messaging host registration
    if sys.platform != "win32":
        install_script = project_dir / "scripts" / "install-native-host.sh"
        if install_script.is_file():
            try:
                subprocess.run(["sh", str(install_script)], cwd=str(project_dir), capture_output=True, timeout=15)
            except Exception:
                pass
    else:
        install_bat = project_dir / "scripts" / "install-native-host.bat"
        if install_bat.is_file():
            try:
                subprocess.run(["cmd.exe", "/c", str(install_bat)], cwd=str(project_dir), capture_output=True, timeout=15)
            except Exception:
                pass

    return {"status": "setup_done", "ok": True}


def main() -> None:
    message = read_native_message()
    if not message:
        return

    action = message.get("action", "start")
    project_dir = Path(__file__).resolve().parent.parent
    venv_python = get_venv_python(project_dir)
    python_bin = str(venv_python) if venv_python.is_file() else (sys.executable or "python3")
    port = int(message.get("port") or os.environ.get("OKJA_PORT", str(DEFAULT_PORT)))

    if action in {"start", "start_service", "launch"}:
        if not is_service_alive(port):
            # Launch service with a 25-second idle timeout so it auto-exits after queue completion
            cmd = [
                python_bin,
                "-m",
                "service.app",
                "--port",
                str(port),
                "--idle-timeout",
                "25",
            ]
            subprocess.Popen(
                cmd,
                cwd=str(project_dir),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
                env=os.environ.copy(),
            )
            # Wait up to 3.5s for service to spin up
            for _ in range(35):
                time.sleep(0.1)
                if is_service_alive(port):
                    break

        send_native_message({"status": "started", "port": port, "ok": is_service_alive(port)})

    elif action in {"check", "health", "diagnostics"}:
        diag = get_diagnostics(project_dir, port)
        send_native_message(diag)

    elif action in {"setup", "install", "reinstall"}:
        setup_result = run_setup(project_dir)
        diag = get_diagnostics(project_dir, port)
        send_native_message({**diag, **setup_result})

    elif action in {"stop", "shutdown"}:
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/shutdown",
                data=b"{}",
                headers={
                    "Origin": "chrome-extension://enfcgiajdbdmggdicbjndajnmlmolflo",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                send_native_message({"status": "stopped", "ok": True})
        except Exception as exc:
            send_native_message({"status": "already_stopped", "error": str(exc)})

    elif action == "ping":
        send_native_message({"status": "pong", "service_alive": is_service_alive(port)})

    else:
        send_native_message({"error": f"Unknown action: {action}"})


if __name__ == "__main__":
    main()
