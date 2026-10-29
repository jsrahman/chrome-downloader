const NATIVE_HOST = "com.okja.saver";

const LINUX_DISTRO_COMMANDS = {
  fedora: {
    name: "Fedora / RHEL / CentOS",
    ffmpeg: "sudo dnf install -y ffmpeg-free || sudo dnf install -y ffmpeg",
  },
  ubuntu: {
    name: "Ubuntu / Debian / Mint / Pop!_OS",
    ffmpeg: "sudo apt install -y ffmpeg",
  },
  arch: {
    name: "Arch Linux / Manjaro / EndeavourOS",
    ffmpeg: "sudo pacman -S --needed ffmpeg",
  },
  opensuse: {
    name: "openSUSE (Leap / Tumbleweed)",
    ffmpeg: "sudo zypper install -y ffmpeg",
  },
  alpine: {
    name: "Alpine Linux",
    ffmpeg: "sudo apk add ffmpeg",
  },
};

const elements = {
  // Stepper dots
  stepDot1: document.querySelector("#stepDot1"),
  stepDot2: document.querySelector("#stepDot2"),
  stepDot3: document.querySelector("#stepDot3"),

  // Stages
  stageInstall: document.querySelector("#stageInstall"),
  stageVerify: document.querySelector("#stageVerify"),
  stageSuccess: document.querySelector("#stageSuccess"),

  // Stage 1 OS Info & commands
  osBadge: document.querySelector("#osBadge"),
  osNameText: document.querySelector("#osNameText"),
  btnStartSetup: document.querySelector("#btnStartSetup"),
  btnShowManual: document.querySelector("#btnShowManual"),
  manualInstructions: document.querySelector("#manualInstructions"),
  manualOsLabel: document.querySelector("#manualOsLabel"),
  manualCommandCode: document.querySelector("#manualCommandCode"),
  copyManualBtn: document.querySelector("#copyManualBtn"),
  distroTabsRow: document.querySelector("#distroTabsRow"),
  projectLocationPath: document.querySelector("#projectLocationPath"),
  verifyLocationPath: document.querySelector("#verifyLocationPath"),
  locationDetectBadge: document.querySelector("#locationDetectBadge"),

  // Error Alert on Stage 1
  errorAlert: document.querySelector("#errorAlert"),
  errorUl: document.querySelector("#errorUl"),
  fixCommandCode: document.querySelector("#fixCommandCode"),
  copyFixBtn: document.querySelector("#copyFixBtn"),

  // Checklist items in Stage 2
  chkPython: document.querySelector("#chkPython"),
  txtPython: document.querySelector("#txtPython"),
  btnFixPython: document.querySelector("#btnFixPython"),

  chkNative: document.querySelector("#chkNative"),
  txtNative: document.querySelector("#txtNative"),
  btnFixNative: document.querySelector("#btnFixNative"),

  chkYtDlp: document.querySelector("#chkYtDlp"),
  txtYtDlp: document.querySelector("#txtYtDlp"),
  btnFixYtDlp: document.querySelector("#btnFixYtDlp"),

  chkFfmpeg: document.querySelector("#chkFfmpeg"),
  txtFfmpeg: document.querySelector("#txtFfmpeg"),
  btnFixFfmpeg: document.querySelector("#btnFixFfmpeg"),

  chkService: document.querySelector("#chkService"),
  txtService: document.querySelector("#txtService"),
  btnFixService: document.querySelector("#btnFixService"),

  verifyProgressBar: document.querySelector("#verifyProgressBar"),

  // Failure & Reinstall Card in Stage 2 (stays on Stage 2)
  verifyFailCard: document.querySelector("#verifyFailCard"),
  verifyFailTitle: document.querySelector("#verifyFailTitle"),
  verifyFailBadge: document.querySelector("#verifyFailBadge"),
  verifyFailSub: document.querySelector("#verifyFailSub"),
  verifyErrorList: document.querySelector("#verifyErrorList"),
  btnStage2Reinstall: document.querySelector("#btnStage2Reinstall"),
  btnStage2Recheck: document.querySelector("#btnStage2Recheck"),
  verifyOsText: document.querySelector("#verifyOsText"),
  verifyTerminalCode: document.querySelector("#verifyTerminalCode"),
  copyVerifyCodeBtn: document.querySelector("#copyVerifyCodeBtn"),

  // Success screen
  resPythonVer: document.querySelector("#resPythonVer"),
  resYtDlpVer: document.querySelector("#resYtDlpVer"),
  resFfmpegVer: document.querySelector("#resFfmpegVer"),
  btnOpenYouTube: document.querySelector("#btnOpenYouTube"),
  btnOpenOptions: document.querySelector("#btnOpenOptions"),
};

