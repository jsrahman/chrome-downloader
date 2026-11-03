const elements = {
  headerEyebrow: document.querySelector("#headerEyebrow"),
  headerTitle: document.querySelector("#headerTitle"),
  btnBack: document.querySelector("#btnBack"),
  btnPopout: document.querySelector("#btnPopout"),
  mainView: document.querySelector("#mainView"),
  settingsView: document.querySelector("#settingsView"),
  downloadForm: document.querySelector("#downloadForm"),
  videoTitle: document.querySelector("#videoTitle"),
  videoUrl: document.querySelector("#videoUrl"),
  videoQualityRow: document.querySelector("#videoQualityRow"),
  quality: document.querySelector("#quality"),
  audioQualityRow: document.querySelector("#audioQualityRow"),
  audioQuality: document.querySelector("#audioQuality"),
  download: document.querySelector("#download"),
  progressPanel: document.querySelector("#progressPanel"),
  statusText: document.querySelector("#statusText"),
  progressValue: document.querySelector("#progressValue"),
  progressBar: document.querySelector("#progressBar"),
  progressDetail: document.querySelector("#progressDetail"),
  errorText: document.querySelector("#errorText"),
  cancel: document.querySelector("#cancel"),
  queuePanel: document.querySelector("#queuePanel"),
  queueTitle: document.querySelector("#queueTitle"),
  queueList: document.querySelector("#queueList"),
  btnClearQueue: document.querySelector("#btnClearQueue"),
  message: document.querySelector("#message"),
  settings: document.querySelector("#settings"),
  prefixType: document.querySelector("#prefixType"),
  customPrefixRow: document.querySelector("#customPrefixRow"),
  customPrefix: document.querySelector("#customPrefix"),
  downloadFolder: document.querySelector("#downloadFolder"),

  popupSettingsForm: document.querySelector("#popupSettingsForm"),
  popupVideoQualityRow: document.querySelector("#popupVideoQualityRow"),
  popupDefaultQuality: document.querySelector("#popupDefaultQuality"),
  popupAudioQualityRow: document.querySelector("#popupAudioQualityRow"),
  popupDefaultAudioQuality: document.querySelector("#popupDefaultAudioQuality"),
  popupPrefixType: document.querySelector("#popupPrefixType"),
  popupCustomPrefixRow: document.querySelector("#popupCustomPrefixRow"),
  popupCustomPrefix: document.querySelector("#popupCustomPrefix"),
  popupDownloadFolder: document.querySelector("#popupDownloadFolder"),
  popupChannels: document.querySelector("#popupChannels"),
  popupMarkWatched: document.querySelector("#popupMarkWatched"),
  popupCookiesBrowser: document.querySelector("#popupCookiesBrowser"),
  popupPort: document.querySelector("#popupPort"),
  popupTestBtn: document.querySelector("#popupTestBtn"),
  popupClearCacheBtn: document.querySelector("#popupClearCacheBtn"),
  popupSetupBtn: document.querySelector("#popupSetupBtn"),
  popupSettingsResult: document.querySelector("#popupSettingsResult"),
};

let currentUrl = "";
let currentActiveJobId = "";
let previousJob = null;
let pollTimer = null;

function updateBadge(statusData) {
  try {
    let count = 0;
    if (typeof statusData === "number") {
      count = Math.max(0, statusData);
    } else if (statusData && typeof statusData === "object") {
      const queueCount = Number(statusData.queueCount ?? (Array.isArray(statusData.queue) ? statusData.queue.length : 0));
      const activeCount = (statusData.activeJob && ["downloading", "queued"].includes(statusData.activeJob.status)) ? 1 : 0;
      count = queueCount + activeCount;
    }

    if (count > 0) {
      chrome.action.setBadgeText({ text: String(count) });
      chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
      if (chrome.action.setBadgeTextColor) {
        chrome.action.setBadgeTextColor({ color: "#141816" });
      }
      chrome.action.setTitle({ title: `Okja Saver (${count} in queue)` });
    } else {
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setTitle({ title: "Okja YouTube Saver" });
    }
  } catch (_e) {}
}

function supportedVideoUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
    if (!["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) return "";
    if (url.pathname === "/watch") return url.searchParams.get("v") || "";
    if (url.pathname === "/playlist") return url.searchParams.get("list") ? `playlist:${url.searchParams.get("list")}` : "";
    const match = url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/);
    return match?.[1] || "";
  } catch (_error) {
    return "";
  }
}

