# Okja YouTube Saver

A local-first Chrome/Chromium extension for downloading YouTube videos that you
own or have permission to save. The extension talks only to a companion service
on your computer; no third-party download API is used.

> You are responsible for following copyright law, the video's license, and
> YouTube's terms. This project does not bypass DRM or access controls.

## Requirements

- Python 3.11+
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp)
- `ffmpeg` (needed for merging video/audio and creating MP3 files)
- A supported JavaScript runtime such as Node.js (strongly recommended by
  yt-dlp for YouTube)
- Chrome, Chromium, Brave, or Edge

## Node.js & npm Build System

You can also use Node.js to build, test, and package Okja Saver cross-platform:

```sh
npm run build   # Validates extension, registers native host, and builds okja-youtube-saver.crx
npm run setup   # 1-click environment setup (creates .venv, installs yt-dlp & standalone ffmpeg)
npm test        # Runs unit tests and extension syntax validation
npm start       # Launches the companion service manually
```

## Quick start

### ⚡ 1-Click In-Browser Setup (No Terminal Commands Required)
1. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
2. Toggle on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension/` folder in this repository.
4. The **Setup & Package Verification** screen will open automatically.
5. Click **"⚡ 1-Click Automated Install & Verify"** — it installs `yt-dlp` and standalone `ffmpeg` automatically inside `.venv` without needing manual terminal commands.

---

### Command-Line Setup (From Local Folder)

Navigate to the directory where you unpacked the project and run the setup script:

#### On Linux (Ubuntu, Debian, Fedora, Arch, openSUSE)
```sh
cd /path/to/okja-youtube-saver
./setup-linux.sh   # (or: npm run setup)
```

#### On macOS
```sh
brew install python@3.15 ffmpeg
./setup-mac.sh     # (or: npm run setup)
```

#### On Windows
Double-click **`setup-windows.bat`** (or run `npm run setup`).

---

### In Your Browser (Chrome / Chromium / Brave / Edge)
1. Open `chrome://extensions` (or `edge://extensions`).
2. Toggle on **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension` folder in this repository.
4. The **Setup & Package Verification** screen will automatically open to verify that all packages (`yt-dlp`, `ffmpeg`, Python 3) are ready.
5. On any YouTube video, click the extension icon or the YouTube **Share** ➔ **Download with Okja Saver** button.

By default files are saved to `~/Downloads/Okja YouTube Saver`. Override this:

```sh
OKJA_DOWNLOAD_DIR="/absolute/path" ./scripts/start-service.sh
```

## Development

```sh
./scripts/check.sh
```

The check script validates Python syntax, JSON files, and runs unit tests.

## Troubleshooting

- **Service does not start automatically** — Run `./scripts/install-native-host.sh` once to register the on-demand native launcher with your browser.
- **Service unavailable** — Start `./scripts/start-service.sh`, then confirm the
  port in extension settings (default: `43117`).
- **`yt-dlp` not found** — Run `./scripts/setup.sh`, or install `yt-dlp` and make
  sure it is available on `PATH`.
- **Merge/conversion error** — Install `ffmpeg` and retry.
- **YouTube changed something** — Update `yt-dlp` with
  `python3 -m pip install --upgrade yt-dlp`.

## Files

- [`project.md`](project.md) — plan and acceptance criteria.
- [`agent.md`](agent.md) — contributor/agent instructions.
- [`extension/`](extension/) — browser extension.
- [`service/`](service/) — local companion service.