let detectedDistroKey = null;
let detectedProjectDir = "";

function detectOS() {
  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  if (/Linux/i.test(platform) || /Linux/i.test(userAgent)) return "Linux";
  if (/Mac/i.test(platform) || /Macintosh/i.test(userAgent)) return "macOS";
  if (/Win/i.test(platform) || /Windows/i.test(userAgent)) return "Windows";
  return "Linux";
}

function detectInitialDistroHint() {
  const ua = (navigator.userAgent || "").toLowerCase();
  if (ua.includes("fedora") || /fc[0-9]{2}/.test(ua) || ua.includes("redhat") || ua.includes("rhel")) {
    return "fedora";
  }
  if (ua.includes("arch") || ua.includes("manjaro")) {
    return "arch";
  }
  if (ua.includes("suse")) {
    return "opensuse";
  }
  if (ua.includes("alpine")) {
    return "alpine";
  }
  if (ua.includes("ubuntu") || ua.includes("debian") || ua.includes("mint") || ua.includes("pop!_os")) {
    return "ubuntu";
  }
  return null;
}

const currentOS = detectOS();

function getFolderSetupCommand(distroKey = detectedDistroKey) {
  if (detectedProjectDir) {
    if (currentOS === "macOS") {
      return `cd "${detectedProjectDir}" && sh setup-mac.sh`;
    }
    if (currentOS === "Windows") {
      return `cd /d "${detectedProjectDir}" && setup-windows.bat`;
    }
    return `cd "${detectedProjectDir}" && sh setup-linux.sh`;
  }

  // Universal self-locating commands when project directory is not yet registered
  if (currentOS === "macOS") {
    return `f=$(find ~ -name setup-mac.sh 2>/dev/null | head -1) && cd "$(dirname "$f")" && sh setup-mac.sh`;
  }
  if (currentOS === "Windows") {
    return `setup-windows.bat`;
  }
  return `f=$(find ~ -name setup-linux.sh 2>/dev/null | head -1) && cd "$(dirname "$f")" && sh setup-linux.sh`;
}

function updateCommandTexts() {
  const cmd = getFolderSetupCommand(detectedDistroKey);
  if (elements.manualCommandCode) elements.manualCommandCode.textContent = cmd;
  if (elements.fixCommandCode) elements.fixCommandCode.textContent = cmd;
  if (elements.verifyTerminalCode) elements.verifyTerminalCode.textContent = cmd;

  if (detectedProjectDir) {
    if (elements.projectLocationPath) elements.projectLocationPath.textContent = detectedProjectDir;
    if (elements.verifyLocationPath) elements.verifyLocationPath.textContent = detectedProjectDir;
    if (elements.locationDetectBadge) elements.locationDetectBadge.textContent = "Verified Local";
  } else {
    const locText = currentOS === "Windows"
      ? "%USERPROFILE%\\Downloads\\okja-youtube-saver (or your unpacked folder)"
      : "Auto-locates unpacked directory anywhere in your home folder";
    if (elements.projectLocationPath) elements.projectLocationPath.textContent = locText;
    if (elements.verifyLocationPath) elements.verifyLocationPath.textContent = locText;
    if (elements.locationDetectBadge) elements.locationDetectBadge.textContent = "Auto-Locate";
  }
}

