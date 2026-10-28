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

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }

  function isVideoWatchPage() {
    const path = window.location.pathname;
    return path === "/watch" || path.startsWith("/shorts") || path.startsWith("/live");
  }

  // Task-specific Alert Configurations
  const ALERT_CONFIGS = {
    start: {
      icon: "info",
      iconColor: "#38bdf8",       // Electric Cyan / Blue
      className: "toast-start",
      defaultTitle: "Download Started",
    },
    queue: {
      icon: "info",
      iconColor: "#f59e0b",       // Vivid Amber / Orange
      className: "toast-queue",
      defaultTitle: "Added to Queue",
    },
    complete: {
      icon: "success",
      iconColor: "#b8f548",       // Signature Lime Green
      className: "toast-complete",
      defaultTitle: "Download Complete! ✓",
    },
    cancelled: {
      icon: "info",
      iconColor: "#a855f7",       // Lavender / Purple
      className: "toast-cancelled",
      defaultTitle: "Download Cancelled",
    },
    error: {
      icon: "error",
      iconColor: "#ff5252",       // Coral Red
      className: "toast-error",
      defaultTitle: "Download Failed",
    },
  };

  function showAlert(type, text, customTitle, timer = 3800) {
    if (typeof Swal === "undefined") return;
    const config = ALERT_CONFIGS[type] || ALERT_CONFIGS.start;

    Swal.fire({
      toast: true,
      position: "bottom-start",
      icon: config.icon,
      iconColor: config.iconColor,
      title: customTitle || config.defaultTitle,
      text: text || "",
      showConfirmButton: false,
      timer: timer,
      timerProgressBar: true,
      background: "#141816",
      color: "#f5f7f5",
      customClass: {
        popup: `okja-swal-toast ${config.className}`,
      },
      didOpen: (toast) => {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
      },
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

  function captureVideoContextFromTrigger(target) {
    if (!target || !(target instanceof Element)) return null;

    const card = target.closest(
      "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, " +
      "ytd-grid-video-renderer, ytd-playlist-video-renderer, ytd-reel-item-renderer, " +
      "ytd-rich-grid-media, ytd-lockup-view-model, yt-lockup-view-model, " +
      "ytd-notification-renderer, ytd-playlist-panel-video-renderer, ytd-rich-grid-slim-media"
    );

    if (card) {
      const linkEl = card.querySelector('a#video-title-link, a#thumbnail, a[href*="/watch?v="], a[href*="/shorts/"]');
      const titleEl = card.querySelector('#video-title, #video-title-link, h3, [title], .yt-lockup-metadata-view-model-wiz__title');
      const rawHref = linkEl ? linkEl.getAttribute("href") : null;
      const url = rawHref ? new URL(rawHref, window.location.origin).href : "";
      const title = titleEl ? (titleEl.getAttribute("title") || titleEl.textContent || "").trim() : "";

      if (url) {
        return { url, title, timestamp: Date.now() };
      }
    }

    if (isVideoWatchPage()) {
      return {
        url: window.location.href,
        title: document.title.replace(/\s*-\s*YouTube\s*$/, "").trim(),
        timestamp: Date.now(),
      };
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

    if (lastContextVideo && (Date.now() - lastContextVideo.timestamp < 60000) && lastContextVideo.url) {
      return lastContextVideo;
    }

    if (isVideoWatchPage()) {
      return {
        url: window.location.href,
        title: document.title.replace(/\s*-\s*YouTube\s*$/, "").trim(),
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

  function addShareAction() {
    const dialog = [...document.querySelectorAll("ytd-share-panel-renderer #share-dialog, tp-yt-paper-dialog#share-dialog")]
      .find(isVisible);
    if (!dialog || dialog.querySelector(`#${SHARE_ACTION_ID}`)) return;

    const action = document.createElement("div");
    action.id = SHARE_ACTION_ID;
    action.innerHTML = `
      <button type="button" class="okja-share-button" aria-label="Download with Okja Saver">
        <span class="okja-share-icon" aria-hidden="true">↓</span>
        <span><strong>Download with Okja Saver</strong><small>Download using default preferences</small></span>
      </button>`;
    action.querySelector("button").addEventListener("click", () => {
      handleToolbarButtonClick();
    });

    const shareButtons = dialog.querySelector("#share-buttons, ytd-share-target-renderer")?.parentElement;
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

  // Intercept click on native "Add to queue" inside YouTube's 3-dot dropdown menu
  document.addEventListener("click", (e) => {
    const item = e.target.closest("yt-list-item-view-model, ytd-menu-service-item-renderer");
    if (!item) return;

    const dropdown = item.closest("#contentWrapper, tp-yt-iron-dropdown, yt-sheet-view-model, ytd-popup-container, ytd-menu-popup-renderer");
    if (!dropdown) return;

    const text = (item.textContent || "").trim();
    if (text.toLowerCase() === "add to queue" || text.toLowerCase().startsWith("add to queue")) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const context = resolveContextForDropdown(item);
      const targetUrl = context?.url || window.location.href;
      const targetTitle = context?.title || document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();

      closeOpenDropdowns();
      queueVideoWithPreferences(targetUrl, targetTitle);
    }
  }, { capture: true });

  // Capture user interactions with 3-dot buttons across YouTube to track target video & refresh status
  document.addEventListener("pointerdown", (e) => {
    const ctx = captureVideoContextFromTrigger(e.target);
    if (ctx) {
      lastContextVideo = ctx;
    }
    fetchStatus();
    scheduleUpdate();
  }, { capture: true, passive: true });

  document.addEventListener("click", (e) => {
    const ctx = captureVideoContextFromTrigger(e.target);
    if (ctx) {
      lastContextVideo = ctx;
    }
    scheduleUpdate();
  }, { capture: true, passive: true });

  // Listen for broadcast events from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "download-complete") {
      showAlert("complete", message.filename || (message.title ? `"${message.title}" saved.` : "Video saved to downloads folder."), undefined, 4500);
      fetchStatus();
    } else if (message?.type === "download-started" || message?.type === "download-cancelled") {
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
