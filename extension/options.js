const form = document.querySelector("#settingsForm");
const portInput = document.querySelector("#port");
const defaultQualitySelect = document.querySelector("#defaultQuality");
const qualityRow = document.querySelector("#qualityRow");
const prefixTypeSelect = document.querySelector("#prefixType");
const customPrefixRow = document.querySelector("#customPrefixRow");
const customPrefixInput = document.querySelector("#customPrefix");
const downloadFolderInput = document.querySelector("#downloadFolder");
const result = document.querySelector("#result");

function setResult(text, isError = false) {
  result.textContent = text;
  result.classList.toggle("error", isError);
}

function getSelectedKind() {
  const checked = document.querySelector('input[name="defaultKind"]:checked');
  return checked ? checked.value : "video";
}

function updateQualityRowVisibility() {
  const isAudio = getSelectedKind() === "audio";
  if (qualityRow) {
    qualityRow.classList.toggle("hidden", isAudio);
  }
}

function updateCustomPrefixVisibility() {
  if (customPrefixRow && prefixTypeSelect) {
    customPrefixRow.classList.toggle("hidden", prefixTypeSelect.value !== "custom");
  }
}

document.querySelectorAll('input[name="defaultKind"]').forEach((input) => {
  input.addEventListener("change", updateQualityRowVisibility);
});

if (prefixTypeSelect) {
  prefixTypeSelect.addEventListener("change", updateCustomPrefixVisibility);
}

async function save() {
  const port = Number(portInput.value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Enter a valid port number (1024-65535).");
  }

  const defaultKind = getSelectedKind();
  const defaultQuality = defaultQualitySelect.value || "1080";
  const prefixType = prefixTypeSelect ? prefixTypeSelect.value : "number";
  const customPrefix = customPrefixInput ? customPrefixInput.value.trim() : "";
  const downloadFolder = downloadFolderInput ? downloadFolderInput.value.trim() : "";

  await chrome.storage.local.set({
    port,
    defaultKind,
    defaultQuality,
    prefixType,
    customPrefix,
    downloadFolder,
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await save();
    setResult("Preferences saved successfully.");
  } catch (error) {
    setResult(error.message, true);
  }
});

document.querySelector("#test").addEventListener("click", async () => {
  try {
    await save();
    setResult("Connecting to local service…");
    const health = await OkjaApi.apiRequest("/api/health");
    if (!health.ytDlpAvailable) {
      throw new Error("Connected, but yt-dlp is not available.");
    }
    setResult(`Connected. Downloads save to: ${health.downloadDir}`);
  } catch (error) {
    setResult(error.message, true);
  }
});

OkjaApi.getSettings().then(({ port, defaultKind, defaultQuality, prefixType, customPrefix, downloadFolder }) => {
  portInput.value = port;
  if (defaultQualitySelect) defaultQualitySelect.value = defaultQuality || "1080";
  if (prefixTypeSelect) prefixTypeSelect.value = prefixType || "number";
  if (customPrefixInput) customPrefixInput.value = customPrefix || "";
  if (downloadFolderInput) downloadFolderInput.value = downloadFolder || "";
  const kindInput = document.querySelector(`input[name="defaultKind"][value="${defaultKind || "video"}"]`);
  if (kindInput) kindInput.checked = true;
  updateQualityRowVisibility();
  updateCustomPrefixVisibility();
});