function setupOSBadges() {
  if (currentOS === "Linux") {
    elements.manualOsLabel.textContent = "Linux";
    const hint = detectInitialDistroHint();
    if (hint) {
      selectDistro(hint);
    } else {
      elements.osNameText.textContent = "Detected OS: Linux";
      updateCommandTexts();
    }
  } else if (currentOS === "macOS") {
    elements.osNameText.textContent = "Detected OS: macOS (Apple Silicon / Intel)";
    elements.manualOsLabel.textContent = "macOS";
    updateCommandTexts();
    if (elements.distroTabsRow) elements.distroTabsRow.style.display = "none";
  } else {
    elements.osNameText.textContent = "Detected OS: Windows (x64)";
    elements.manualOsLabel.textContent = "Windows";
    updateCommandTexts();
    if (elements.distroTabsRow) elements.distroTabsRow.style.display = "none";
  }
}

function selectDistro(key) {
  detectedDistroKey = key;
  const cfg = LINUX_DISTRO_COMMANDS[key];
  if (cfg) {
    elements.osNameText.textContent = `Detected OS: ${cfg.name}`;
    if (elements.verifyOsText) elements.verifyOsText.textContent = cfg.name;
  }
  updateCommandTexts();

  document.querySelectorAll(".distro-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.distro === key);
  });
}

function applyDistroInfo(distroInfo, projectDir = null) {
  if (projectDir) {
    detectedProjectDir = projectDir;
  }
  if (!distroInfo || distroInfo.os !== "linux") {
    updateCommandTexts();
    return;
  }
  elements.osNameText.textContent = `Detected OS: ${distroInfo.name}`;
  const family = (distroInfo.family || distroInfo.id || "").toLowerCase();

  if (family.includes("fedora") || family.includes("rhel") || distroInfo.id === "fedora" || distroInfo.pkg_mgr?.includes("dnf")) {
    selectDistro("fedora");
  } else if (family.includes("debian") || family.includes("ubuntu") || distroInfo.id === "ubuntu" || distroInfo.id === "debian") {
    selectDistro("ubuntu");
  } else if (family.includes("arch") || distroInfo.id === "arch") {
    selectDistro("arch");
  } else if (family.includes("suse") || family.includes("opensuse")) {
    selectDistro("opensuse");
  } else if (family.includes("alpine")) {
    selectDistro("alpine");
  }
  updateCommandTexts();
}

async function probeEnvironment() {
  try {
    let diag = null;
    try {
      diag = await callNative("check");
    } catch (_e) {
      try {
        diag = await OkjaApi.apiRequest("/api/health");
      } catch (_e2) {}
    }

    const dir = diag?.project_dir || diag?.projectDir;
    if (dir) {
      detectedProjectDir = dir;
    }
    const distroInfo = diag?.distro;
    if (distroInfo) {
      applyDistroInfo(distroInfo, dir);
    } else {
      updateCommandTexts();
    }
  } catch (_err) {}
}

function setStep(stepIndex) {
  // Reset stages
  elements.stageInstall.classList.toggle("hidden", stepIndex !== 1);
  elements.stageVerify.classList.toggle("hidden", stepIndex !== 2);
  elements.stageSuccess.classList.toggle("hidden", stepIndex !== 3);

  // Stepper dots
  elements.stepDot1.className = `step-item ${stepIndex === 1 ? "active" : stepIndex > 1 ? "completed" : ""}`;
  elements.stepDot2.className = `step-item ${stepIndex === 2 ? "active" : stepIndex > 2 ? "completed" : ""}`;
  elements.stepDot3.className = `step-item ${stepIndex === 3 ? "active" : ""}`;
}

function setCheckState(el, status, subtitle, fixBtn = null, fixLabel = "⚡ Reinstall") {
  el.className = `check-item ${status}`;
  const badge = el.querySelector(".check-status-badge");
  const sub = el.querySelector(".muted");
  if (sub && subtitle) sub.textContent = subtitle;

  if (fixBtn) {
    if (status === "failed") {
      fixBtn.classList.remove("hidden");
      fixBtn.textContent = fixLabel;
    } else {
      fixBtn.classList.add("hidden");
    }
  }

  if (status === "ok") {
    badge.innerHTML = "✓ Ready";
  } else if (status === "failed") {
    badge.innerHTML = "✕ Failed";
  } else {
    badge.innerHTML = '<span class="spinner"></span> Checking';
  }
}

