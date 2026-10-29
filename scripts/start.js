#!/usr/bin/env node
const path = require("path");
const { spawnSync } = require("child_process");
const os = require("os");

const ROOT_DIR = path.resolve(__dirname, "..");
const isWin = os.platform() === "win32";
const startScript = isWin
  ? path.join(ROOT_DIR, "scripts", "start-service.bat")
  : path.join(ROOT_DIR, "scripts", "start-service.sh");

console.log("Starting Okja Saver companion service...");
const res = spawnSync(isWin ? "cmd.exe" : "sh", [isWin ? "/c" : "", startScript, ...process.argv.slice(2)].filter(Boolean), {
  stdio: "inherit",
  cwd: ROOT_DIR,
});
process.exit(res.status || 0);
