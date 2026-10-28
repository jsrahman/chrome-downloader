const elements = {
  downloadForm: document.querySelector("#downloadForm"),
  videoTitle: document.querySelector("#videoTitle"),
  videoUrl: document.querySelector("#videoUrl"),
  qualityRow: document.querySelector("#qualityRow"),
  quality: document.querySelector("#quality"),
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

// Task-Specific Alert Configurations
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
    position: "bottom-end",
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
  const activeJob = statusData.activeJob;
  const isDownloading = Boolean(activeJob && ["downloading", "queued"].includes(activeJob.status));
  const queue = statusData.queue || [];

  updateDownloadButton(isDownloading);

  // Check if previous active job completed
  if (previousJob && previousJob.status === "downloading" && (!activeJob || activeJob.id !== previousJob.id)) {
    const fn = previousJob.filename ? previousJob.filename.split("/").pop() : "";
    showAlert("complete", fn || "Saved to downloads folder.", undefined, 4500);
  }
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
      btn.addEventListener("click", async () => {
        const jobId = btn.dataset.cancelId;
        btn.disabled = true;
        try {
          await OkjaApi.apiRequest(`/api/downloads/${jobId}`, { method: "DELETE" });
          showAlert("cancelled", "Removed item from queue.");
          pollStatus();
        } catch (_e) {}
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
  pollTimer = setInterval(pollStatus, 600);
}

function updateCustomPrefixVisibility() {
  if (elements.customPrefixRow && elements.prefixType) {
    elements.customPrefixRow.classList.toggle("hidden", elements.prefixType.value !== "custom");
  }
}

async function startDownload() {
  showMessage("");
  elements.download.disabled = true;
  try {
    const settings = await OkjaApi.getSettings();
    const res = await OkjaApi.apiRequest("/api/downloads", {
      method: "POST",
      body: JSON.stringify({
        url: currentUrl,
        kind: selectedKind(),
        quality: elements.quality.value,
        title: elements.videoTitle.textContent,
        prefixType: elements.prefixType ? elements.prefixType.value : "number",
        customPrefix: elements.customPrefix ? elements.customPrefix.value.trim() : "",
        folder: elements.downloadFolder ? elements.downloadFolder.value.trim() : "",
        channels: settings.channels || 8,
      }),
    });

    if (res.queued) {
      showAlert("queue", "Video queued. Will download in sequence.");
    } else {
      showAlert("start", `Saving video with ${elements.quality.value}p...`);
    }

    pollStatus();
  } catch (error) {
    showAlert("error", error.message);
    showMessage(error.message);
  } finally {
    elements.download.disabled = !currentUrl;
  }
}

async function cancelActiveDownload() {
  if (!currentActiveJobId) return;
  try {
    await OkjaApi.apiRequest(`/api/downloads/${currentActiveJobId}`, { method: "DELETE" });
    showAlert("cancelled", "Download cancelled.");
    pollStatus();
  } catch (error) {
    showAlert("error", error.message);
    showMessage(error.message);
  }
}

async function initialize() {
  // Load saved preferences
  const settings = await OkjaApi.getSettings();
  if (elements.quality) {
    elements.quality.value = settings.defaultQuality || "1080";
  }
  const kindInput = document.querySelector(`input[name="kind"][value="${settings.defaultKind || "video"}"]`);
  if (kindInput) {
    kindInput.checked = true;
    elements.qualityRow.classList.toggle("hidden", settings.defaultKind === "audio");
  }

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
elements.download.addEventListener("click", startDownload);
elements.cancel.addEventListener("click", cancelActiveDownload);

document.querySelectorAll('input[name="kind"]').forEach((input) => {
  input.addEventListener("change", () => {
    elements.qualityRow.classList.toggle("hidden", selectedKind() === "audio");
  });
});

if (elements.prefixType) {
  elements.prefixType.addEventListener("change", updateCustomPrefixVisibility);
}

window.addEventListener("unload", () => {
  if (pollTimer) clearInterval(pollTimer);
});

initialize().catch((error) => showMessage(error.message));
