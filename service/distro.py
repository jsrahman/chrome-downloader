"""Linux distribution detection and package manager helper."""

from __future__ import annotations

import os
import shutil
import sys
from typing import Any


def detect_distro() -> dict[str, Any]:
    """Detect the current OS distribution and provide specific package commands."""
    if sys.platform == "darwin":
        return {
            "os": "macos",
            "name": "macOS",
            "family": "darwin",
            "pkg_mgr": "brew",
            "install_cmd": "brew install python ffmpeg && ./setup-mac.sh",
            "ffmpeg_cmd": "brew install ffmpeg",
        }
    if sys.platform in {"win32", "cygwin"}:
        return {
            "os": "windows",
            "name": "Windows",
            "family": "windows",
            "pkg_mgr": "winget",
            "install_cmd": "winget install Python.Python.3.12 Gyan.FFmpeg && setup-windows.bat",
            "ffmpeg_cmd": "winget install Gyan.FFmpeg",
        }

    # Linux detection
    distro_id = ""
    id_like: list[str] = []
    pretty_name = "Linux"

    # Check os-release in standard locations (/etc/os-release or /usr/lib/os-release)
    os_release_paths = ["/etc/os-release", "/usr/lib/os-release"]
    for path in os_release_paths:
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    for line in f:
                        line = line.strip()
                        if "=" in line and not line.startswith("#"):
                            k, v = line.split("=", 1)
                            v = v.strip("\"'")
                            if k == "ID":
                                distro_id = v.lower()
                            elif k == "ID_LIKE":
                                id_like = [x.lower() for x in v.split()]
                            elif k == "PRETTY_NAME":
                                pretty_name = v
                            elif k == "NAME" and pretty_name == "Linux":
                                pretty_name = v
                break
            except Exception:
                pass

    # Check legacy Fedora / RedHat release files if ID was not found
    if not distro_id or distro_id == "linux":
        if os.path.isfile("/etc/fedora-release"):
            distro_id = "fedora"
            id_like.append("fedora")
            try:
                with open("/etc/fedora-release", "r", encoding="utf-8", errors="replace") as f:
                    content = f.read().strip()
                    if content:
                        pretty_name = content
            except Exception:
                pretty_name = "Fedora Linux"
        elif os.path.isfile("/etc/redhat-release"):
            distro_id = "rhel"
            id_like.append("fedora")
            try:
                with open("/etc/redhat-release", "r", encoding="utf-8", errors="replace") as f:
                    content = f.read().strip()
                    if content:
                        pretty_name = content
            except Exception:
                pretty_name = "Red Hat Enterprise Linux"

    # 1. Fedora / RHEL / CentOS family
    rhel_ids = {"fedora", "rhel", "centos", "rocky", "almalinux", "amzn", "ol", "nobara", "bazzite", "ultramarine", "silverblue", "kinoite"}
    dnf_bin = "dnf5" if shutil.which("dnf5") else ("dnf" if shutil.which("dnf") else "")
    if distro_id in rhel_ids or any(x in rhel_ids for x in id_like) or (bool(dnf_bin) and not shutil.which("apt-get")):
        cmd = dnf_bin or "dnf"
        return {
            "os": "linux",
            "id": distro_id or "fedora",
            "name": pretty_name if pretty_name != "Linux" else "Fedora Linux",
            "family": "fedora",
            "pkg_mgr": cmd,
            "install_cmd": f"sudo {cmd} install -y python3 python3-pip",
            "ffmpeg_cmd": f"sudo {cmd} install -y ffmpeg-free || sudo {cmd} install -y ffmpeg",
        }

    # 2. Debian / Ubuntu family
    debian_ids = {"ubuntu", "debian", "linuxmint", "pop", "zorin", "elementary", "kali", "raspbian", "devuan"}
    if distro_id in debian_ids or any(x in debian_ids for x in id_like) or shutil.which("apt-get"):
        return {
            "os": "linux",
            "id": distro_id or "ubuntu",
            "name": pretty_name if pretty_name != "Linux" else "Ubuntu / Debian",
            "family": "debian",
            "pkg_mgr": "apt",
            "install_cmd": "sudo apt update && sudo apt install -y python3-venv ffmpeg && ./setup-linux.sh",
            "ffmpeg_cmd": "sudo apt install -y ffmpeg",
        }

    # 3. Arch Linux family
    arch_ids = {"arch", "manjaro", "endeavouros", "garuda", "artix", "arcolinux"}
    if distro_id in arch_ids or any(x in arch_ids for x in id_like) or shutil.which("pacman"):
        return {
            "os": "linux",
            "id": distro_id or "arch",
            "name": pretty_name if pretty_name != "Linux" else "Arch Linux",
            "family": "arch",
            "pkg_mgr": "pacman",
            "install_cmd": "sudo pacman -S --needed python python-pip ffmpeg && ./setup-linux.sh",
            "ffmpeg_cmd": "sudo pacman -S --needed ffmpeg",
        }

    # 4. openSUSE family
    suse_ids = {"opensuse", "sles", "opensuse-tumbleweed", "opensuse-leap"}
    if distro_id in suse_ids or any(x in suse_ids for x in id_like) or shutil.which("zypper"):
        return {
            "os": "linux",
            "id": distro_id or "opensuse",
            "name": pretty_name if pretty_name != "Linux" else "openSUSE",
            "family": "opensuse",
            "pkg_mgr": "zypper",
            "install_cmd": "sudo zypper install -y python3-pip python3-virtualenv ffmpeg && ./setup-linux.sh",
            "ffmpeg_cmd": "sudo zypper install -y ffmpeg",
        }

    # 5. Alpine Linux
    if distro_id == "alpine" or shutil.which("apk"):
        return {
            "os": "linux",
            "id": "alpine",
            "name": pretty_name if pretty_name != "Linux" else "Alpine Linux",
            "family": "alpine",
            "pkg_mgr": "apk",
            "install_cmd": "sudo apk add python3 py3-pip py3-virtualenv ffmpeg && ./setup-linux.sh",
            "ffmpeg_cmd": "sudo apk add ffmpeg",
        }

    # 6. Void Linux
    if distro_id == "void" or shutil.which("xbps-install"):
        return {
            "os": "linux",
            "id": "void",
            "name": pretty_name if pretty_name != "Linux" else "Void Linux",
            "family": "void",
            "pkg_mgr": "xbps",
            "install_cmd": "sudo xbps-install -Sy python3 ffmpeg && ./setup-linux.sh",
            "ffmpeg_cmd": "sudo xbps-install -Sy ffmpeg",
        }

    # 7. Solus
    if distro_id == "solus" or shutil.which("eopkg"):
        return {
            "os": "linux",
            "id": "solus",
            "name": pretty_name if pretty_name != "Linux" else "Solus",
            "family": "solus",
            "pkg_mgr": "eopkg",
            "install_cmd": "sudo eopkg install -y python3 ffmpeg && ./setup-linux.sh",
            "ffmpeg_cmd": "sudo eopkg install -y ffmpeg",
        }

    # 8. Gentoo
    if distro_id == "gentoo" or shutil.which("emerge"):
        return {
            "os": "linux",
            "id": "gentoo",
            "name": pretty_name if pretty_name != "Linux" else "Gentoo Linux",
            "family": "gentoo",
            "pkg_mgr": "emerge",
            "install_cmd": "sudo emerge --ask media-video/ffmpeg && ./setup-linux.sh",
            "ffmpeg_cmd": "sudo emerge --ask media-video/ffmpeg",
        }

    # If rpm is present, assume Fedora / RHEL family rather than generic
    if shutil.which("rpm"):
        return {
            "os": "linux",
            "id": "fedora",
            "name": pretty_name if pretty_name != "Linux" else "Fedora / RPM-based Linux",
            "family": "fedora",
            "pkg_mgr": "dnf",
            "install_cmd": "sudo dnf install -y python3-pip ffmpeg && ./setup-linux.sh",
            "ffmpeg_cmd": "sudo dnf install -y ffmpeg",
        }

    # Truly generic fallback: universal self-contained setup script
    return {
        "os": "linux",
        "id": "generic_linux",
        "name": pretty_name,
        "family": "linux",
        "pkg_mgr": "generic",
        "install_cmd": "./setup-linux.sh",
        "ffmpeg_cmd": "./setup-linux.sh",
    }
