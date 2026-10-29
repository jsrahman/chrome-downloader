#!/usr/bin/env node
const path = require("path");
const { spawnSync } = require("child_process");
const os = require("os");

const ROOT_DIR = path.resolve(__dirname, "..");
const isWin = os.platform() === "win32";

console.log("Running Okja Saver test suite...");
let res;
if (isWin) {
  res = spawnSync("python", ["-m", "unittest", "discover", "-s", "tests", "-v"], {
    stdio: "inherit",
    cwd: ROOT_DIR,
  });
} else {
  res = spawnSync("sh", [path.join(ROOT_DIR, "scripts", "check.sh")], {
    stdio: "inherit",
    cwd: ROOT_DIR,
  });
}
process.exit(res.status || 0);
