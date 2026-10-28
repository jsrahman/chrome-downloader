const DEFAULT_SETTINGS = Object.freeze({
  port: 43117,
  defaultKind: "video",     // "video" | "audio"
  defaultQuality: "1080",   // "best" | "1080" | "720" | "480" | "360"
  prefixType: "number",     // "number" | "roman" | "alphabet" | "custom" | "none"
  customPrefix: "",
  downloadFolder: "",
});

async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(DEFAULT_SETTINGS)) };
}

function serviceUrl(port, path) {
  return `http://127.0.0.1:${port}${path}`;
}

async function apiRequest(path, options = {}) {
  const { port } = await getSettings();

  let response;
  try {
    response = await fetch(serviceUrl(port, path), {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch (_error) {
    throw new Error("Local service is unavailable. Start scripts/start-service.sh.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Service returned ${response.status}.`);
  }
  return data;
}

globalThis.OkjaApi = { apiRequest, getSettings, serviceUrl, DEFAULT_SETTINGS };