function updateDownloadButton(isDownloading) {
  if (elements.download.classList.contains("loading")) return;
  elements.download.disabled = !currentUrl;
  if (isDownloading) {
    elements.download.textContent = "Add to queue";
    elements.download.classList.add("queue-mode");
  } else {
    elements.download.textContent = "Start download";
    elements.download.classList.remove("queue-mode");
  }
}

function showMessage(text, isSuccess = false) {
  elements.message.textContent = text;
  elements.message.className = `message ${isSuccess ? "success" : ""} ${text ? "" : "hidden"}`;
}

function setPopupSettingsResult(text, isError = false) {
  if (!elements.popupSettingsResult) return;
  elements.popupSettingsResult.textContent = text;
  elements.popupSettingsResult.style.color = isError ? "var(--error)" : "var(--accent)";
}

function updatePopupSettingsQualityVisibility() {
  const isAudio = document.querySelector('input[name="popupDefaultKind"]:checked')?.value === "audio";
  if (elements.popupVideoQualityRow) {
    elements.popupVideoQualityRow.classList.toggle("hidden", isAudio);
  }
  if (elements.popupAudioQualityRow) {
    elements.popupAudioQualityRow.classList.toggle("hidden", !isAudio);
  }
}

function updatePopupSettingsCustomPrefixVisibility() {
  if (elements.popupCustomPrefixRow && elements.popupPrefixType) {
    elements.popupCustomPrefixRow.classList.toggle("hidden", elements.popupPrefixType.value !== "custom");
  }
}

async function loadPopupSettings() {
  setPopupSettingsResult("");
  const s = await OkjaApi.getSettings();
  if (elements.popupPort) elements.popupPort.value = s.port || 43117;
  if (elements.popupDefaultQuality) elements.popupDefaultQuality.value = s.defaultQuality || "1080";
  if (elements.popupDefaultAudioQuality) elements.popupDefaultAudioQuality.value = s.defaultAudioQuality || "320";
  if (elements.popupPrefixType) elements.popupPrefixType.value = s.prefixType || "number";
  if (elements.popupCustomPrefix) elements.popupCustomPrefix.value = s.customPrefix || "";
  if (elements.popupDownloadFolder) elements.popupDownloadFolder.value = s.downloadFolder || "";
  if (elements.popupChannels) elements.popupChannels.value = String(s.channels || 8);
  if (elements.popupMarkWatched) elements.popupMarkWatched.checked = s.markWatched !== false;
  if (elements.popupCookiesBrowser) elements.popupCookiesBrowser.value = s.cookiesBrowser || "chrome";
  const kindInput = document.querySelector(`input[name="popupDefaultKind"][value="${s.defaultKind || "video"}"]`);
  if (kindInput) kindInput.checked = true;
  updatePopupSettingsQualityVisibility();
  updatePopupSettingsCustomPrefixVisibility();
}

async function savePopupSettings() {
  const port = Number(elements.popupPort?.value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Enter a valid port number (1024-65535).");
  }

  const kindRadio = document.querySelector('input[name="popupDefaultKind"]:checked');
  const defaultKind = kindRadio ? kindRadio.value : "video";
  const defaultQuality = elements.popupDefaultQuality ? elements.popupDefaultQuality.value || "1080" : "1080";
  const defaultAudioQuality = elements.popupDefaultAudioQuality ? elements.popupDefaultAudioQuality.value || "320" : "320";
  const prefixType = elements.popupPrefixType ? elements.popupPrefixType.value : "number";
  const customPrefix = elements.popupCustomPrefix ? elements.popupCustomPrefix.value.trim() : "";
  const downloadFolder = elements.popupDownloadFolder ? elements.popupDownloadFolder.value.trim() : "";
  const channels = elements.popupChannels ? Number(elements.popupChannels.value) || 8 : 8;
  const markWatched = elements.popupMarkWatched ? elements.popupMarkWatched.checked : true;
  const cookiesBrowser = elements.popupCookiesBrowser ? elements.popupCookiesBrowser.value || "chrome" : "chrome";

  await chrome.storage.local.set({
    port,
    defaultKind,
    defaultQuality,
    defaultAudioQuality,
    prefixType,
    customPrefix,
    downloadFolder,
    channels,
    markWatched,
    cookiesBrowser,
  });
}

async function syncMainViewFromSettings() {
  const s = await OkjaApi.getSettings();
  if (elements.quality) elements.quality.value = s.defaultQuality || "1080";
  if (elements.audioQuality) elements.audioQuality.value = s.defaultAudioQuality || "320";
  const kindInput = document.querySelector(`input[name="kind"][value="${s.defaultKind || "video"}"]`);
  if (kindInput) kindInput.checked = true;
  updateFormatQualityVisibility();

  if (elements.prefixType) elements.prefixType.value = s.prefixType || "number";
  if (elements.customPrefix) elements.customPrefix.value = s.customPrefix || "";
  if (elements.downloadFolder) elements.downloadFolder.value = s.downloadFolder || "";
  updateCustomPrefixVisibility();
}