async function callNative(action, port = 43117) {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.sendNativeMessage) {
      reject(new Error("Native messaging is not supported in this browser context."));
      return;
    }
    chrome.runtime.sendNativeMessage(NATIVE_HOST, { action, port }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Native host not found"));
      } else {
        resolve(response);
      }
    });
  });
}

async function verifyAllPackages() {
  setStep(2);
  if (elements.verifyFailCard) elements.verifyFailCard.classList.add("hidden");
  elements.verifyProgressBar.style.width = "10%";

  const errors = [];
  let diagnostics = null;
  let nativeOk = false;

  // Reset mini-buttons
  [elements.btnFixPython, elements.btnFixNative, elements.btnFixYtDlp, elements.btnFixFfmpeg, elements.btnFixService].forEach((b) => {
    if (b) b.classList.add("hidden");
  });

  // 1. Check Native Messaging Host
  try {
    diagnostics = await callNative("check");
    nativeOk = true;
    setCheckState(elements.chkNative, "ok", "com.okja.saver registered and responding", elements.btnFixNative);
  } catch (err) {
    setCheckState(elements.chkNative, "failed", err.message || "Host manifest not found in browser", elements.btnFixNative, "⚡ Reconnect");
    errors.push("Native messaging host is not registered with your browser.");
  }
  elements.verifyProgressBar.style.width = "30%";
  await new Promise((r) => setTimeout(r, 200));

  // If native messaging failed, also probe HTTP /api/health in case service was started manually
  let health = null;
  try {
    health = await OkjaApi.apiRequest("/api/health");
  } catch (_e) {}

  // Apply actual detected Linux distro & project directory if reported by local companion
  const dir = diagnostics?.project_dir || health?.projectDir;
  if (dir) detectedProjectDir = dir;
  const distroInfo = diagnostics?.distro || health?.distro;
  if (distroInfo) {
    applyDistroInfo(distroInfo, dir);
  }

  // 2. Check Python Environment
  const pyVer = diagnostics?.python_version || health?.pythonVersion || "";
  if (pyVer) {
    setCheckState(elements.chkPython, "ok", `Python ${pyVer} detected`, elements.btnFixPython);
  } else {
    setCheckState(elements.chkPython, "failed", "Python 3.10+ was not detected on system", elements.btnFixPython, "⚡ Install");
    errors.push("Python 3 is not installed or not found on PATH.");
  }
  elements.verifyProgressBar.style.width = "50%";
  await new Promise((r) => setTimeout(r, 200));

  // 3. Check yt-dlp core engine
  const ytDlpOk = Boolean(diagnostics?.yt_dlp?.ok || health?.ytDlpAvailable);
  if (ytDlpOk) {
    setCheckState(elements.chkYtDlp, "ok", "yt-dlp core engine ready", elements.btnFixYtDlp);
  } else {
    setCheckState(elements.chkYtDlp, "failed", "yt-dlp executable not found in .venv or PATH", elements.btnFixYtDlp, "⚡ Install");
    errors.push("yt-dlp is not installed in the environment.");
  }
  elements.verifyProgressBar.style.width = "70%";
  await new Promise((r) => setTimeout(r, 200));

  // 4. Check ffmpeg media multiplexer
  const ffmpegOk = Boolean(diagnostics?.ffmpeg?.ok || health?.ffmpegAvailable);
  if (ffmpegOk) {
    setCheckState(elements.chkFfmpeg, "ok", "ffmpeg multiplexer ready for merging & MP3s", elements.btnFixFfmpeg);
  } else {
    setCheckState(elements.chkFfmpeg, "failed", "ffmpeg is missing (required for video/audio merge & MP3)", elements.btnFixFfmpeg, "⚡ Install");
    errors.push("ffmpeg is not installed on your system.");
  }
  elements.verifyProgressBar.style.width = "85%";
  await new Promise((r) => setTimeout(r, 200));

  // 5. Test companion on-demand lifecycle
  let serviceOk = false;
  if (nativeOk) {
    try {
      const startRes = await callNative("start");
      if (startRes && startRes.ok) {
        serviceOk = true;
        setCheckState(elements.chkService, "ok", "On-demand launcher verified (auto-exits on completion)", elements.btnFixService);
      } else {
        setCheckState(elements.chkService, "failed", "Failed to start service process", elements.btnFixService, "⚡ Start");
        errors.push("Companion service failed to start on port 43117.");
      }
    } catch (e) {
      setCheckState(elements.chkService, "failed", e.message, elements.btnFixService, "⚡ Start");
      errors.push("Companion service lifecycle check failed.");
    }
  } else if (health?.ok) {
    serviceOk = true;
    setCheckState(elements.chkService, "ok", "Service is responding on local port", elements.btnFixService);
  } else {
    setCheckState(elements.chkService, "failed", "Service is unreachable", elements.btnFixService, "⚡ Start");
  }
  elements.verifyProgressBar.style.width = "100%";
  await new Promise((r) => setTimeout(r, 250));

  // ALL CHECKS EVALUATION
  const allReady = nativeOk && ytDlpOk && ffmpegOk && errors.length === 0;

  if (!allReady) {
    // CRITICAL REQUIREMENT: Stay on Stage 2 (Verification page)! Do NOT switch to Stage 1!
    setStep(2);
    await chrome.storage.local.set({ onboardingCompleted: false });
    if (chrome.action?.setPopup) {
      try { chrome.action.setPopup({ popup: "" }); } catch (_e) {}
    }

    // Reveal and populate Stage 2 failure card with Reinstall options
    if (elements.verifyFailCard) {
      elements.verifyFailCard.classList.remove("hidden");
      elements.verifyErrorList.innerHTML = errors.map((err) => `<li>${err}</li>`).join("");
      elements.verifyFailBadge.textContent = `${errors.length} issue${errors.length > 1 ? "s" : ""}`;

      const cmd = getFolderSetupCommand(detectedDistroKey);
      let osLabel = "Linux";
      if (currentOS === "Linux") {
        const distroCfg = detectedDistroKey ? LINUX_DISTRO_COMMANDS[detectedDistroKey] : null;
        osLabel = distroInfo?.name || distroCfg?.name || "Linux";
      } else if (currentOS === "macOS") {
        osLabel = "macOS";
      } else {
        osLabel = "Windows";
      }

      elements.verifyOsText.textContent = osLabel;
      elements.verifyTerminalCode.textContent = cmd;
      updateCommandTexts();
      elements.verifyFailCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    return;
  }

  // All packages are verified! Hide failure card and transition to Stage 3
  if (elements.verifyFailCard) elements.verifyFailCard.classList.add("hidden");
  elements.resPythonVer.textContent = pyVer || "Ready (v3.10+)";
  elements.resYtDlpVer.textContent = diagnostics?.yt_dlp?.path ? "Installed & configured" : "Installed";
  elements.resFfmpegVer.textContent = diagnostics?.ffmpeg?.path ? "Installed & configured" : "Installed";

  await chrome.storage.local.set({ onboardingCompleted: true });
  if (chrome.action?.setPopup) {
    try { chrome.action.setPopup({ popup: "popup.html" }); } catch (_e) {}
  }
  setStep(3);
}

// Unified cross-platform reinstall handler
async function handleReinstall(btn = null, target = "all") {
  const originalText = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Installing…';
  }
  if (elements.btnStage2Reinstall && btn !== elements.btnStage2Reinstall) {
    elements.btnStage2Reinstall.disabled = true;
    elements.btnStage2Reinstall.innerHTML = '<span><span class="spinner"></span> Installing packages…</span>';
  }

  try {
    // 1. Try Native Messaging setup action (cross-platform on-demand installer)
    let res = null;
    try {
      res = await callNative("setup");
    } catch (_e) {
      // 2. Try HTTP setup if service is running
      try {
        res = await OkjaApi.apiRequest("/api/setup");
      } catch (_e2) {}
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
    if (elements.btnStage2Reinstall) {
      elements.btnStage2Reinstall.disabled = false;
      elements.btnStage2Reinstall.innerHTML = '<span>⚡ Reinstall Missing Packages</span>';
    }
  }

  // Re-run package verification
  await verifyAllPackages();
}

// Copy button handlers
function setupCopyButtons() {
  elements.copyFixBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(elements.fixCommandCode.textContent);
    elements.copyFixBtn.textContent = "Copied! ✓";
    setTimeout(() => { elements.copyFixBtn.textContent = "Copy"; }, 2000);
  });

  elements.copyManualBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(elements.manualCommandCode.textContent);
    elements.copyManualBtn.textContent = "Copied! ✓";
    setTimeout(() => { elements.copyManualBtn.textContent = "Copy"; }, 2000);
  });

  if (elements.copyVerifyCodeBtn) {
    elements.copyVerifyCodeBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(elements.verifyTerminalCode.textContent);
      elements.copyVerifyCodeBtn.textContent = "Copied! ✓";
      setTimeout(() => { elements.copyVerifyCodeBtn.textContent = "Copy"; }, 2000);
    });
  }
}

