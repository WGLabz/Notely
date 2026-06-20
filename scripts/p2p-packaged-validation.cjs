#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const releaseDir = path.join(projectRoot, "release");
const artifactsDir = path.join(projectRoot, ".artifacts");

const expectedReleaseFiles = [
  "Notely Setup 0.1.0.exe",
  "Notely 0.1.0.exe"
];

function fileInfo(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, size: 0, mtime: null };
  }
  const stat = fs.statSync(filePath);
  return {
    exists: true,
    size: stat.size,
    mtime: stat.mtime.toISOString()
  };
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function printChecklist() {
  console.log("\nWindows 2-machine P2P validation checklist:");
  console.log("1. Install Notely on Machine A and Machine B from the same build.");
  console.log("2. Open both apps on the same LAN and start P2P discovery.");
  console.log("3. Pair using invite code, then confirm trusted peer appears on both sides.");
  console.log("4. Verify initial full sync progress reaches completed for each peer.");
  console.log("5. Create/update/delete notes on A and confirm B receives changes.");
  console.log("6. Repeat in reverse direction (B -> A).");
  console.log("7. Remove peer trust on A, verify re-auth is required before pairing again.");
  console.log("8. Rotate keys and verify sync resumes with no plaintext transport.");
  console.log("9. Force conflict by editing same note on both machines offline, then reconnect and resolve in Conflict Center.");
}

function main() {
  const strict = process.argv.includes("--strict");
  const results = expectedReleaseFiles.map((name) => {
    const absolutePath = path.join(releaseDir, name);
    return {
      name,
      path: absolutePath,
      ...fileInfo(absolutePath)
    };
  });

  const artifactExists = fs.existsSync(artifactsDir);

  console.log("P2P packaged validation preflight");
  console.log("Project:", projectRoot);
  console.log("Release dir:", releaseDir);
  console.log("Artifacts dir exists:", artifactExists ? "yes" : "no");

  console.log("\nExpected release files:");
  for (const item of results) {
    console.log(`- ${item.name}: ${item.exists ? "FOUND" : "MISSING"}`);
    if (item.exists) {
      console.log(`  size=${formatBytes(item.size)} modified=${item.mtime}`);
    }
  }

  const missing = results.filter((item) => !item.exists);
  if (missing.length > 0) {
    console.log("\nMissing packaged artifacts detected.");
    console.log("Run: npm run dist:win");
  }

  printChecklist();

  if (strict && missing.length > 0) {
    process.exitCode = 1;
  }
}

main();