function showSettingsView() {
  if (elements.mainView) elements.mainView.classList.add("hidden");
  if (elements.settingsView) elements.settingsView.classList.remove("hidden");
  if (elements.settings) elements.settings.classList.add("hidden");
  if (elements.btnBack) elements.btnBack.classList.remove("hidden");
  if (elements.btnPopout) elements.btnPopout.classList.remove("hidden");
  if (elements.headerEyebrow) elements.headerEyebrow.textContent = "OKJA SAVER";
  if (elements.headerTitle) elements.headerTitle.textContent = "Settings";
  loadPopupSettings();
}

function showMainView() {
  if (elements.settingsView) elements.settingsView.classList.add("hidden");
  if (elements.mainView) elements.mainView.classList.remove("hidden");
  if (elements.settings) elements.settings.classList.remove("hidden");
  if (elements.btnBack) elements.btnBack.classList.add("hidden");
  if (elements.btnPopout) elements.btnPopout.classList.add("hidden");
  if (elements.headerEyebrow) elements.headerEyebrow.textContent = "LOCAL DOWNLOADER";
  if (elements.headerTitle) elements.headerTitle.textContent = "Okja Saver";
  syncMainViewFromSettings();
}

function openOptions() {
  showSettingsView();
}

function selectedKind() {
  const checked = document.querySelector('input[name="kind"]:checked');
  return checked ? checked.value : "video";
}

function renderStatus(statusData) {
  const activeJob = statusData?.activeJob;
  const isDownloading = Boolean(activeJob && ["downloading", "queued"].includes(activeJob.status));
  const queue = statusData?.queue || [];

  updateDownloadButton(isDownloading);
  updateBadge(statusData);
  previousJob = activeJob;

  // Active Download Panel
  if (isDownloading) {
    currentActiveJobId = activeJob.id;
    const progress = Math.max(0, Math.min(100, Number(activeJob.progress) || 0));
    elements.progressPanel.classList.remove("hidden");
    elements.statusText.textContent = (activeJob.is_playlist ? "📁 " : "") + (activeJob.title || (activeJob.is_playlist ? "Downloading playlist…" : "Downloading video…"));
    elements.progressValue.textContent = `${Math.round(progress)}%`;
    elements.progressBar.style.width = `${progress}%`;
    elements.progressDetail.textContent = [activeJob.speed, activeJob.eta && `ETA ${activeJob.eta}`].filter(Boolean).join(" · ") || (activeJob.status === "queued" ? "Queued in service…" : (activeJob.is_playlist ? "Downloading playlist videos…" : "Downloading…"));
    elements.errorText.textContent = activeJob.error || "";
    elements.errorText.classList.toggle("hidden", !activeJob.error);
  } else {
    currentActiveJobId = "";
    elements.progressPanel.classList.add("hidden");
  }

  // Queue Panel
  if (queue.length > 0) {
    elements.queuePanel.classList.remove("hidden");
    elements.queueTitle.textContent = `DOWNLOAD QUEUE (${queue.length})`;
    elements.queueList.innerHTML = queue.map((qJob, idx) => `
      <div class="queue-item">
        <span class="queue-idx">#${idx + 1}</span>
        <span class="queue-title" title="${qJob.title || qJob.url}">${(qJob.is_playlist ? "📁 " : "") + (qJob.title || "YouTube item")}</span>
        <span class="queue-badge">${qJob.is_playlist ? "PLAYLIST · " : ""}${qJob.kind === "audio" ? "MP3" : qJob.quality + "p"}</span>
        <button type="button" class="queue-cancel-btn" data-cancel-id="${qJob.id}" title="Remove from queue">✕</button>
      </div>
    `).join("");

    elements.queueList.querySelectorAll("[data-cancel-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const jobId = btn.dataset.cancelId;
        btn.disabled = true;
        chrome.runtime.sendMessage({
          type: "cancel-download",
          jobId: jobId,
        }, () => {
          pollStatus();
        });
      });
    });
  } else {
    elements.queuePanel.classList.add("hidden");
  }
}

async function pollStatus() {
  try {
    const statusData = await OkjaApi.apiRequest("/api/status");
    renderStatus(statusData);
  } catch (_error) {
    // Companion service offline
  }
}

function startPolling() {
  pollStatus();
  pollTimer = setInterval(pollStatus, 800);
}

