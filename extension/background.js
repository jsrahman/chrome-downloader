importScripts("shared.js");

const YOUTUBE_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be",
]);

function isVideoUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && YOUTUBE_HOSTS.has(url.hostname.toLowerCase());
  } catch (_error) {
    return false;
  }
}

let trackerTimer = null;
let lastKnownActiveJob = null;

function broadcastToTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  });
}

function notifyComplete(job) {
  const filename = job.filename ? job.filename.split("/").pop() : "";
  const title = job.title || "YouTube video";

  // 1. Native OS notification
  try {
    if (chrome.notifications) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icon128.png"),
        title: "Okja Saver - Download Complete! ✓",
        message: filename || `${title} saved to download folder.`,
      });
    }
  } catch (_e) {}

  // 2. Broadcast to tabs (YouTube content scripts and popup)
  broadcastToTabs({
    type: "download-complete",
    job,
    title,
    filename,
  });
}

function startTracking() {
  if (trackerTimer) return;
  trackerTimer = setInterval(async () => {
    try {
      const statusData = await OkjaApi.apiRequest("/api/status");
      const active = statusData.activeJob;

      if (lastKnownActiveJob && (!active || active.id !== lastKnownActiveJob.id)) {
        // Active job changed or completed
        try {
          const { job } = await OkjaApi.apiRequest(`/api/downloads/${lastKnownActiveJob.id}`);
          if (job && job.status === "complete") {
            notifyComplete(job);
          }
        } catch (_e) {}
      }

      lastKnownActiveJob = active;

      if (!active && statusData.queueCount === 0) {
        clearInterval(trackerTimer);
        trackerTimer = null;
      }
    } catch (_e) {
      clearInterval(trackerTimer);
      trackerTimer = null;
    }
  }, 1200);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) return;

  if (message.type === "get-status") {
    OkjaApi.apiRequest("/api/status")
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "start-download") {
    if (!isVideoUrl(message.url)) {
      sendResponse({ ok: false, error: "Invalid YouTube URL" });
      return;
    }
    OkjaApi.apiRequest("/api/downloads", {
      method: "POST",
      body: JSON.stringify({
        url: message.url,
        kind: message.kind || "video",
        quality: message.quality || "best",
        title: message.title || "",
        isPlaylist: Boolean(message.isPlaylist),
        prefixType: message.prefixType || "number",
        customPrefix: message.customPrefix || "",
        folder: message.folder || "",
      }),
    })
      .then((data) => {
        startTracking();
        broadcastToTabs({
          type: "download-started",
          job: data.job,
          queued: data.queued,
        });
        sendResponse({ ok: true, ...data });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "cancel-download") {
    if (!message.jobId) return;
    OkjaApi.apiRequest(`/api/downloads/${message.jobId}`, { method: "DELETE" })
      .then((data) => {
        broadcastToTabs({
          type: "download-cancelled",
          jobId: message.jobId,
        });
        sendResponse({ ok: true, ...data });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "open-download" && isVideoUrl(message.url)) {
    const title = String(message.title || "").slice(0, 300);
    const launchUrl = new URL(chrome.runtime.getURL("popup.html"));
    launchUrl.searchParams.set("fromShare", "1");
    launchUrl.searchParams.set("url", message.url);
    if (title) launchUrl.searchParams.set("title", title);

    chrome.storage.local.set({
      sharedVideo: { url: message.url, title, createdAt: Date.now() },
    }).then(() => chrome.tabs.create({ url: launchUrl.href }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
