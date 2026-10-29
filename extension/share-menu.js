(() => {
  const TOOLBAR_CONTAINER_ID = "okja-toolbar-download";
  const PLAYLIST_BTN_ID = "okja-playlist-download-wrapper";
  const SHARE_ACTION_ID = "okja-share-download";

  // Icons
  const DOWNLOAD_ICON_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: block; width: 22px; height: 22px;">
      <path d="M17 18v1H6v-1h11zm-.5-6.6-.7-.7-3.8 3.7V4h-1v10.4l-3.8-3.8-.7.7 5 5 5-5z" fill="currentColor"></path>
    </svg>`;

  const USER_QUEUE_ICON_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none; display: inherit; width: 22px; height: 22px;">
      <path d="M12 2.00012C17.5228 2.00012 22 6.47727 22 12.0001C22 17.523 17.5228 22.0001 12 22.0001C6.47715 22.0001 2 17.523 2 12.0001M8.909 2.48699C7.9 2.8146 6.96135 3.29828 6.12153 3.90953M3.90943 6.12162C3.29806 6.9616 2.81432 7.90044 2.4867 8.90964"></path>
      <path d="M12 8.00012V16.0001M16 12.0001L8 12.0001"></path>
    </svg>`;

  const PLAYLIST_ICON_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" color="currentColor" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none; display: block; width: 22px; height: 22px;">
      <path d="M14 21.5H10C6.71252 21.5 5.06878 21.5 3.96243 20.592C3.75989 20.4258 3.57418 20.2401 3.40796 20.0376C2.5 18.9312 2.5 17.2875 2.5 14C2.5 10.7125 2.5 9.06878 3.40796 7.96243C3.57418 7.75989 3.75989 7.57418 3.96243 7.40796C5.06878 6.5 6.71252 6.5 10 6.5H14C17.2875 6.5 18.9312 6.5 20.0376 7.40796C20.2401 7.57418 20.4258 7.75989 20.592 7.96243C21.5 9.06878 21.5 10.7125 21.5 14C21.5 17.2875 21.5 18.9312 20.592 20.0376C20.4258 20.2401 20.2401 20.4258 20.0376 20.592C18.9312 21.5 17.2875 21.5 14 21.5Z"></path>
      <path d="M2.5 14.5V10.5C2.5 6.72876 2.5 4.84315 3.67157 3.67157C4.84315 2.5 6.72876 2.5 10.5 2.5H13.5C17.2712 2.5 19.1569 2.5 20.3284 3.67157C21.5 4.84315 21.5 6.72876 21.5 10.5V14.5"></path>
      <path d="M15 14.5C15 14.5 12.7905 17.4999 12 17.4999C11.2094 17.5 9 14.4999 9 14.4999M12 17L12 10.5"></path>
    </svg>`;

  const MENU_DOWNLOAD_ICON_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;">
      <path d="M12 2a1 1 0 00-1 1v11.586l-4.293-4.293a1 1 0 10-1.414 1.414L12 18.414l6.707-6.707a1 1 0 10-1.414-1.414L13 14.586V3a1 1 0 00-1-1Zm7 18H5a1 1 0 000 2h14a1 1 0 000-2Z" fill="currentColor"></path>
    </svg>`;

  let currentStatus = { activeJob: null, queue: [], queueCount: 0 };
  let lastIconState = "";
  let lastActiveJob = null;
  let lastContextVideo = null;
  let lastSharedVideoContext = null;

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }

  function isVideoWatchPage() {
    const path = window.location.pathname;
    return path === "/watch" || path.startsWith("/shorts") || path.startsWith("/live");
  }

  // Minimal Clean Alert Configurations (Bottom-Left)
  const ALERT_CONFIGS = {
    start: {
      color: "#38bdf8",
      className: "toast-start",
      defaultTitle: "Download Started",
      iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 002 2h16a2 2 0 002-2v-2"/></svg>`,
    },
    queue: {
      color: "#f59e0b",
      className: "toast-queue",
      defaultTitle: "Added to Queue",
      iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6m0 0l-3-3m3 3l3-3"/><path d="M4 12h16M4 18h16"/></svg>`,
    },
    complete: {
      color: "#b8f548",
      className: "toast-complete",
      defaultTitle: "Download Complete",
      iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b8f548" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    },
    cancelled: {
      color: "#a855f7",
      className: "toast-cancelled",
      defaultTitle: "Download Cancelled",
      iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    },
    error: {
      color: "#ff5252",
      className: "toast-error",
      defaultTitle: "Download Failed",
      iconSvg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff5252" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    },
  };

  let lastAlertHash = "";
  let lastAlertTime = 0;

  function getToastContainer() {
    let container = document.getElementById("okja-toast-container");
    if (!container || !container.isConnected) {
      container = document.createElement("div");
      container.id = "okja-toast-container";
      (document.body || document.documentElement).appendChild(container);
    }
    return container;
  }

  function showAlert(type, text, customTitle, timer = 3400) {
    const config = ALERT_CONFIGS[type] || ALERT_CONFIGS.start;
    const titleText = customTitle || config.defaultTitle;
    const safeText = text ? String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
    const safeTitle = String(titleText).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Debounce duplicate identical alerts within 800ms
    const alertHash = `${type}:${safeTitle}:${safeText}`;
    const now = Date.now();
    if (alertHash === lastAlertHash && (now - lastAlertTime) < 800) {
      return;
    }
    lastAlertHash = alertHash;
    lastAlertTime = now;

    const container = getToastContainer();

    // Limit maximum stacked toasts to 3
    while (container.children.length >= 3) {
      container.firstElementChild?.remove();
    }

    const toast = document.createElement("div");
    toast.className = `okja-clean-toast ${config.className}`;
    toast.setAttribute("role", "status");
    toast.innerHTML = `
      <div class="okja-toast-badge" aria-hidden="true">
        ${config.iconSvg}
      </div>
      <div class="okja-toast-body">
        <div class="okja-toast-heading">${safeTitle}</div>
        ${safeText ? `<div class="okja-toast-detail" title="${safeText}">${safeText}</div>` : ""}
      </div>
      <button type="button" class="okja-toast-close" title="Dismiss" aria-label="Dismiss">✕</button>
      <div class="okja-toast-progress">
        <div class="okja-toast-bar"></div>
      </div>
    `;

    container.appendChild(toast);

    const bar = toast.querySelector(".okja-toast-bar");
    const closeBtn = toast.querySelector(".okja-toast-close");

    let remainingTime = timer;
    let startTime = Date.now();
    let dismissTimeout = null;
    let isDismissed = false;

    function dismiss() {
      if (isDismissed) return;
      isDismissed = true;
      if (dismissTimeout) clearTimeout(dismissTimeout);
      toast.classList.add("hiding");
      setTimeout(() => {
        toast.remove();
        if (container.children.length === 0) {
          container.remove();
        }
      }, 160);
    }

    function startTimer() {
      if (bar) {
        bar.style.transition = `transform ${remainingTime}ms linear`;
        bar.style.transform = "scaleX(0)";
      }
      dismissTimeout = setTimeout(dismiss, remainingTime);
    }

    function pauseTimer() {
      if (isDismissed || !dismissTimeout) return;
      clearTimeout(dismissTimeout);
      dismissTimeout = null;
      const elapsed = Date.now() - startTime;
      remainingTime = Math.max(0, remainingTime - elapsed);
      if (bar) {
        const currentFraction = remainingTime / timer;
        bar.style.transition = "none";
        bar.style.transform = `scaleX(${currentFraction})`;
      }
    }

    function resumeTimer() {
      if (isDismissed || remainingTime <= 0) {
        dismiss();
        return;
      }
      startTime = Date.now();
      startTimer();
    }

    toast.addEventListener("mouseenter", pauseTimer);
    toast.addEventListener("mouseleave", resumeTimer);
    if (closeBtn) {
      closeBtn.addEventListener("click", dismiss);
    }

    requestAnimationFrame(() => {
      startTimer();
    });
  }

  function fetchStatus() {
    try {
      chrome.runtime.sendMessage({ type: "get-status" }, (res) => {
        if (chrome.runtime.lastError || !res?.ok || !res?.data) return;
        const previousActive = lastActiveJob;
        currentStatus = res.data;
        lastActiveJob = currentStatus.activeJob;

        // Trigger completion toast if active job finished
        if (previousActive && previousActive.status === "downloading" && (!currentStatus.activeJob || currentStatus.activeJob.id !== previousActive.id)) {
          const fn = previousActive.filename ? previousActive.filename.split("/").pop() : "";
          showAlert("complete", fn || (previousActive.title ? `"${previousActive.title}" saved to downloads.` : "Video saved to downloads folder."), undefined, 4500);
        }

        updateAllElements();
      });
    } catch (_e) {
      // Extension context invalidated
    }
  }

  function updateAllElements() {
    updateToolbarButtonState();
    addDropdownMenuItems();
  }

  function updateToolbarButtonState() {
    const btn = document.querySelector(`#${TOOLBAR_CONTAINER_ID} .okja-yt-btn`);
    if (!btn) return;

    const iconSpan = btn.querySelector(".okja-btn-icon-wrapper");
    const hasActive = Boolean(currentStatus.activeJob && ["downloading", "queued"].includes(currentStatus.activeJob.status));

    const targetIcon = hasActive ? "queue" : "download";
    if (lastIconState !== targetIcon) {
      lastIconState = targetIcon;
      if (iconSpan) {
        iconSpan.innerHTML = hasActive ? USER_QUEUE_ICON_SVG : DOWNLOAD_ICON_SVG;
      }
    }

    const titleText = hasActive
      ? `Active: ${currentStatus.activeJob.title || "Downloading video"}. Click to add this video to queue.`
      : "Download with Okja Saver";
    btn.title = titleText;
    btn.setAttribute("aria-label", titleText);
  }

  // Unified download function: starts immediately if idle, queues if busy
  async function downloadVideoWithPreferences(url, title, triggerBtn) {
    if (triggerBtn) {
      triggerBtn.style.opacity = "0.6";
      triggerBtn.disabled = true;
    }

    try {
      const settings = await chrome.storage.local.get({
        defaultKind: "video",
        defaultQuality: "1080",
        prefixType: "number",
        customPrefix: "",
        downloadFolder: "",
        channels: 8,
      });

      const targetUrl = url || window.location.href;
      const targetTitle = (title || document.title.replace(/\s*-\s*YouTube\s*$/, "")).trim();

      chrome.runtime.sendMessage({
        type: "start-download",
        url: targetUrl,
        kind: settings.defaultKind || "video",
        quality: settings.defaultQuality || "1080",
        title: targetTitle,
        prefixType: settings.prefixType || "number",
        customPrefix: settings.customPrefix || "",
        folder: settings.downloadFolder || "",
        channels: settings.channels || 8,
      }, (res) => {
        if (triggerBtn) {
          triggerBtn.style.opacity = "";
          triggerBtn.disabled = false;
        }

        if (chrome.runtime.lastError || !res?.ok) {
          const err = res?.error || chrome.runtime.lastError?.message || "Local service unavailable.";
          showAlert("error", err);
          return;
        }

        if (res.queued) {
          showAlert("queue", targetTitle ? `"${targetTitle}" added to queue.` : "Video queued. Will download in sequence.");
        } else {
          showAlert("start", targetTitle ? `Saving "${targetTitle}" with ${settings.defaultQuality || "1080"}p...` : "Download started.");
        }

        fetchStatus();
      });
    } catch (error) {
      if (triggerBtn) {
        triggerBtn.style.opacity = "";
        triggerBtn.disabled = false;
      }
      showAlert("error", error.message);
    }
  }

  // Explicit queue action: sends to queue and displays Amber toast
  async function queueVideoWithPreferences(url, title) {
    try {
      const settings = await chrome.storage.local.get({
        defaultKind: "video",
        defaultQuality: "1080",
        prefixType: "number",
        customPrefix: "",
        downloadFolder: "",
        channels: 8,
      });

      const targetUrl = url || window.location.href;
      const targetTitle = (title || document.title.replace(/\s*-\s*YouTube\s*$/, "")).trim();

      chrome.runtime.sendMessage({
        type: "start-download",
        url: targetUrl,
        kind: settings.defaultKind || "video",
        quality: settings.defaultQuality || "1080",
        title: targetTitle,
        prefixType: settings.prefixType || "number",
        customPrefix: settings.customPrefix || "",
        folder: settings.downloadFolder || "",
        channels: settings.channels || 8,
      }, (res) => {
        if (chrome.runtime.lastError || !res?.ok) {
          const err = res?.error || chrome.runtime.lastError?.message || "Local service unavailable.";
          showAlert("error", err);
          return;
        }

        showAlert("queue", targetTitle ? `"${targetTitle}" added to queue.` : "Video queued. Will download in sequence.");
        fetchStatus();
      });
    } catch (error) {
      showAlert("error", error.message);
    }
  }

  function handleToolbarButtonClick() {
    const btn = document.querySelector(`#${TOOLBAR_CONTAINER_ID} .okja-yt-btn`);
    const title = document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();
    downloadVideoWithPreferences(window.location.href, title, btn);
  }

  function createToolbarButton() {
    const container = document.createElement("div");
    container.id = TOOLBAR_CONTAINER_ID;
    container.className = "style-scope ytd-menu-renderer okja-toolbar-item";

    container.innerHTML = `
      <button type="button" class="ytSpecButtonShapeNextHost ytSpecButtonShapeNextTonal ytSpecButtonShapeNextMono ytSpecButtonShapeNextSizeM ytSpecButtonShapeNextIconButton ytSpecButtonShapeNextEnableBackdropFilterExperiment okja-yt-btn" title="Download with Okja Saver" aria-label="Download with Okja Saver">
        <div aria-hidden="true" class="ytSpecButtonShapeNextIcon ytSpecButtonShapeNextElevatedContent">
          <span class="ytIconWrapperHost okja-btn-icon-wrapper">
            ${DOWNLOAD_ICON_SVG}
          </span>
        </div>
      </button>
    `;

    const btn = container.querySelector(".okja-yt-btn");

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleToolbarButtonClick();
    });

    btn.addEventListener("pointerdown", (e) => e.stopPropagation());

    return container;
  }

  function findMoreActionsButton() {
    const byAria = document.querySelector(
      'ytd-watch-metadata ytd-menu-renderer button[aria-label="More actions"], ' +
      'ytd-menu-renderer button[aria-label="More actions"], ' +
      '#top-level-buttons-computed button[aria-label="More actions"]'
    );
    if (byAria) return byAria;

    const allSvgPaths = document.querySelectorAll(
      'ytd-watch-metadata ytd-menu-renderer svg path, ' +
      'ytd-menu-renderer svg path, ' +
      '#top-level-buttons-computed svg path'
    );
    for (const p of allSvgPaths) {
      const d = p.getAttribute("d") || "";
      if (d.includes("M6 10a2") || d.includes("M6 10") || d.includes("10a2 2 0 100 4")) {
        const btn = p.closest("button");
        if (btn) return btn;
      }
    }

    const popupBtn = document.querySelector(
      'ytd-watch-metadata ytd-menu-renderer button[aria-haspopup="true"], ' +
      'ytd-menu-renderer button[aria-haspopup="true"]'
    );
    if (popupBtn) return popupBtn;

    return null;
  }

  function findInsertionTarget() {
    // 1. Right before YouTube's 3-dot "More actions" button (always visible in toolbar)
    const moreActionsBtn = findMoreActionsButton();
    if (moreActionsBtn) {
      const shape = moreActionsBtn.closest("yt-button-shape, ytd-button-renderer, yt-button-view-model, ytd-menu-renderer > div") || moreActionsBtn.parentElement;
      if (shape && shape.parentElement) {
        return { parent: shape.parentElement, before: shape };
      }
    }

    // 2. Right before YouTube's native download button if present in top buttons
    const nativeDownload = document.querySelector(
      "ytd-watch-metadata #actions ytd-download-button-renderer, " +
      "#top-level-buttons-computed ytd-download-button-renderer, " +
      "ytd-download-button-renderer"
    );
    if (nativeDownload && nativeDownload.parentElement) {
      return { parent: nativeDownload.parentElement, before: nativeDownload };
    }

    // 3. Fallback: append to #top-level-buttons-computed or #flexible-item-buttons
    const topButtons = document.querySelector(
      "ytd-watch-metadata #actions ytd-menu-renderer #top-level-buttons-computed, " +
      "ytd-watch-metadata ytd-menu-renderer #top-level-buttons-computed, " +
      "#menu-container ytd-menu-renderer #top-level-buttons-computed, " +
      "#top-level-buttons-computed, " +
      "ytd-watch-metadata #actions, " +
      "ytd-menu-renderer #flexible-item-buttons"
    );
    if (topButtons) {
      return { parent: topButtons, before: null };
    }

    return null;
  }

  function addToolbarButton() {
    if (!isVideoWatchPage()) return;

    const existing = document.getElementById(TOOLBAR_CONTAINER_ID);
    if (existing && existing.isConnected) {
      return;
    }

    const target = findInsertionTarget();
    if (!target || !target.parent) return;

    const btn = createToolbarButton();
    if (target.before && target.before.parentElement === target.parent) {
      target.parent.insertBefore(btn, target.before);
    } else {
      target.parent.appendChild(btn);
    }
    updateToolbarButtonState();
  }

  // --- Playlist Page Header Button ---

  async function downloadPlaylistWithPreferences(url, title, triggerBtn) {
    if (triggerBtn) {
      triggerBtn.style.opacity = "0.6";
      triggerBtn.disabled = true;
    }

    try {
      const settings = await chrome.storage.local.get({
        defaultKind: "video",
        defaultQuality: "1080",
        prefixType: "number",
        customPrefix: "",
        downloadFolder: "",
        channels: 8,
      });

      const targetUrl = url || window.location.href;
      const targetTitle = (title || document.title.replace(/\s*-\s*YouTube\s*$/, "")).trim();

      chrome.runtime.sendMessage({
        type: "start-download",
        url: targetUrl,
        kind: settings.defaultKind || "video",
        quality: settings.defaultQuality || "1080",
        title: targetTitle ? `Playlist: ${targetTitle}` : "Playlist",
        isPlaylist: true,
        prefixType: settings.prefixType || "number",
        customPrefix: settings.customPrefix || "",
        folder: settings.downloadFolder || "",
        channels: settings.channels || 8,
      }, (res) => {
        if (triggerBtn) {
          triggerBtn.style.opacity = "";
          triggerBtn.disabled = false;
        }

        if (chrome.runtime.lastError || !res?.ok) {
          const err = res?.error || chrome.runtime.lastError?.message || "Local service unavailable.";
          showAlert("error", err);
          return;
        }

        if (res.playlistCount && res.playlistCount > 1) {
          showAlert("start", targetTitle ? `Downloading 1st video of "${targetTitle}". ${res.playlistCount - 1} videos queued.` : `Started playlist (${res.playlistCount} videos).`);
        } else if (res.queued) {
          showAlert("queue", targetTitle ? `Playlist "${targetTitle}" added to queue.` : "Playlist queued. Will download in sequence.");
        } else {
          showAlert("start", targetTitle ? `Downloading playlist "${targetTitle}" with ${settings.defaultQuality || "1080"}p...` : "Playlist download started.");
        }

        fetchStatus();
      });
    } catch (error) {
      if (triggerBtn) {
        triggerBtn.style.opacity = "";
        triggerBtn.disabled = false;
      }
      showAlert("error", error.message);
    }
  }

  function addPlaylistHeaderButton() {
    const wrapper = document.querySelector(
      "ytd-playlist-header-renderer .metadata-buttons-wrapper, " +
      ".metadata-buttons-wrapper.ytd-playlist-header-renderer, " +
      "ytd-playlist-header-renderer #buttons, " +
      ".metadata-buttons-wrapper"
    );
    if (!wrapper) return;

    if (wrapper.querySelector(`#${PLAYLIST_BTN_ID}`)) return;

    const container = document.createElement("div");
    container.id = PLAYLIST_BTN_ID;
    container.className = "style-scope ytd-playlist-header-renderer okja-playlist-container";
    container.innerHTML = `
      <button type="button" class="ytSpecButtonShapeNextHost ytSpecButtonShapeNextTonal ytSpecButtonShapeNextOverlay ytSpecButtonShapeNextSizeM ytSpecButtonShapeNextIconButton okja-playlist-btn" title="Download playlist with Okja Saver" aria-label="Download playlist with Okja Saver">
        <div aria-hidden="true" class="ytSpecButtonShapeNextIcon ytSpecButtonShapeNextElevatedContent">
          <span class="ytIconWrapperHost okja-playlist-icon">
            <span class="yt-icon-shape ytSpecIconShapeHost">
              <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; fill: none; color: currentColor;">
                ${PLAYLIST_ICON_SVG}
              </div>
            </span>
          </span>
        </div>
      </button>
    `;

    const btn = container.querySelector(".okja-playlist-btn");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const titleEl = document.querySelector(
        "ytd-playlist-header-renderer #text, " +
        "ytd-playlist-header-renderer h1, " +
        "ytd-playlist-header-renderer yt-dynamic-sizing-formatted-string, " +
        ".metadata-wrapper.ytd-playlist-header-renderer yt-formatted-string"
      );
      const title = titleEl ? titleEl.textContent.trim() : document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();

      downloadPlaylistWithPreferences(window.location.href, title, btn);
    });

    btn.addEventListener("pointerdown", (e) => e.stopPropagation());

    const nativeDownload = wrapper.querySelector("ytd-download-playlist-button-renderer");
    const menuRenderer = wrapper.querySelector("ytd-menu-renderer, #menu-container");

    if (nativeDownload && nativeDownload.parentElement === wrapper) {
      wrapper.insertBefore(container, nativeDownload);
    } else if (menuRenderer && menuRenderer.parentElement === wrapper) {
      wrapper.insertBefore(container, menuRenderer);
    } else {
      wrapper.appendChild(container);
    }
  }

  // --- Target Video Context Resolution ---

  const CARD_SELECTORS = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-reel-item-renderer",
    "ytd-rich-grid-media",
    "ytd-lockup-view-model",
    "yt-lockup-view-model",
    "ytd-notification-renderer",
    "ytd-playlist-panel-video-renderer",
    "ytd-rich-grid-slim-media",
    "ytd-compact-radio-renderer",
    "ytd-radio-renderer",
    "ytd-reel-video-renderer",
  ].join(", ");

  function extractVideoId(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return null;
    try {
      const url = new URL(rawUrl, window.location.origin);
      if (url.hostname.includes("youtu.be")) {
        const id = url.pathname.slice(1).split("/")[0].split("?")[0];
        if (id) return id;
      }
      if (url.pathname.startsWith("/shorts/")) {
        const id = url.pathname.split("/shorts/")[1].split("/")[0].split("?")[0];
        if (id) return id;
      }
      if (url.pathname.startsWith("/live/")) {
        const id = url.pathname.split("/live/")[1].split("/")[0].split("?")[0];
        if (id) return id;
      }
      if (url.searchParams.has("v")) {
        return url.searchParams.get("v");
      }
    } catch (_e) {}
    const match = rawUrl.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([\w-]{11})/);
    return match ? match[1] : null;
  }

  function canonicalizeYouTubeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return "";
    try {
      const url = new URL(rawUrl, window.location.origin);
      const listId = url.searchParams.get("list");
      const videoId = extractVideoId(rawUrl);

      if (videoId && listId) {
        return `https://www.youtube.com/watch?v=${videoId}&list=${listId}`;
      } else if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      } else if (listId) {
        return `https://www.youtube.com/playlist?list=${listId}`;
      }
    } catch (_e) {}
    return rawUrl;
  }

  function isPopupOrDialogElement(target) {
    if (!target || !(target instanceof Element)) return false;
    return Boolean(target.closest(
      "tp-yt-iron-dropdown, ytd-popup-container, ytd-menu-popup-renderer, " +
      "yt-sheet-view-model, ytd-share-panel-renderer, ytd-unified-share-panel-renderer, " +
      "tp-yt-paper-dialog, [role='dialog'], [role='menu'], .okja-minimal-toast, .swal2-container"
    ));
  }

  function isShareDialogElement(target) {
    if (!target || !(target instanceof Element)) return false;
    return Boolean(target.closest(
      "ytd-share-panel-renderer, ytd-unified-share-panel-renderer, " +
      "tp-yt-paper-dialog#share-dialog, #share-dialog, yt-share-panel-view-model"
    ));
  }

  function extractCardContext(card) {
    if (!card || !(card instanceof Element)) return null;

    const linkEl = card.querySelector(
      'a#video-title-link, a#thumbnail, a[href*="/watch?v="], a[href*="/shorts/"], ' +
      'a[href*="youtu.be/"], .yt-lockup-metadata-view-model-wiz__title a, a'
    );
    const titleEl = card.querySelector(
      '#video-title, #video-title-link, h3, [title], ' +
      '.yt-lockup-metadata-view-model-wiz__title, yt-formatted-string#video-title'
    );

    const rawHref = linkEl ? linkEl.getAttribute("href") : null;
    const url = rawHref ? new URL(rawHref, window.location.origin).href : "";
    const title = titleEl ? (titleEl.getAttribute("title") || titleEl.textContent || "").trim() : "";
    const videoId = extractVideoId(url);

    if (url && (url.includes("/watch") || url.includes("/shorts") || url.includes("youtu.be"))) {
      return { url, title, videoId, isCard: true, timestamp: Date.now() };
    }
    return null;
  }

  function captureVideoContextFromTrigger(target) {
    if (!target || !(target instanceof Element)) return null;

    // Do NOT capture watch page context if target is inside popups, menus, or dialogs
    if (isPopupOrDialogElement(target)) {
      return null;
    }

    const card = target.closest(CARD_SELECTORS);
    if (card) {
      return extractCardContext(card);
    }

    if (isVideoWatchPage()) {
      const isMainWatch = Boolean(target.closest("ytd-watch-metadata, #player, #movie_player, #top-level-buttons-computed"));
      if (isMainWatch) {
        return {
          url: window.location.href,
          title: document.title.replace(/\s*-\s*YouTube\s*$/, "").trim(),
          videoId: extractVideoId(window.location.href),
          isCard: false,
          timestamp: Date.now(),
        };
      }
    }

    return null;
  }

  function resolveContextForDropdown(menuElement) {
    const dropdown = menuElement ? menuElement.closest("tp-yt-iron-dropdown, ytd-popup-container") : null;
    if (dropdown) {
      const trigger = dropdown.positionTarget || dropdown.sizingTarget || dropdown._positionTarget;
      if (trigger) {
        const fromTrigger = captureVideoContextFromTrigger(trigger);
        if (fromTrigger && fromTrigger.url) return fromTrigger;
      }
    }

    if (lastContextVideo && (Date.now() - lastContextVideo.timestamp < 120000) && lastContextVideo.url) {
      return lastContextVideo;
    }

    if (isVideoWatchPage()) {
      return {
        url: window.location.href,
        title: document.title.replace(/\s*-\s*YouTube\s*$/, "").trim(),
        videoId: extractVideoId(window.location.href),
        isCard: false,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  function closeOpenDropdowns() {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      }));

      const dropdowns = document.querySelectorAll("tp-yt-iron-dropdown");
      dropdowns.forEach((dd) => {
        try {
          if (typeof dd.close === "function") {
            dd.close();
          }
          dd.opened = false;
          dd.setAttribute("aria-hidden", "true");
        } catch (_e) {}
      });
    } catch (_e) {}
  }

  // --- YouTube 3-Dot Dropdown Integration ---

  function updateSingleDropdownItem(item, hasActive) {
    const iconContainer = item.querySelector(".okja-dropdown-icon");
    const titleEl = item.querySelector(".okja-dropdown-title");
    const targetLabel = hasActive ? "Add to queue" : "Download Local";

    if (titleEl && titleEl.textContent !== targetLabel) {
      titleEl.textContent = targetLabel;
    }
    if (iconContainer) {
      const isQueue = iconContainer.dataset.iconState === "queue";
      if (hasActive !== isQueue) {
        iconContainer.dataset.iconState = hasActive ? "queue" : "download";
        iconContainer.innerHTML = hasActive ? USER_QUEUE_ICON_SVG : MENU_DOWNLOAD_ICON_SVG;
      }
    }
  }

  function createSheetDropdownItem(hasActive, menu) {
    const item = document.createElement("yt-list-item-view-model");
    item.className = "ytListItemViewModelHost okja-context-item";
    item.setAttribute("role", "presentation");

    const iconSvg = hasActive ? USER_QUEUE_ICON_SVG : MENU_DOWNLOAD_ICON_SVG;
    const labelText = hasActive ? "Add to queue" : "Download";
    const stateAttr = hasActive ? "queue" : "download";

    item.innerHTML = `
      <div class="ytListItemViewModelLayoutWrapper ytListItemViewModelContainer ytListItemViewModelCompact ytListItemViewModelTappable ytListItemViewModelInPopup ytListItemViewModelNoTrailingText">
        <div class="ytListItemViewModelMainContainer">
          <div aria-hidden="true" class="ytListItemViewModelImageContainer ytListItemViewModelLeading">
            <span class="ytIconWrapperHost ytListItemViewModelAccessory ytListItemViewModelImage" role="img" aria-hidden="true">
              <span class="yt-icon-shape ytSpecIconShapeHost">
                <div class="okja-dropdown-icon" data-icon-state="${stateAttr}" style="width: 100%; height: 100%; display: inherit; fill: currentColor;">
                  ${iconSvg}
                </div>
              </span>
            </span>
          </div>
          <button class="ytButtonOrAnchorHost ytButtonOrAnchorButton ytListItemViewModelButtonOrAnchor ytListItemViewModelTextWrapper" role="menuitem" type="button" title="Download with Okja Saver">
            <div>
              <div class="ytListItemViewModelTitleWrapper">
                <span class="ytAttributedStringHost ytListItemViewModelTitle ytAttributedStringWhiteSpacePreWrap okja-dropdown-title" role="text">${labelText}</span>
              </div>
            </div>
          </button>
        </div>
      </div>
    `;

    item.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const context = resolveContextForDropdown(menu);
      const targetUrl = context?.url || window.location.href;
      const targetTitle = context?.title || document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();

      closeOpenDropdowns();
      downloadVideoWithPreferences(targetUrl, targetTitle);
    });

    item.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });

    return item;
  }

  function createPaperDropdownItem(hasActive, menu) {
    const item = document.createElement("ytd-menu-service-item-renderer");
    item.className = "style-scope ytd-menu-popup-renderer okja-context-item";
    item.setAttribute("role", "menuitem");
    item.setAttribute("tabindex", "-1");

    const iconSvg = hasActive ? USER_QUEUE_ICON_SVG : MENU_DOWNLOAD_ICON_SVG;
    const labelText = hasActive ? "Add to queue" : "Download";
    const stateAttr = hasActive ? "queue" : "download";

    item.innerHTML = `
      <tp-yt-paper-item class="style-scope ytd-menu-service-item-renderer" role="option">
        <div class="style-scope ytd-menu-service-item-renderer okja-dropdown-icon" data-icon-state="${stateAttr}" style="margin-right: 16px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
          ${iconSvg}
        </div>
        <yt-formatted-string class="style-scope ytd-menu-service-item-renderer okja-dropdown-title">${labelText}</yt-formatted-string>
      </tp-yt-paper-item>
    `;

    item.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const context = resolveContextForDropdown(menu);
      const targetUrl = context?.url || window.location.href;
      const targetTitle = context?.title || document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();

      closeOpenDropdowns();
      downloadVideoWithPreferences(targetUrl, targetTitle);
    });

    item.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });

    return item;
  }

  // Hook and enhance native YouTube "Add to queue" items in the dropdown menu
  function enhanceNativeQueueItems(menu) {
    const items = menu.querySelectorAll("yt-list-item-view-model, ytd-menu-service-item-renderer");
    items.forEach((item) => {
      if (item.classList.contains("okja-context-item")) return;
      const text = (item.textContent || "").trim();
      if (text.toLowerCase() === "add to queue" || text.toLowerCase().startsWith("add to queue")) {
        item.classList.add("okja-native-queue-item");

        const iconContainer = item.querySelector(".ytSpecIconShapeHost div, .ytIconWrapperHost, yt-icon");
        if (iconContainer && !iconContainer.querySelector(".okja-custom-queue-icon")) {
          iconContainer.innerHTML = `<span class="okja-custom-queue-icon" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">${USER_QUEUE_ICON_SVG}</span>`;
        }
      }
    });
  }

  function addDropdownMenuItems() {
    const hasActive = Boolean(currentStatus.activeJob && ["downloading", "queued"].includes(currentStatus.activeJob.status));

    // 1. Modern YouTube Sheet Menus
    const sheetMenus = document.querySelectorAll(
      "#contentWrapper yt-list-view-model[role='menu'], " +
      "yt-sheet-view-model yt-list-view-model[role='menu'], " +
      "tp-yt-iron-dropdown yt-list-view-model[role='menu'], " +
      "ytd-popup-container yt-list-view-model[role='menu']"
    );

    sheetMenus.forEach((menu) => {
      // Enhance any existing native "Add to queue" items inside this menu
      enhanceNativeQueueItems(menu);

      const existing = menu.querySelector(".okja-context-item");
      if (existing) {
        updateSingleDropdownItem(existing, hasActive);
        return;
      }

      const item = createSheetDropdownItem(hasActive, menu);

      // Insert before native offline download button if present, or after playlist/queue
      const nativeDownload = menu.querySelector("yt-download-list-item-view-model");
      if (nativeDownload && nativeDownload.parentElement === menu) {
        menu.insertBefore(item, nativeDownload);
      } else {
        const playlistItem = [...menu.children].find((c) => {
          const text = c.textContent || "";
          return text.includes("playlist") || text.includes("Watch Later") || text.includes("queue");
        });
        if (playlistItem && playlistItem.nextSibling) {
          menu.insertBefore(item, playlistItem.nextSibling);
        } else {
          menu.appendChild(item);
        }
      }
    });

    // 2. Paper Listbox Menus (Older YouTube layout)
    const paperMenus = document.querySelectorAll(
      "tp-yt-iron-dropdown tp-yt-paper-listbox#menu, " +
      "ytd-popup-container tp-yt-paper-listbox#menu, " +
      "ytd-menu-popup-renderer tp-yt-paper-listbox#menu"
    );

    paperMenus.forEach((menu) => {
      enhanceNativeQueueItems(menu);

      const existing = menu.querySelector(".okja-context-item");
      if (existing) {
        updateSingleDropdownItem(existing, hasActive);
        return;
      }

      const item = createPaperDropdownItem(hasActive, menu);
      menu.appendChild(item);
    });
  }

  function findCardByVideoId(videoId) {
    if (!videoId) return null;
    const linkSelectors = [
      `a[href*="watch?v=${videoId}"]`,
      `a[href*="/shorts/${videoId}"]`,
      `a[href*="youtu.be/${videoId}"]`,
    ];
    for (const sel of linkSelectors) {
      const links = document.querySelectorAll(sel);
      for (const link of links) {
        const card = link.closest(CARD_SELECTORS);
        if (card) return card;
      }
    }
    return null;
  }

  function findShareUrlInDialog(dialog) {
    if (!dialog) return "";

    function cleanUrl(str) {
      if (!str || typeof str !== "string") return "";
      const trimmed = str.trim();
      const match = trimmed.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|playlist\?list=)|youtu\.be\/)[\w-]+[^\s"']*/i);
      if (match) return match[0];
      if (/^(?:www\.)?youtu\.be\/[\w-]+/i.test(trimmed)) {
        return `https://${trimmed}`;
      }
      return "";
    }

    // 1. Direct input selectors in the dialog
    const inputSelectors = [
      "input#share-url",
      "#share-url input",
      "ytd-copy-link-renderer input",
      "yt-copy-link-renderer input",
      "tp-yt-paper-input#share-url input",
      "tp-yt-paper-input input",
      "input[readonly]",
      "#share-url",
      "input",
    ];

    for (const sel of inputSelectors) {
      const els = dialog.querySelectorAll(sel);
      for (const el of els) {
        const val = cleanUrl(el.value || el.getAttribute("value") || "");
        if (val) return val;
      }
    }

    // 2. Search shadow roots of child components
    const shadowHosts = dialog.querySelectorAll(
      "ytd-copy-link-renderer, yt-copy-link-renderer, tp-yt-paper-input, #share-url, ytd-share-target-renderer, yt-copy-link-view-model"
    );
    for (const host of shadowHosts) {
      if (host.shadowRoot) {
        const inputs = host.shadowRoot.querySelectorAll("input, #share-url, [id*='url']");
        for (const inp of inputs) {
          const val = cleanUrl(inp.value || inp.getAttribute("value") || "");
          if (val) return val;
        }
      }
    }

    // 3. Fallback: search in entire document for active share dialog input
    const globalSelectors = [
      "ytd-share-panel-renderer input#share-url",
      "ytd-unified-share-panel-renderer input#share-url",
      "tp-yt-paper-dialog#share-dialog input#share-url",
      "#share-dialog input#share-url",
      "ytd-copy-link-renderer input",
    ];
    for (const sel of globalSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const val = cleanUrl(el.value || el.getAttribute("value") || "");
        if (val) return val;
      }
    }

    return "";
  }

  function extractFromSocialTargets(dialog) {
    if (!dialog) return { url: "", title: "" };

    let url = "";
    let title = "";

    // 1. Mailto target: mailto:?subject=TITLE&body=URL
    const mailto = dialog.querySelector('a[href^="mailto:"]');
    if (mailto) {
      const href = mailto.getAttribute("href") || "";
      const qIdx = href.indexOf("?");
      if (qIdx !== -1) {
        try {
          const params = new URLSearchParams(href.slice(qIdx + 1));
          const body = params.get("body") || "";
          const subject = params.get("subject") || "";
          if (body.includes("youtu.be") || body.includes("youtube.com")) {
            url = body.trim();
          }
          if (subject && subject.toLowerCase() !== "share") {
            title = subject.trim();
          }
        } catch (_e) {}
      }
    }

    // 2. Twitter / X target
    if (!url) {
      const twitter = dialog.querySelector('a[href*="twitter.com/intent/tweet"], a[href*="x.com/intent/tweet"]');
      if (twitter) {
        const href = twitter.getAttribute("href") || "";
        try {
          const u = new URL(href);
          const tweetUrl = u.searchParams.get("url") || "";
          const tweetText = u.searchParams.get("text") || "";
          if (tweetUrl.includes("youtu.be") || tweetUrl.includes("youtube.com")) {
            url = tweetUrl.trim();
          }
          if (tweetText && !title) {
            title = tweetText.trim();
          }
        } catch (_e) {}
      }
    }

    // 3. WhatsApp target
    if (!url) {
      const wa = dialog.querySelector('a[href*="whatsapp.com/send"]');
      if (wa) {
        const href = wa.getAttribute("href") || "";
        try {
          const u = new URL(href);
          const text = u.searchParams.get("text") || "";
          const match = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w-]+[^\s]*/i);
          if (match) {
            url = match[0];
            const cand = text.replace(match[0], "").trim();
            if (cand && !title) title = cand;
          }
        } catch (_e) {}
      }
    }

    // 4. Data attributes on share targets
    if (!url) {
      const dataEls = dialog.querySelectorAll("[data-url], [data-share-url], [data-clipboard-text]");
      for (const el of dataEls) {
        const val = el.getAttribute("data-url") || el.getAttribute("data-share-url") || el.getAttribute("data-clipboard-text") || "";
        if (val.includes("youtu.be") || val.includes("youtube.com")) {
          url = val.trim();
          break;
        }
      }
    }

    return { url, title };
  }

  function resolveShareDialogContext(dialog) {
    // 1. URL from dialog input elements
    let foundUrl = findShareUrlInDialog(dialog);
    let foundTitle = "";

    // 2. URL and Title from social targets (mailto, twitter, etc.)
    const social = extractFromSocialTargets(dialog);
    if (!foundUrl && social.url) {
      foundUrl = social.url;
    }
    if (social.title) {
      foundTitle = social.title;
    }

    // 3. Video ID extraction
    const videoId = extractVideoId(foundUrl);
    const openedVideoId = extractVideoId(window.location.href);
    const isOpenedVideo = Boolean(videoId && openedVideoId && videoId === openedVideoId);

    // 4. Resolve title
    if (!foundTitle) {
      if (isOpenedVideo) {
        foundTitle = document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();
      } else if (videoId) {
        // A. Match lastSharedVideoContext
        if (lastSharedVideoContext && extractVideoId(lastSharedVideoContext.url) === videoId && lastSharedVideoContext.title) {
          foundTitle = lastSharedVideoContext.title;
        }
        // B. Match lastContextVideo
        else if (lastContextVideo && extractVideoId(lastContextVideo.url) === videoId && lastContextVideo.title) {
          foundTitle = lastContextVideo.title;
        }
        // C. Look for corresponding video card in the DOM
        if (!foundTitle) {
          const card = findCardByVideoId(videoId);
          if (card) {
            const titleEl = card.querySelector(
              '#video-title, #video-title-link, h3, [title], ' +
              '.yt-lockup-metadata-view-model-wiz__title, yt-formatted-string#video-title'
            );
            foundTitle = (titleEl?.getAttribute("title") || titleEl?.textContent || "").trim();
          }
        }
      }
    }

    // 5. If no URL was found in dialog, fallback to lastSharedVideoContext or lastContextVideo
    if (!foundUrl) {
      if (lastSharedVideoContext?.url) {
        foundUrl = lastSharedVideoContext.url;
        foundTitle = foundTitle || lastSharedVideoContext.title;
      } else if (lastContextVideo?.url) {
        foundUrl = lastContextVideo.url;
        foundTitle = foundTitle || lastContextVideo.title;
      } else if (isVideoWatchPage()) {
        foundUrl = window.location.href;
        foundTitle = foundTitle || document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();
      }
    }

    // 6. Canonicalize URL
    const canonicalUrl = canonicalizeYouTubeUrl(foundUrl) || foundUrl;

    return {
      url: canonicalUrl,
      title: foundTitle || (videoId ? `YouTube Video [${videoId}]` : "YouTube video"),
    };
  }

  function closeShareDialog(dialog) {
    try {
      const closeBtn = dialog?.querySelector(
        "button[aria-label='Cancel'], button[aria-label='Close'], #close-button button, yt-icon-button#close-button button"
      );
      if (closeBtn) {
        closeBtn.click();
        return;
      }
      if (dialog && typeof dialog.close === "function") {
        dialog.close();
      }
      if (dialog) {
        dialog.opened = false;
        dialog.setAttribute("aria-hidden", "true");
      }
      closeOpenDropdowns();
    } catch (_e) {}
  }

  function addShareAction() {
    const dialogs = document.querySelectorAll(
      "ytd-share-panel-renderer #share-dialog, " +
      "tp-yt-paper-dialog#share-dialog, " +
      "ytd-unified-share-panel-renderer, " +
      "ytd-share-panel-renderer, " +
      "yt-share-panel-view-model, " +
      "tp-yt-paper-dialog[role='dialog']"
    );

    const dialog = [...dialogs].find((d) => isVisible(d) && (
      d.id === "share-dialog" ||
      d.querySelector("#share-url, ytd-share-target-renderer, ytd-copy-link-renderer, #share-buttons")
    ));

    if (!dialog || dialog.querySelector(`#${SHARE_ACTION_ID}`)) return;

    const action = document.createElement("div");
    action.id = SHARE_ACTION_ID;
    action.innerHTML = `
      <button type="button" class="okja-share-button" aria-label="Download with Okja Saver">
        <span class="okja-share-icon" aria-hidden="true">↓</span>
        <span><strong>Download with Okja Saver</strong><small>Download using default preferences</small></span>
      </button>`;

    const shareBtn = action.querySelector(".okja-share-button");
    shareBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const context = resolveShareDialogContext(dialog);
      const targetUrl = context.url || window.location.href;
      const targetTitle = context.title || document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();

      closeShareDialog(dialog);
      downloadVideoWithPreferences(targetUrl, targetTitle, shareBtn);
    });

    shareBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

    const shareButtons = dialog.querySelector("#share-buttons, ytd-share-target-renderer, #targets")?.parentElement;
    (shareButtons || dialog).append(action);
  }

  let scheduled = false;
  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      addToolbarButton();
      addPlaylistHeaderButton();
      addShareAction();
      addDropdownMenuItems();
    });
  }

  // Intercept clicks on 3-dot dropdown items ("Add to queue", "Share") and direct Share buttons
  document.addEventListener("click", (e) => {
    const item = e.target.closest("yt-list-item-view-model, ytd-menu-service-item-renderer");
    if (item) {
      const dropdown = item.closest("#contentWrapper, tp-yt-iron-dropdown, yt-sheet-view-model, ytd-popup-container, ytd-menu-popup-renderer");
      if (dropdown) {
        const text = (item.textContent || "").trim().toLowerCase();
        if (text.includes("share")) {
          const context = resolveContextForDropdown(item);
          if (context && context.url) {
            lastSharedVideoContext = { ...context, timestamp: Date.now() };
            lastContextVideo = { ...context, timestamp: Date.now() };
          }
        } else if (text === "add to queue" || text.startsWith("add to queue")) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const context = resolveContextForDropdown(item);
          const targetUrl = context?.url || window.location.href;
          const targetTitle = context?.title || document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();

          closeOpenDropdowns();
          queueVideoWithPreferences(targetUrl, targetTitle);
          return;
        }
      }
    }

    // Direct Share button on a video card or player toolbar
    const shareTrigger = e.target.closest(
      "button[aria-label*='Share' i], [title*='Share' i], ytd-share-target-renderer, #share-button"
    );
    if (shareTrigger && !isShareDialogElement(shareTrigger)) {
      const card = shareTrigger.closest(CARD_SELECTORS);
      if (card) {
        const cardCtx = extractCardContext(card);
        if (cardCtx && cardCtx.url) {
          lastSharedVideoContext = { ...cardCtx, timestamp: Date.now() };
          lastContextVideo = { ...cardCtx, timestamp: Date.now() };
        }
      } else if (isVideoWatchPage()) {
        const isMainPlayerShare = Boolean(shareTrigger.closest("ytd-watch-metadata, #top-level-buttons-computed, #actions"));
        if (isMainPlayerShare) {
          lastSharedVideoContext = {
            url: window.location.href,
            title: document.title.replace(/\s*-\s*YouTube\s*$/, "").trim(),
            videoId: extractVideoId(window.location.href),
            timestamp: Date.now(),
          };
        }
      }
    }
  }, { capture: true });

  // Capture user interactions with 3-dot buttons across YouTube to track target video & refresh status
  document.addEventListener("pointerdown", (e) => {
    if (!isPopupOrDialogElement(e.target)) {
      const ctx = captureVideoContextFromTrigger(e.target);
      if (ctx) {
        lastContextVideo = ctx;
      }
    }
    fetchStatus();
    scheduleUpdate();
  }, { capture: true, passive: true });

  document.addEventListener("click", (e) => {
    if (!isPopupOrDialogElement(e.target)) {
      const ctx = captureVideoContextFromTrigger(e.target);
      if (ctx) {
        lastContextVideo = ctx;
      }
    }
    scheduleUpdate();
  }, { capture: true, passive: true });

  // Listen for broadcast events from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "download-complete") {
      showAlert("complete", message.filename || (message.title ? `"${message.title}" saved.` : "Video saved to downloads folder."), undefined, 4500);
      fetchStatus();
    } else if (message?.type === "download-started") {
      if (message.queued) {
        showAlert("queue", message.title ? `"${message.title}" added to queue.` : "Video queued. Will download in sequence.", "Added to Queue");
      } else {
        showAlert("start", message.title ? `Saving "${message.title}"...` : "Download started.", "Download Started");
      }
      fetchStatus();
    } else if (message?.type === "download-cancelled") {
      showAlert("cancelled", "Download was cancelled.", "Download Cancelled");
      fetchStatus();
    }
  });

  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("yt-navigate-finish", () => {
    lastIconState = "";
    lastContextVideo = null;
    lastSharedVideoContext = null;
    scheduleUpdate();
    fetchStatus();
  });

  window.addEventListener("popstate", scheduleUpdate);
  document.addEventListener("DOMContentLoaded", scheduleUpdate);

  scheduleUpdate();
  fetchStatus();

  // Background polling to keep state synchronized and UI active
  setInterval(fetchStatus, 1500);
  setInterval(scheduleUpdate, 1000);
})();