function updateCustomPrefixVisibility() {
  if (elements.customPrefixRow && elements.prefixType) {
    elements.customPrefixRow.classList.toggle("hidden", elements.prefixType.value !== "custom");
  }
}

function updateFormatQualityVisibility() {
  const isAudio = selectedKind() === "audio";
  if (elements.videoQualityRow) {
    elements.videoQualityRow.classList.toggle("hidden", isAudio);
  }
  if (elements.audioQualityRow) {
    elements.audioQualityRow.classList.toggle("hidden", !isAudio);
  }
}

async function startDownload() {
  showMessage("");
  elements.download.disabled = true;
  elements.download.classList.add("loading");
  const isQueueMode = elements.download.classList.contains("queue-mode");
  elements.download.innerHTML = `
    <span class="btn-spinner" aria-hidden="true"></span>
    <span>${isQueueMode ? "Adding to queue..." : "Starting download..."}</span>
  `;

  try {
    const settings = await OkjaApi.getSettings();
    const kind = selectedKind();
    const quality = kind === "audio"
      ? (elements.audioQuality ? elements.audioQuality.value : "320")
      : (elements.quality ? elements.quality.value : "1080");

    const isPlaylist = currentUrl.includes("/playlist") || Boolean(currentUrl.includes("list="));
    chrome.runtime.sendMessage({
      type: "start-download",
      url: currentUrl,
      isPlaylist,
      kind,
      quality,
      title: elements.videoTitle.textContent.replace(/^📁\s*/, ""),
      prefixType: elements.prefixType ? elements.prefixType.value : "number",
      customPrefix: elements.customPrefix ? elements.customPrefix.value.trim() : "",
      folder: elements.downloadFolder ? elements.downloadFolder.value.trim() : "",
      channels: settings.channels || 8,
      markWatched: settings.markWatched !== false,
      cookiesBrowser: settings.cookiesBrowser || "chrome",
    }, (res) => {
      elements.download.classList.remove("loading");
      if (chrome.runtime.lastError || !res?.ok) {
        elements.download.disabled = !currentUrl;
        updateDownloadButton(Boolean(currentActiveJobId));
        showMessage(res?.error || chrome.runtime.lastError?.message || "Failed to start download.");
      } else if (res?.allSkipped) {
        elements.download.disabled = !currentUrl;
        updateDownloadButton(Boolean(currentActiveJobId));
        showMessage("All videos in this playlist are already downloaded or queued.");
      } else if (res?.skippedCount && res.skippedCount > 0) {
        elements.download.disabled = !currentUrl;
        updateDownloadButton(true);
        showMessage(`Queued ${res.playlistCount || 0} items (${res.skippedCount} already downloaded/skipped).`, true);
        pollStatus();
      } else {
        pollStatus();
      }
    });
  } catch (error) {
    elements.download.classList.remove("loading");
    elements.download.disabled = !currentUrl;
    updateDownloadButton(Boolean(currentActiveJobId));
    showMessage(error.message);
  }
}

async function cancelActiveDownload() {
  if (!currentActiveJobId) return;
  try {
    elements.progressPanel.classList.add("hidden");
    elements.progressBar.style.width = "0%";
    chrome.runtime.sendMessage({
      type: "cancel-download",
      jobId: currentActiveJobId,
    }, () => {
      pollStatus();
    });
  } catch (error) {
    showMessage(error.message);
  }
}

async function handleClearQueue() {
  // Instantly clear UI so user sees immediate response
  elements.queuePanel.classList.add("hidden");
  elements.queueList.innerHTML = "";
  if (elements.btnClearQueue) elements.btnClearQueue.disabled = true;

  try {
    chrome.runtime.sendMessage({ type: "clear-queue" }, (res) => {
      if (elements.btnClearQueue) elements.btnClearQueue.disabled = false;
      if (res?.ok) {
        showMessage(`Queue cleared (${res.clearedCount || 0} items removed).`, true);
      } else {
        showMessage(res?.error || "Failed to clear queue.");
      }
      pollStatus();
    });
  } catch (err) {
    if (elements.btnClearQueue) elements.btnClearQueue.disabled = false;
    showMessage(err.message);
  }
}

