#!/usr/bin/env node
const path = require("path");
const { spawnSync } = require("child_process");
const os = require("os");

const ROOT_DIR = path.resolve(__dirname, "..");
const isWin = os.platform() === "win32";
const setupScript = isWin
  ? path.join(ROOT_DIR, "scripts", "setup.bat")
  : path.join(ROOT_DIR, "scripts", "setup.sh");

console.log("Running Okja Saver environment setup...");
const res = spawnSync(isWin ? "cmd.exe" : "sh", [isWin ? "/c" : "", setupScript].filter(Boolean), {
  stdio: "inherit",
  cwd: ROOT_DIR,
});
process.exit(res.status || 0);
