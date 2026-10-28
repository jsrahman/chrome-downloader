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

```sh
brew install python@3.15 deno ffmpeg
./scripts/setup.sh
./scripts/install-launchagent.sh
```

`install-launchagent.sh` installs a macOS background service that starts automatically on login, so you never need to keep a terminal open.

If you prefer running in foreground manually instead:
```sh
./scripts/start-service.sh
```

Then open your browser's extensions page, enable **Developer mode**, choose
**Load unpacked**, and select the `extension` directory in this repository.

Open the extension, select **Settings**, and use **Test connection**. On a
supported YouTube video page, choose a format and start the download.

You can also click YouTube's **Share** button and choose **Download with Okja
Saver**. It opens the same download screen in a new tab.

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