async function initialize() {
  // Load saved preferences
  const settings = await OkjaApi.getSettings();
  if (elements.quality) {
    elements.quality.value = settings.defaultQuality || "1080";
  }
  if (elements.audioQuality) {
    elements.audioQuality.value = settings.defaultAudioQuality || "320";
  }
  const kindInput = document.querySelector(`input[name="kind"][value="${settings.defaultKind || "video"}"]`);
  if (kindInput) {
    kindInput.checked = true;
  }
  updateFormatQualityVisibility();

  if (elements.prefixType) {
    elements.prefixType.value = settings.prefixType || "number";
  }
  if (elements.customPrefix) {
    elements.customPrefix.value = settings.customPrefix || "";
  }
  if (elements.downloadFolder) {
    elements.downloadFolder.value = settings.downloadFolder || "";
  }
  updateCustomPrefixVisibility();

  // Detect current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const sourceUrl = tab?.url || "";
  const videoId = supportedVideoUrl(sourceUrl);

  if (videoId) {
    currentUrl = sourceUrl;
    const isPlaylist = videoId.startsWith("playlist:") || sourceUrl.includes("/playlist");
    const cleanTitle = (tab?.title || "")
      .replace(/\s*-\s*YouTube Music\s*$/i, "")
      .replace(/\s*-\s*YouTube\s*$/i, "")
      .trim() || (isPlaylist ? "YouTube Playlist" : "YouTube Track");
    elements.videoTitle.textContent = (isPlaylist ? "📁 " : "") + cleanTitle;
    const cleanId = videoId.replace("playlist:", "Playlist ");
    const hostLabel = sourceUrl.includes("music.youtube.com") ? "music.youtube.com" : "youtube.com";
    elements.videoUrl.textContent = `${hostLabel} · ${cleanId}`;
  } else {
    elements.videoTitle.textContent = "Open a YouTube video or music first";
    elements.videoUrl.textContent = "Navigate to a video or music track on YouTube to download.";
  }
  updateDownloadButton(false);

  startPolling();
}

elements.settings.addEventListener("click", showSettingsView);
elements.btnBack?.addEventListener("click", showMainView);
elements.btnPopout?.addEventListener("click", () => {
  chrome.windows.create({
    url: chrome.runtime.getURL("options.html"),
    type: "popup",
    width: 520,
    height: 700,
  });
});
elements.download.addEventListener("click", startDownload);
elements.cancel.addEventListener("click", cancelActiveDownload);
elements.btnClearQueue?.addEventListener("click", handleClearQueue);

elements.popupSettingsForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await savePopupSettings();
    setPopupSettingsResult("Preferences saved successfully.");
  } catch (err) {
    setPopupSettingsResult(err.message, true);
  }
});

elements.popupTestBtn?.addEventListener("click", async () => {
  try {
    await savePopupSettings();
    setPopupSettingsResult("Connecting to local service…");
    const health = await OkjaApi.apiRequest("/api/health");
    if (!health.ytDlpAvailable) {
      throw new Error("Connected, but yt-dlp is not available.");
    }
    setPopupSettingsResult(`Connected! Download dir: ${health.downloadDir}`);
  } catch (err) {
    setPopupSettingsResult(err.message, true);
  }
});

elements.popupClearCacheBtn?.addEventListener("click", () => {
  if (elements.popupClearCacheBtn) elements.popupClearCacheBtn.disabled = true;
  setPopupSettingsResult("Clearing download cache…");
  chrome.runtime.sendMessage({ type: "clear-cache" }, (res) => {
    if (elements.popupClearCacheBtn) elements.popupClearCacheBtn.disabled = false;
    if (res?.ok) {
      setPopupSettingsResult("Download cache cleared! Previously downloaded videos can now be re-downloaded.");
    } else {
      setPopupSettingsResult(res?.error || "Failed to clear cache.", true);
    }
  });
});

elements.popupSetupBtn?.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
});

document.querySelectorAll('input[name="popupDefaultKind"]').forEach((input) => {
  input.addEventListener("change", updatePopupSettingsQualityVisibility);
});

if (elements.popupPrefixType) {
  elements.popupPrefixType.addEventListener("change", updatePopupSettingsCustomPrefixVisibility);
}

document.querySelectorAll('input[name="kind"]').forEach((input) => {
  input.addEventListener("change", updateFormatQualityVisibility);
});

if (elements.prefixType) {
  elements.prefixType.addEventListener("change", updateCustomPrefixVisibility);
}

window.addEventListener("unload", () => {
  if (pollTimer) clearInterval(pollTimer);
});

async function startApp() {
  try {
    const { onboardingCompleted } = await chrome.storage.local.get("onboardingCompleted");
    if (!onboardingCompleted) {
      if (document.body) document.body.style.display = "none";
      const onboardingUrl = chrome.runtime.getURL("onboarding.html");
      const tabs = await chrome.tabs.query({ url: onboardingUrl });
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
        if (tabs[0].windowId) chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: onboardingUrl });
      }
      window.close();
      return;
    }
  } catch (_e) {}

  initialize().catch((error) => showMessage(error.message));
}

startApp();
