importScripts("shared.js");

const YOUTUBE_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be",
]);
const NATIVE_HOST = "com.okja.saver";

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
let shutdownTimer = null;

function updateBadge(input) {
  try {
    let count = 0;
    if (typeof input === "number") {
      count = Math.max(0, input);
    } else if (input && typeof input === "object") {
      const queueCount = Number(input.queueCount ?? (Array.isArray(input.queue) ? input.queue.length : 0));
      const activeCount = (input.activeJob && ["downloading", "queued"].includes(input.activeJob.status)) ? 1 : 0;
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

async function isServiceAlive() {
  try {
    const { port } = await OkjaApi.getSettings();
    const res = await fetch(OkjaApi.serviceUrl(port, "/api/status"));
    return res.ok;
  } catch (_e) {
    return false;
  }
}

function launchNativeService(port) {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.sendNativeMessage) {
      reject(new Error("Native messaging is not supported in this browser environment."));
      return;
    }
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST,
      { action: "start", port },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Failed to launch companion service."));
        } else {
          resolve(response);
        }
      }
    );
  });
}

async function ensureServiceRunning() {
  if (await isServiceAlive()) {
    return true;
  }

  const { port } = await OkjaApi.getSettings();

  try {
    await launchNativeService(port);
  } catch (err) {
    console.warn("Native host start error:", err);
    throw new Error(
      "Download service is not running. Please run ./scripts/install-native-host.sh once to enable auto-start, or ./scripts/start-service.sh."
    );
  }

  // Poll until service is responsive (up to 4 seconds)
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (await isServiceAlive()) {
      return true;
    }
  }

  throw new Error("Download service started but failed to respond on port " + port);
}

function scheduleShutdown() {
  if (shutdownTimer) clearTimeout(shutdownTimer);
  shutdownTimer = setTimeout(async () => {
    try {
      const statusData = await OkjaApi.apiRequest("/api/status");
      const active = statusData?.activeJob;
      const queueCount = Number(statusData?.queueCount ?? (Array.isArray(statusData?.queue) ? statusData.queue.length : 0));
      if (!active && queueCount === 0) {
        await OkjaApi.apiRequest("/api/shutdown", { method: "POST" });
      }
    } catch (_e) {
      // Service may already be closed
    } finally {
      shutdownTimer = null;
    }
  }, 1500);
}

async function checkAndUpdateStatus() {
  try {
    const statusData = await OkjaApi.apiRequest("/api/status");
    updateBadge(statusData);
    if ((statusData?.activeJob || (statusData?.queueCount && statusData.queueCount > 0)) && !trackerTimer) {
      startTracking();
    }
    return statusData;
  } catch (_e) {
    updateBadge(null);
    return null;
  }
}

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

  // 2. Broadcast to browser tabs
  broadcastToTabs({
    type: "download-complete",
    job,
    title,
    filename,
  });
}

function startTracking() {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
  if (trackerTimer) return;
  trackerTimer = setInterval(async () => {
    try {
      const statusData = await OkjaApi.apiRequest("/api/status");
      const active = statusData?.activeJob;
      updateBadge(statusData);

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

      const queueCount = Number(statusData?.queueCount ?? (Array.isArray(statusData?.queue) ? statusData.queue.length : 0));
      if (!active && queueCount === 0) {
        updateBadge(null);
        clearInterval(trackerTimer);
        trackerTimer = null;
        scheduleShutdown();
      }
    } catch (_e) {
      updateBadge(null);
      clearInterval(trackerTimer);
      trackerTimer = null;
    }
  }, 1200);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) return;

  if (message.type === "sync-badge") {
    checkAndUpdateStatus()
      .then((data) => sendResponse({ ok: true, data }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "get-status") {
    OkjaApi.apiRequest("/api/status")
      .then((data) => {
        updateBadge(data);
        sendResponse({ ok: true, data });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "start-download") {
    if (!isVideoUrl(message.url)) {
      sendResponse({ ok: false, error: "Invalid YouTube URL" });
      return;
    }
    const downloadPayload = {
      url: message.url,
      kind: message.kind || "video",
      quality: message.quality || "best",
      title: message.title || "",
      isPlaylist: Boolean(message.isPlaylist),
      prefixType: message.prefixType || "number",
      customPrefix: message.customPrefix || "",
      folder: message.folder || "",
      channels: Number(message.channels) || 8,
    };

    (async () => {
      try {
        await ensureServiceRunning();
        const data = await OkjaApi.apiRequest("/api/downloads", {
          method: "POST",
          body: JSON.stringify(downloadPayload),
        });
        startTracking();
        checkAndUpdateStatus();
        broadcastToTabs({
          type: "download-started",
          job: data.job,
          queued: data.queued,
          title: message.title || data.job?.title || "",
        });
        sendResponse({ ok: true, ...data });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === "cancel-download") {
    if (!message.jobId) return;
    OkjaApi.apiRequest(`/api/downloads/${message.jobId}`, { method: "DELETE" })
      .then((data) => {
        checkAndUpdateStatus();
        broadcastToTabs({
          type: "download-cancelled",
          jobId: message.jobId,
        });
        sendResponse({ ok: true, ...data });
        scheduleShutdown();
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "open-onboarding") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "open-download" && isVideoUrl(message.url)) {
    (async () => {
      const { onboardingCompleted } = await chrome.storage.local.get("onboardingCompleted");
      if (!onboardingCompleted) {
        chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
        sendResponse({ ok: false, error: "Setup and verification required." });
        return;
      }
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
    })();
    return true;
  }
});

// Manage dynamic action popup based on package verification state
async function syncActionPopup() {
  try {
    const { onboardingCompleted } = await chrome.storage.local.get("onboardingCompleted");
    if (onboardingCompleted) {
      await chrome.action.setPopup({ popup: "popup.html" });
    } else {
      // Unset popup so clicking the action icon triggers chrome.action.onClicked
      await chrome.action.setPopup({ popup: "" });
    }
  } catch (_e) {}
}

if (chrome.action?.onClicked) {
  chrome.action.onClicked.addListener(async () => {
    const { onboardingCompleted } = await chrome.storage.local.get("onboardingCompleted");
    if (!onboardingCompleted) {
      const onboardingUrl = chrome.runtime.getURL("onboarding.html");
      const tabs = await chrome.tabs.query({ url: onboardingUrl });
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
        if (tabs[0].windowId) chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: onboardingUrl });
      }
    } else {
      await chrome.action.setPopup({ popup: "popup.html" });
      if (chrome.action.openPopup) {
        try {
          await chrome.action.openPopup();
        } catch (_e) {}
      }
    }
  });
}

// React instantly to verification status changes in storage
chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area === "local" && ("onboardingCompleted" in changes)) {
    syncActionPopup();
  }
});

// Periodic background check via alarms API to keep badge updated if active
try {
  if (chrome.alarms) {
    chrome.alarms.create("status-badge-sync", { periodInMinutes: 1 });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === "status-badge-sync") {
        checkAndUpdateStatus();
      }
    });
  }
} catch (_e) {}

checkAndUpdateStatus();
syncActionPopup();
chrome.runtime.onStartup.addListener(() => {
  checkAndUpdateStatus();
  syncActionPopup();
});
chrome.runtime.onInstalled.addListener(async (details) => {
  await checkAndUpdateStatus();
  await syncActionPopup();
  if (details?.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }
});
