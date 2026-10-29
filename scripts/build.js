#!/usr/bin/env node
/**
 * Okja YouTube Saver - Cross-Platform Node.js Build Tool
 * Validates extension files, registers native messaging host, and builds okja-youtube-saver.crx.
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const os = require("os");

const ROOT_DIR = path.resolve(__dirname, "..");
const EXT_DIR = path.join(ROOT_DIR, "extension");
const KEY_FILE = path.join(ROOT_DIR, "okja-youtube-saver.pem");
const CRX_OUTPUT = path.join(ROOT_DIR, "okja-youtube-saver.crx");

console.log("==================================================");
console.log(" Okja YouTube Saver - Node.js Build Tool");
console.log(" Platform:", os.platform(), "| Architecture:", os.arch());
console.log("==================================================");

// 1. Validate Extension Files & Manifest
console.log("\n[1/4] Validating extension files...");
const manifestPath = path.join(EXT_DIR, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("Error: extension/manifest.json not found!");
  process.exit(1);
}

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  console.log(`✓ Manifest valid: ${manifest.name} v${manifest.version}`);
  console.log(`  Permissions: ${manifest.permissions.join(", ")}`);
} catch (err) {
  console.error("Error parsing manifest.json:", err.message);
  process.exit(1);
}

// Check JavaScript files syntax
const jsFiles = fs.readdirSync(EXT_DIR).filter((f) => f.endsWith(".js"));
for (const file of jsFiles) {
  const filePath = path.join(EXT_DIR, file);
  try {
    execSync(`node --check "${filePath}"`, { stdio: "pipe" });
    console.log(`✓ Syntax OK: extension/${file}`);
  } catch (err) {
    console.error(`✕ Syntax Error in extension/${file}:`, err.message);
    process.exit(1);
  }
}

// 2. Register Native Messaging Host
console.log("\n[2/4] Registering Native Messaging Host for browsers...");
try {
  const installScript = path.join(ROOT_DIR, "scripts", "install-native-host.sh");
  if (fs.existsSync(installScript) && os.platform() !== "win32") {
    const res = spawnSync("sh", [installScript], { encoding: "utf8" });
    if (res.status === 0) {
      console.log("✓ Native host registered successfully");
    } else {
      console.warn("Notice: Native host script reported:", res.stderr || res.stdout);
    }
  }
} catch (e) {
  console.warn("Notice: Could not auto-register native host:", e.message);
}

// 3. Locate Chromium-based Browser Binary
console.log("\n[3/4] Locating Chromium-based browser to pack CRX...");
function findBrowser() {
  const platform = os.platform();
  const candidates = [];

  if (platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    );
  } else if (platform === "win32") {
    const prefixes = [process.env["PROGRAMFILES(X86)"], process.env.PROGRAMFILES, process.env.LOCALAPPDATA].filter(Boolean);
    for (const prefix of prefixes) {
      candidates.push(
        path.join(prefix, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(prefix, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        path.join(prefix, "Microsoft", "Edge", "Application", "msedge.exe")
      );
    }
  } else {
    // Linux candidates
    candidates.push(
      "google-chrome",
      "google-chrome-stable",
      "chromium",
      "chromium-browser",
      "brave",
      "brave-browser",
      "microsoft-edge",
      "microsoft-edge-stable"
    );
  }

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
    } else {
      try {
        const which = execSync(`which ${candidate} 2>/dev/null`, { encoding: "utf8" }).trim();
        if (which && fs.existsSync(which)) return which;
      } catch (_e) {}
    }
  }
  return null;
}

const browserBin = findBrowser();
if (!browserBin) {
  console.warn("Notice: No Chromium browser executable found on PATH to pack .crx.");
  console.log("The unpacked extension directory in 'extension/' is ready to load via chrome://extensions.");
} else {
  console.log(`✓ Using browser: ${browserBin}`);
  console.log("\n[4/4] Packing extension into CRX package...");

  const keyArgs = fs.existsSync(KEY_FILE) ? [`--pack-extension-key=${KEY_FILE}`] : [];
  const packArgs = [`--pack-extension=${EXT_DIR}`, ...keyArgs, "--no-message-box"];

  try {
    spawnSync(browserBin, packArgs, { stdio: "ignore" });

    // Handle generated files
    const defaultCrx = path.join(ROOT_DIR, "extension.crx");
    if (fs.existsSync(defaultCrx)) {
      fs.renameSync(defaultCrx, CRX_OUTPUT);
    }

    const defaultPem = path.join(ROOT_DIR, "extension.pem");
    if (fs.existsSync(defaultPem) && !fs.existsSync(KEY_FILE)) {
      fs.renameSync(defaultPem, KEY_FILE);
    }

    if (fs.existsSync(CRX_OUTPUT)) {
      const stats = fs.statSync(CRX_OUTPUT);
      console.log(`✓ Successfully built okja-youtube-saver.crx (${(stats.size / 1024).toFixed(1)} KB)`);
    } else {
      console.log("✓ Built extension directory ready for unpacked loading.");
    }
  } catch (err) {
    console.warn("Could not pack CRX automatically:", err.message);
  }
}

// 5. Create Distributable ZIP Archives
console.log("\n[5/5] Creating distributable ZIP archives...");
try {
  const zipRes = spawnSync("node", [path.join(__dirname, "zip.js")], { stdio: "inherit" });
  if (zipRes.status !== 0) {
    console.warn("Notice: ZIP creation finished with code", zipRes.status);
  }
} catch (err) {
  console.warn("Could not create ZIP packages:", err.message);
}

console.log("\n==================================================");
console.log(" All Builds Complete!");
console.log(" 📁 Unpacked extension:  ./extension");
console.log(" 📦 Shareable ZIP:        dist/okja-youtube-saver.zip");
console.log("==================================================");
