# Contributing to Okja YouTube Saver

Thank you for your interest in contributing to **Okja YouTube Saver**! We welcome contributions from developers of all experience levels—whether you're fixing bugs, adding support for new Linux distributions, improving the UI/UX, optimizing download speed, or enhancing documentation.

This guide provides everything you need to get set up, understand the architecture, write and test code, and submit pull requests.

---

## Table of Contents

- [Core Principles & Ethics](#core-principles--ethics)
- [Repository Architecture](#repository-architecture)
- [Prerequisites](#prerequisites)
- [Quick Development Setup](#quick-development-setup)
- [Loading the Extension in Your Browser](#loading-the-extension-in-your-browser)
- [Development Workflow](#development-workflow)
- [Code Guidelines & Standards](#code-guidelines--standards)
  - [Frontend / Extension (JavaScript & CSS)](#frontend--extension-javascript--css)
  - [Backend Companion Service (Python)](#backend-companion-service-python)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Building & Packaging](#building--packaging)
- [Submitting a Pull Request (PR)](#submitting-a-pull-request-pr)
- [Need Help?](#need-help)

---

## Core Principles & Ethics

1. **Local-First & Privacy-Focused**:
   - All media processing, downloading, remuxing, and file management must happen entirely on the user's local machine.
   - Never send video URLs, tokens, or telemetry to external third-party servers or analytics APIs.
2. **Zero DRM Bypassing**:
   - This tool is strictly for personal backups of public videos that the user owns or has permission to save.
   - Do **not** submit PRs that bypass DRM, access controls, private videos, or subscription paywalls.
3. **No External CDNs**:
   - Manifest V3 Content Security Policy (CSP) requires that all code, scripts, styles, and assets are hosted locally inside the extension package. Never load remote scripts (e.g. from unpkg, cdnjs, or Google Fonts).
4. **Minimal External Dependencies**:
   - The companion service is built on Python's standard library (`http.server`, `subprocess`, `urllib`, `threading`, `json`). Keep it that way to ensure zero installation headaches across Linux, macOS, and Windows.

---

## Repository Architecture

```
chrome-downloader/
├── extension/                 # Chrome/Chromium Manifest V3 Extension
│   ├── manifest.json          # Extension configuration & permissions
│   ├── background.js          # Service worker (lifecycle, native messaging, alarms)
│   ├── popup.html / .js       # Main action popup UI
│   ├── options.html / .js     # User preferences (format, bitrate, folders, naming)
│   ├── onboarding.html / .js  # Automated 1-click verification & installer UI
│   ├── share-menu.js          # In-page content script (YouTube download buttons & toasts)
│   └── shared.js              # Shared constants, default settings, and storage helpers
├── service/                   # Local Python Companion Service
│   ├── app.py                 # HTTP server, queue manager, yt-dlp & ffmpeg runner
│   └── native_host.py         # Native Messaging launcher for Chrome/Edge/Brave
├── scripts/                   # Cross-platform development & build utilities
│   ├── build.js               # Node.js CRX and clean ZIP packager
│   ├── setup.js / setup.py    # Environment installer (yt-dlp, standalone ffmpeg)
│   ├── test.js / check.sh     # Test runners and linting/syntax checks
│   ├── start-service.sh       # Service daemon launcher (Unix)
│   └── start-windows.bat      # Service daemon launcher (Windows)
├── tests/                     # Automated test suite
│   └── test_app.py            # Unit tests for requests, queues, commands, & security
├── dist/                      # Packaged release archives (distributable ZIPs)
├── CONTRIBUTING.md            # This contribution guide
├── README.md                  # Project overview & user documentation
└── package.json               # Node.js scripts and package definitions
```

---

## Prerequisites

Before starting development, ensure you have the following installed:

- **Git**
- **Python 3.11+** (Python 3.11, 3.12, 3.13, 3.14, or 3.15)
- **Node.js 18+** & **npm** (recommended for running tests and building packages)
- **Google Chrome**, **Chromium**, **Brave**, or **Microsoft Edge**

---

## Quick Development Setup

1. **Fork and Clone the Repository**:
   ```sh
   git clone https://github.com/<your-username>/chrome-downloader.git
   cd chrome-downloader
   ```

2. **Set Up the Virtual Environment & Dependencies**:
   You can set up the environment with a single command:
   ```sh
   npm run setup
   ```
   *Or use the platform-specific scripts:*
   - **Linux** (Ubuntu, Debian, Fedora, Arch, openSUSE):
     ```sh
     ./setup-linux.sh
     ```
   - **macOS**:
     ```sh
     ./setup-mac.sh
     ```
   - **Windows**:
     ```cmd
     setup-windows.bat
     ```

   This automatically creates `.venv/` and installs `yt-dlp` plus a standalone `ffmpeg` binary if one is not already present on your system `PATH`.

3. **Verify the Installation**:
   ```sh
   npm test
   ```
   All unit tests should pass.

---

## Loading the Extension in Your Browser

1. Open your browser and navigate to the extension manager:
   - **Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Edge**: `edge://extensions`
2. Enable **Developer mode** (toggle located in the top-right corner).
3. Click **Load unpacked**.
4. Select the **`extension/`** directory in your cloned repository.
5. The extension icon will appear in your browser toolbar, and the onboarding verification page will display.

---

## Development Workflow

### 1. Running the Local Companion Service
In development mode, you can run the service directly in your terminal to see real-time download logs and debugging messages:

```sh
npm start
```
Or with manual Python invocation:
```sh
OKJA_DEBUG=1 python3 -m service.app --port 43117
```

### 2. Debugging the Extension
- **Popup & Options Pages**: Right-click the popup or options page and select **Inspect** to open Chrome DevTools.
- **Background Service Worker**: In `chrome://extensions`, find Okja Saver and click **Inspect views: service worker** to view logs from `background.js`.
- **Content Script (`share-menu.js`)**: Open standard Chrome DevTools (`F12` or `Ctrl+Shift+I` / `Cmd+Option+I`) on any YouTube page. All toast notifications and button injections are logged to the page console.
- **Reloading Changes**: After modifying extension files, click the **Reload (↺)** icon on the extension card in `chrome://extensions`, then refresh any active YouTube tabs.

---

## Code Guidelines & Standards

### Frontend / Extension (JavaScript & CSS)

- **Strict Manifest V3 CSP**:
  - Never use inline `<script>` tags or inline HTML event handlers (e.g., `onclick="..."`). All logic must reside in external `.js` files loaded via `<script src="...">`.
  - Never use `eval()` or `new Function()`.
- **Vanilla JavaScript**:
  - We use modern vanilla ES6+ JavaScript. Avoid pulling in large frontend frameworks (React, Vue, etc.) for the extension popup and options pages; keep the extension ultra-fast, lightweight, and bloat-free.
- **Theme & Accessibility**:
  - Ensure UI components support both Light and Dark mode using CSS custom properties (`var(--yt-spec-...)` or extension root theme variables).
  - Include accessible attributes (`aria-label`, `role="status"`, semantic buttons) for assistive technologies.

### Backend Companion Service (Python)

- **Security First**:
  - **Always** bind the HTTP server to `127.0.0.1` (never `0.0.0.0`).
  - **Never** use `shell=True` with `subprocess`. Always pass commands as a safe argument list `[binary, *args]`.
  - Validate all incoming URLs with `normalize_youtube_url()`.
  - Check origin headers using `is_extension_origin()` to verify requests originate only from Chromium extensions.
- **Standard Library Preference**:
  - Do not introduce heavy dependencies like Flask, FastAPI, or Celery. Python's built-in `http.server`, `threading`, and `subprocess` keep the service small and cross-platform.
- **Cross-Platform Compatibility**:
  - Use `pathlib.Path` for filesystem operations rather than raw string concatenation.
  - Test or account for path separators on both Unix (`/`) and Windows (`\`).

---

## Testing & Quality Assurance

Before submitting any code changes, always run the full test suite and syntax checks:

```sh
# Run all tests and syntax verification
npm test
```

Or run Python unit tests directly:
```sh
python3 -m unittest discover tests -v
```

And check JavaScript syntax:
```sh
node --check extension/background.js
node --check extension/popup.js
node --check extension/options.js
node --check extension/share-menu.js
node --check extension/shared.js
node --check extension/onboarding.js
```

### Adding New Tests
If you add a new feature or fix a bug (e.g., adding a new audio bitrate, supporting a URL variation, or adding a prefix format), add corresponding test cases in [`tests/test_app.py`](tests/test_app.py).

---

## Building & Packaging

To compile a clean distributable release and verify packaging:

```sh
npm run build
```

This runs `scripts/build.js`, which:
1. Validates all extension manifest and JavaScript files.
2. Registers the Native Messaging Host for your local browser.
3. Packs the extension into `okja-youtube-saver.crx`.
4. Creates a clean, distributable ZIP in [`dist/okja-youtube-saver.zip`](dist/okja-youtube-saver.zip), strictly excluding `.git`, `.venv`, `.pem`, and cache files.

---

## Submitting a Pull Request (PR)

1. **Create a Feature Branch**:
   ```sh
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```
2. **Make Your Changes**: Keep commits focused and logically grouped.
3. **Commit with Clear Messages**:
   Follow conventional commits if possible:
   - `feat: add custom download folder picker`
   - `fix: resolve playlist button styling in YouTube dark theme`
   - `docs: improve Linux setup instructions for Fedora`
4. **Push Your Branch to GitHub**:
   ```sh
   git push origin feature/your-feature-name
   ```
5. **Open a Pull Request**:
   - Provide a clear title and description of your changes.
   - Describe what problem it solves and attach screenshots or console logs if applicable.
   - Confirm that `npm test` and `npm run build` pass without warnings.

---

## Need Help?

- Have a question or proposal? Open an [Issue on GitHub](https://github.com/jsrahman/chrome-downloader/issues).
- Encountered a bug? Please report it with your OS version, browser version, and any relevant console/terminal logs.

Thank you for helping make Okja YouTube Saver better for everyone! Happy coding! 🚀
