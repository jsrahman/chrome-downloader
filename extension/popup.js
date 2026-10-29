const elements = {
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
  message: document.querySelector("#message"),
  settings: document.querySelector("#settings"),
  prefixType: document.querySelector("#prefixType"),
  customPrefixRow: document.querySelector("#customPrefixRow"),
  customPrefix: document.querySelector("#customPrefix"),
  downloadFolder: document.querySelector("#downloadFolder"),
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
    const match = url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/);
    return match?.[1] || "";
  } catch (_error) {
    return "";
  }
}

function updateDownloadButton(isDownloading) {
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

function openOptions() {
  chrome.runtime.openOptionsPage();
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
  try {
    const settings = await OkjaApi.getSettings();
    const kind = selectedKind();
    const quality = kind === "audio"
      ? (elements.audioQuality ? elements.audioQuality.value : "320")
      : (elements.quality ? elements.quality.value : "1080");

    chrome.runtime.sendMessage({
      type: "start-download",
      url: currentUrl,
      kind,
      quality,
      title: elements.videoTitle.textContent,
      prefixType: elements.prefixType ? elements.prefixType.value : "number",
      customPrefix: elements.customPrefix ? elements.customPrefix.value.trim() : "",
      folder: elements.downloadFolder ? elements.downloadFolder.value.trim() : "",
      channels: settings.channels || 8,
    }, (res) => {
      elements.download.disabled = !currentUrl;
      if (chrome.runtime.lastError || !res?.ok) {
        showMessage(res?.error || chrome.runtime.lastError?.message || "Failed to start download.");
      } else {
        pollStatus();
      }
    });
  } catch (error) {
    elements.download.disabled = !currentUrl;
    showMessage(error.message);
  }
}

async function cancelActiveDownload() {
  if (!currentActiveJobId) return;
  try {
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
    elements.videoTitle.textContent = tab?.title?.replace(/\s*-\s*YouTube\s*$/, "").trim() || "YouTube video";
    elements.videoUrl.textContent = `youtube.com · ${videoId}`;
  } else {
    elements.videoTitle.textContent = "Open a YouTube video first";
    elements.videoUrl.textContent = "Navigate to a video on YouTube to download.";
  }
  updateDownloadButton(false);

  startPolling();
}

elements.settings.addEventListener("click", openOptions);
document.querySelector("#btnOpenOnboard")?.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
});
elements.download.addEventListener("click", startDownload);
elements.cancel.addEventListener("click", cancelActiveDownload);

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
