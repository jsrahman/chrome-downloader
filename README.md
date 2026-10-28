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

## Quick start

### On macOS
```sh
brew install python@3.15 ffmpeg
./scripts/setup.sh
./scripts/install-launchagent.sh
```
*(Or double-click `start-mac.sh` to run manually in foreground)*

### On Windows
In PowerShell:
```powershell
winget install Python.Python.3.12 Gyan.FFmpeg
```
Then double-click **`setup-windows.bat`** (or `scripts\setup.bat`), followed by **`start-windows.bat`**.

---

### In Your Browser (Chrome / Brave / Edge)
1. Open `chrome://extensions` (or `edge://extensions`).
2. Toggle on **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension` folder in this repository.
4. On any YouTube video, click the extension icon or the YouTube **Share** ➔ **Download with Okja Saver** button.

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
