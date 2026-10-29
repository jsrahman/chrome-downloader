#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
venv_dir="$project_dir/.venv"

# 1. Detect Operating System & Linux Distribution
os_type=$(uname -s 2>/dev/null || echo "Unknown")
distro_name="$os_type"
pkg_cmd=""
ffmpeg_cmd=""

if [ "$os_type" = "Linux" ]; then
  os_rel=""
  if [ -f /etc/os-release ]; then
    os_rel="/etc/os-release"
  elif [ -f /usr/lib/os-release ]; then
    os_rel="/usr/lib/os-release"
  fi

  distro_id=""
  distro_like=""
  if [ -n "$os_rel" ]; then
    distro_id=$(grep '^ID=' "$os_rel" | head -n1 | cut -d= -f2 | tr -d '"'\'' ' | tr '[:upper:]' '[:lower:]')
    distro_like=$(grep '^ID_LIKE=' "$os_rel" | head -n1 | cut -d= -f2 | tr -d '"'\'' ' | tr '[:upper:]' '[:lower:]')
    distro_name=$(grep '^PRETTY_NAME=' "$os_rel" | head -n1 | cut -d= -f2- | tr -d '"'\''')
    [ -z "$distro_name" ] && distro_name=$(grep '^NAME=' "$os_rel" | head -n1 | cut -d= -f2- | tr -d '"'\''')
  fi

  if [ -z "$distro_id" ]; then
    if [ -f /etc/fedora-release ]; then
      distro_id="fedora"
      distro_name=$(cat /etc/fedora-release 2>/dev/null || echo "Fedora Linux")
    elif [ -f /etc/redhat-release ]; then
      distro_id="rhel"
      distro_name=$(cat /etc/redhat-release 2>/dev/null || echo "Red Hat Enterprise Linux")
    fi
  fi

  # Detect package manager binaries
  has_dnf5=0
  has_dnf=0
  has_rpm=0
  command -v dnf5 >/dev/null 2>&1 && has_dnf5=1
  command -v dnf >/dev/null 2>&1 && has_dnf=1
  command -v rpm >/dev/null 2>&1 && has_rpm=1

  case "$distro_id" in
    fedora*|rhel*|centos*|rocky*|almalinux*|nobara*|bazzite*|ultramarine*)
      if [ "$has_dnf5" -eq 1 ]; then
        pkg_cmd="sudo dnf5 install -y python3 python3-pip"
        ffmpeg_cmd="sudo dnf5 install -y ffmpeg-free 2>/dev/null || sudo dnf5 install -y ffmpeg 2>/dev/null || true"
      else
        pkg_cmd="sudo dnf install -y python3 python3-pip"
        ffmpeg_cmd="sudo dnf install -y ffmpeg-free 2>/dev/null || sudo dnf install -y ffmpeg 2>/dev/null || true"
      fi
      ;;
    ubuntu|debian|linuxmint|pop|zorin|elementary|kali|raspbian)
      pkg_cmd="sudo apt update && sudo apt install -y python3 python3-pip python3-venv ffmpeg"
      ffmpeg_cmd="sudo apt install -y ffmpeg"
      ;;
    arch|manjaro|endeavouros|garuda|artix|arcolinux)
      pkg_cmd="sudo pacman -S --needed python python-pip ffmpeg"
      ffmpeg_cmd="sudo pacman -S --needed ffmpeg"
      ;;
    opensuse*|sles)
      pkg_cmd="sudo zypper install -y python3 python3-pip python3-virtualenv ffmpeg"
      ffmpeg_cmd="sudo zypper install -y ffmpeg"
      ;;
    alpine)
      pkg_cmd="sudo apk add python3 py3-pip py3-virtualenv ffmpeg"
      ffmpeg_cmd="sudo apk add ffmpeg"
      ;;
    void)
      pkg_cmd="sudo xbps-install -Sy python3 ffmpeg"
      ffmpeg_cmd="sudo xbps-install -Sy ffmpeg"
      ;;
    solus)
      pkg_cmd="sudo eopkg install -y python3 ffmpeg"
      ffmpeg_cmd="sudo eopkg install -y ffmpeg"
      ;;
    gentoo)
      pkg_cmd="sudo emerge --ask media-video/ffmpeg"
      ffmpeg_cmd="sudo emerge --ask media-video/ffmpeg"
      ;;
    *)
      # Fallback detection using ID_LIKE or available package managers
      case "$distro_like" in
        *fedora*|*rhel*)
          if [ "$has_dnf5" -eq 1 ]; then
            pkg_cmd="sudo dnf5 install -y python3 python3-pip"
            ffmpeg_cmd="sudo dnf5 install -y ffmpeg-free 2>/dev/null || sudo dnf5 install -y ffmpeg 2>/dev/null || true"
          else
            pkg_cmd="sudo dnf install -y python3 python3-pip"
            ffmpeg_cmd="sudo dnf install -y ffmpeg-free 2>/dev/null || sudo dnf install -y ffmpeg 2>/dev/null || true"
          fi
          ;;
        *debian*|*ubuntu*)
          pkg_cmd="sudo apt update && sudo apt install -y python3 python3-pip python3-venv ffmpeg"
          ffmpeg_cmd="sudo apt install -y ffmpeg"
          ;;
        *arch*)
          pkg_cmd="sudo pacman -S --needed python python-pip ffmpeg"
          ffmpeg_cmd="sudo pacman -S --needed ffmpeg"
          ;;
        *)
          if [ "$has_dnf5" -eq 1 ]; then
            pkg_cmd="sudo dnf5 install -y python3 python3-pip"
            ffmpeg_cmd="sudo dnf5 install -y ffmpeg-free 2>/dev/null || sudo dnf5 install -y ffmpeg 2>/dev/null || true"
          elif [ "$has_dnf" -eq 1 ] || [ "$has_rpm" -eq 1 ]; then
            pkg_cmd="sudo dnf install -y python3 python3-pip"
            ffmpeg_cmd="sudo dnf install -y ffmpeg-free 2>/dev/null || sudo dnf install -y ffmpeg 2>/dev/null || true"
          elif command -v apt-get >/dev/null 2>&1; then
            pkg_cmd="sudo apt update && sudo apt install -y python3 python3-pip python3-venv ffmpeg"
            ffmpeg_cmd="sudo apt install -y ffmpeg"
          elif command -v pacman >/dev/null 2>&1; then
            pkg_cmd="sudo pacman -S --needed python python-pip ffmpeg"
            ffmpeg_cmd="sudo pacman -S --needed ffmpeg"
          elif command -v zypper >/dev/null 2>&1; then
            pkg_cmd="sudo zypper install -y python3 python3-pip python3-virtualenv ffmpeg"
            ffmpeg_cmd="sudo zypper install -y ffmpeg"
          fi
          ;;
      esac
      ;;
  esac
fi

echo "=================================================="
echo " Okja YouTube Saver - Setup for $distro_name"
echo "=================================================="

# 2. Find a valid Python 3.10+ binary
python_cmd=""
for candidate in python3 python3.15 python3.14 python3.13 python3.12 python3.11 python3.10 /opt/homebrew/bin/python3 python; do
  if [ -x "$candidate" ] || command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" 2>/dev/null; then
      python_cmd="$candidate"
      break
    fi
  fi
done

if [ -z "$python_cmd" ]; then
  echo "Error: Python 3.10 or newer is required." >&2
  echo "" >&2
  if [ -n "$pkg_cmd" ]; then
    echo "To install on $distro_name, run:" >&2
    echo "  $pkg_cmd" >&2
  else
    echo "Install Python on your distribution:" >&2
    if [ "$has_dnf5" -eq 1 ] || [ "$has_dnf" -eq 1 ] || [ "$has_rpm" -eq 1 ]; then
      echo "  Fedora/RHEL:        sudo dnf install -y python3 python3-pip ffmpeg" >&2
    elif command -v apt-get >/dev/null 2>&1; then
      echo "  Ubuntu/Debian/Mint: sudo apt update && sudo apt install -y python3 python3-pip python3-venv ffmpeg" >&2
    else
      echo "  Fedora/RHEL:        sudo dnf install -y python3 python3-pip ffmpeg" >&2
      echo "  Ubuntu/Debian/Mint: sudo apt update && sudo apt install -y python3 python3-pip python3-venv ffmpeg" >&2
      echo "  Arch/Manjaro:       sudo pacman -S --needed python python-pip ffmpeg" >&2
      echo "  openSUSE:           sudo zypper install -y python3 python3-pip python3-virtualenv ffmpeg" >&2
      echo "  Alpine Linux:       sudo apk add python3 py3-pip py3-virtualenv ffmpeg" >&2
      echo "  macOS (Homebrew):   brew install python ffmpeg" >&2
    fi
  fi
  exit 1
fi

echo "✓ Using Python: $($python_cmd --version) ($python_cmd)"

# 3. Create virtual environment
if ! "$python_cmd" -m venv --clear "$venv_dir" 2>/dev/null; then
  echo "" >&2
  echo "Failed to create virtual environment at $venv_dir." >&2
  if [ -n "$pkg_cmd" ]; then
    echo "Try running:" >&2
    echo "  $pkg_cmd" >&2
  elif [ "$has_dnf5" -eq 1 ] || [ "$has_dnf" -eq 1 ] || [ "$has_rpm" -eq 1 ]; then
    echo "On Fedora/RHEL, run:" >&2
    echo "  sudo dnf install -y python3-pip python3-libs" >&2
  elif command -v apt-get >/dev/null 2>&1; then
    echo "On Debian/Ubuntu, install python3-venv:" >&2
    echo "  sudo apt install -y python3-venv" >&2
  else
    echo "Try running: ./setup-linux.sh" >&2
  fi
  exit 1
fi

echo "✓ Installing/updating pip, yt-dlp, and ffmpeg in local virtual environment..."
"$venv_dir/bin/python" -m pip install --quiet --upgrade pip
"$venv_dir/bin/python" -m pip install --quiet --upgrade "yt-dlp[default]" imageio-ffmpeg

# 3b. Link standalone ffmpeg binary into .venv/bin/ffmpeg
"$venv_dir/bin/python" -c "
import os, sys, shutil
try:
    import imageio_ffmpeg
    src = imageio_ffmpeg.get_ffmpeg_exe()
    dst = os.path.join(sys.prefix, 'bin', 'ffmpeg')
    if os.path.isfile(src):
        if os.path.islink(dst) or os.path.exists(dst):
            try:
                os.remove(dst)
            except OSError:
                pass
        try:
            os.symlink(src, dst)
        except OSError:
            shutil.copy2(src, dst)
        try:
            os.chmod(dst, 0o755)
        except OSError:
            pass
except Exception:
    pass
" 2>/dev/null || true

# 4. Check for ffmpeg
if [ -x "$venv_dir/bin/ffmpeg" ]; then
  echo "✓ Standalone ffmpeg ready: $venv_dir/bin/ffmpeg"
elif command -v ffmpeg >/dev/null 2>&1; then
  echo "✓ System ffmpeg found: $(command -v ffmpeg)"
else
  echo ""
  echo "Notice: ffmpeg was not found. If high-resolution merge or MP3 conversion fails, run:"
  if [ -n "$ffmpeg_cmd" ]; then
    echo "  $ffmpeg_cmd"
  elif [ "$has_dnf5" -eq 1 ] || [ "$has_dnf" -eq 1 ] || [ "$has_rpm" -eq 1 ]; then
    echo "  Fedora:        sudo dnf install -y ffmpeg-free"
  elif command -v apt-get >/dev/null 2>&1; then
    echo "  Ubuntu/Debian: sudo apt install -y ffmpeg"
  else
    echo "  Fedora:        sudo dnf install -y ffmpeg-free"
    echo "  Ubuntu/Debian: sudo apt install -y ffmpeg"
    echo "  Arch/Manjaro:  sudo pacman -S --needed ffmpeg"
    echo "  openSUSE:      sudo zypper install -y ffmpeg"
    echo "  Alpine Linux:  sudo apk add ffmpeg"
    echo "  macOS:         brew install ffmpeg"
  fi
fi

# Ensure all helper scripts have executable bits
chmod +x "$project_dir"/scripts/*.sh "$project_dir"/service/*.py "$project_dir"/setup-*.sh 2>/dev/null || true

# 5. Automatically register Native Messaging Host
if [ -f "$project_dir/scripts/install-native-host.sh" ]; then
  echo ""
  sh "$project_dir/scripts/install-native-host.sh"
fi

echo ""
echo "Setup complete! Okja Saver will start automatically on demand"
echo "and cleanly shut down when all downloads finish."
