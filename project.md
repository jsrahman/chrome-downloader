# Okja YouTube Saver

## Goal

Build a small Chrome/Chromium extension that lets a user send the current
YouTube video to a local download service. The service uses `yt-dlp` and saves
the result on the user's own computer.

The tool is intended only for videos the user owns, videos that are licensed
for download, or videos the user otherwise has permission to save. It does not
attempt to bypass DRM, paid access, private-video permissions, or geographic
restrictions.

## Architecture

1. **Browser extension (Manifest V3)**
   - Detects the active YouTube video URL.
   - Lets the user choose video or audio and select a quality.
   - Sends a request to a service bound to `127.0.0.1`.
   - Polls and displays progress, completion, and errors.
2. **Local companion service (Python)**
   - Accepts only requests from Chrome-extension origins.
   - Validates that submitted URLs are YouTube watch/short/live URLs.
   - Runs `yt-dlp` without a shell and tracks progress.
   - Saves files to a configured directory.

## Milestones

- [x] Define the extension/service boundary and safety constraints.
- [x] Create the Manifest V3 extension UI and background worker.
- [x] Add an Okja Saver action to YouTube's Share dialog.
- [x] Create the authenticated local download service.
- [x] Add installation and launcher scripts.
- [x] Add automated tests for URL, origin, and request validation.
- [ ] Load the unpacked extension in the user's browser and complete a real
      download on the user's machine.

## Success criteria

- The popup recognizes supported YouTube pages.
- A download can start from a supported YouTube video page.
- The service rejects unsupported hosts, malformed requests, and explicitly
  supplied non-extension browser origins.
- Video and audio jobs expose useful progress and error states.
- Setup and local development are documented and reproducible.

## Non-goals

- A hosted downloader or proxy.
- Playlist/channel bulk downloading.
- DRM or access-control circumvention.
- Browser-store publication.

## Manual acceptance test

1. Install `yt-dlp` and `ffmpeg`.
2. Run `./scripts/start-service.sh`.
3. Load `extension/` as an unpacked extension.
4. Verify the connection in extension settings.
5. Open a YouTube video that you are allowed to download.
6. Download one video and one audio-only file.
7. Confirm progress reaches 100% and the output appears in the configured
   download directory.
