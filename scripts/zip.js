#!/usr/bin/env node
/**
 * Okja YouTube Saver - Distributable ZIP Creator
 * Creates ultra-clean, minimal .zip packages ready to share, strictly excluding:
 * - .git, .venv, .runtime, .DS_Store, and all hidden files
 * - .pem private cryptographic keys
 * - Internal docs (agent.md, project.md)
 * - Developer tests (tests/) and build harnesses
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const EXT_DIR = path.join(ROOT_DIR, "extension");

// Pure Node.js standard PKZIP Archive Writer (RFC 1951 / APPNOTE)
function createZip(entries, outputPath) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const filenameBuf = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const data = entry.data || Buffer.alloc(0);
    const compressed = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);

    // Local file header (30 bytes)
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);       // signature
    lh.writeUInt16LE(20, 4);               // version needed (2.0)
    lh.writeUInt16LE(0, 6);                // flags
    lh.writeUInt16LE(8, 8);                // compression (deflate)
    lh.writeUInt16LE(0, 10);               // msdos time
    lh.writeUInt16LE(0, 12);               // msdos date
    lh.writeUInt32LE(crc >>> 0, 14);       // crc32
    lh.writeUInt32LE(compressed.length, 18); // compressed size
    lh.writeUInt32LE(data.length, 22);       // uncompressed size
    lh.writeUInt16LE(filenameBuf.length, 26);
    lh.writeUInt16LE(0, 28);               // extra field length

    localHeaders.push(lh, filenameBuf, compressed);

    // Central directory file header (46 bytes)
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);       // signature
    cd.writeUInt16LE((3 << 8) | 20, 4);    // version made by (3 = UNIX, 20 = PKZIP 2.0)
    cd.writeUInt16LE(20, 6);               // version needed
    cd.writeUInt16LE(0, 8);                // flags
    cd.writeUInt16LE(8, 10);               // compression
    cd.writeUInt16LE(0, 12);               // msdos time
    cd.writeUInt16LE(0, 14);               // msdos date
    cd.writeUInt32LE(crc >>> 0, 16);       // crc32
    cd.writeUInt32LE(compressed.length, 20); // compressed size
    cd.writeUInt32LE(data.length, 24);       // uncompressed size
    cd.writeUInt16LE(filenameBuf.length, 28);
    cd.writeUInt16LE(0, 30);               // extra field length
    cd.writeUInt16LE(0, 32);               // comment length
    cd.writeUInt16LE(0, 34);               // disk number
    cd.writeUInt16LE(0, 36);               // internal attrs
    const isExec = (entry.mode && (entry.mode & 0o111) !== 0) || entry.name.endsWith(".sh") || entry.name.endsWith(".bat") || entry.name.endsWith(".cmd");
    const mode = isExec ? 0o100755 : 0o100644;
    cd.writeUInt32LE((mode << 16) >>> 0, 38); // external attrs (POSIX 755 or 644 file)
    cd.writeUInt32LE(offset >>> 0, 42);    // offset of local header

    centralHeaders.push(cd, filenameBuf);
    offset += lh.length + filenameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralHeaders);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);       // signature
  eocd.writeUInt16LE(0, 4);                // disk number
  eocd.writeUInt16LE(0, 6);                // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);   // entries on disk
  eocd.writeUInt16LE(entries.length, 10);  // total entries
  eocd.writeUInt32LE(centralDir.length, 12); // size of central dir
  eocd.writeUInt32LE(offset >>> 0, 16);    // offset of central dir
  eocd.writeUInt16LE(0, 20);               // comment length

  const fullZip = Buffer.concat([...localHeaders, centralDir, eocd]);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, fullZip);
  return fullZip.length;
}

// Patterns & files strictly excluded from distributables
const EXCLUDED_PATTERNS = [
  /^\./,               // Any hidden file/folder (.git, .venv, .runtime, .DS_Store, .gitignore)
  /\.pem$/,            // Private cryptographic keys
  /\.crx$/,            // Binary package
  /\.part$/,           // Incomplete download files
  /\.ytdl$/,           // Incomplete metadata
  /__pycache__/,       // Python bytecode cache
  /\.pyc$/,
  /^node_modules/,     // Node dependencies
  /^dist/,             // Dist output
  /^tests/,            // Developer tests
  /^agent\.md$/,       // Internal AI prompt
  /^project\.md$/,     // Internal planning doc
  /^scripts\/check\.sh$/,
  /^scripts\/pack-crx\.sh$/,
  /^scripts\/install-launchagent\.sh$/,
  /^scripts\/uninstall-launchagent\.sh$/,
  /^scripts\/test\.js$/,
  /^scripts\/build\.js$/,
  /^scripts\/zip\.js$/,
];

function shouldExclude(relPath) {
  const parts = relPath.split("/");
  for (const part of parts) {
    if (part.startsWith(".") || part === "__pycache__" || part === "dist" || part === "node_modules" || part === "tests") {
      return true;
    }
  }
  return EXCLUDED_PATTERNS.some((pattern) => pattern.test(relPath));
}

function collectFiles(dir, baseDir = dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");

    if (shouldExclude(relPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files = files.concat(collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const stat = fs.statSync(fullPath);
      files.push({
        name: relPath,
        data: fs.readFileSync(fullPath),
        mode: stat.mode,
      });
    }
  }
  return files;
}

console.log("==================================================");
console.log(" Okja YouTube Saver - Clean ZIP Package Builder");
console.log(" Strictly excludes: .git, .venv, .pem, tests, & internal files");
console.log("==================================================");

fs.mkdirSync(DIST_DIR, { recursive: true });

// Clean up any old/stale zip or test artifacts
const staleExtZip = path.join(DIST_DIR, "okja-youtube-saver-extension.zip");
if (fs.existsSync(staleExtZip)) {
  fs.unlinkSync(staleExtZip);
}

// Package Complete Shareable Bundle ZIP (Extension + companion service + root 1-click launchers)
console.log("\nBuilding clean shareable bundle (complete app)...");
const rootFiles = collectFiles(ROOT_DIR, ROOT_DIR);
const fullZipPath = path.join(DIST_DIR, "okja-youtube-saver.zip");
const fullSize = createZip(rootFiles, fullZipPath);
console.log(`✓ Shareable Bundle ZIP: dist/okja-youtube-saver.zip`);
console.log(`  Size: ${(fullSize / 1024).toFixed(1)} KB | ${rootFiles.length} files included`);

console.log("\n==================================================");
console.log(" Clean Distributable ZIP Ready to Share:");
console.log(" 📦 Full App Bundle: dist/okja-youtube-saver.zip");
console.log("==================================================");