// Distro tabs click handlers
document.querySelectorAll(".distro-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    selectDistro(tab.dataset.distro);
  });
});

// Stage 1 Start Setup Button
elements.btnStartSetup.addEventListener("click", async () => {
  elements.btnStartSetup.disabled = true;
  elements.btnStartSetup.innerHTML = '<span><span class="spinner"></span> Installing packages automatically…</span>';

  try {
    await callNative("setup");
  } catch (_e) {
    try {
      await OkjaApi.apiRequest("/api/setup");
    } catch (_e2) {}
  } finally {
    elements.btnStartSetup.disabled = false;
    elements.btnStartSetup.innerHTML = '<span>⚡ 1-Click Automated Install & Verify</span>';
  }

  verifyAllPackages();
});

// Stage 2 Reinstall & Re-verify buttons
if (elements.btnStage2Reinstall) {
  elements.btnStage2Reinstall.addEventListener("click", () => handleReinstall(elements.btnStage2Reinstall, "all"));
}
if (elements.btnStage2Recheck) {
  elements.btnStage2Recheck.addEventListener("click", () => verifyAllPackages());
}

// Mini inline fix buttons next to each checklist item
if (elements.btnFixPython) {
  elements.btnFixPython.addEventListener("click", () => handleReinstall(elements.btnFixPython, "python"));
}
if (elements.btnFixNative) {
  elements.btnFixNative.addEventListener("click", () => handleReinstall(elements.btnFixNative, "native"));
}
if (elements.btnFixYtDlp) {
  elements.btnFixYtDlp.addEventListener("click", () => handleReinstall(elements.btnFixYtDlp, "yt-dlp"));
}
if (elements.btnFixFfmpeg) {
  elements.btnFixFfmpeg.addEventListener("click", () => handleReinstall(elements.btnFixFfmpeg, "ffmpeg"));
}
if (elements.btnFixService) {
  elements.btnFixService.addEventListener("click", async () => {
    elements.btnFixService.disabled = true;
    elements.btnFixService.innerHTML = '<span class="spinner"></span> Starting…';
    try {
      await callNative("start");
    } catch (_e) {}
    elements.btnFixService.disabled = false;
    elements.btnFixService.innerHTML = '⚡ Start';
    await verifyAllPackages();
  });
}

elements.btnShowManual.addEventListener("click", () => {
  elements.manualInstructions.classList.toggle("hidden");
});

elements.btnOpenYouTube.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.youtube.com" });
  window.close();
});

elements.btnOpenOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// Initialize on page load
setupOSBadges();
setupCopyButtons();
setStep(1);
probeEnvironment();
