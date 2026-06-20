const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const artifactsDir = path.join(projectRoot, ".artifacts");
const releaseDir = path.join(projectRoot, "release");

if (fs.existsSync(releaseDir)) {
  for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
    if (entry.isFile()) {
      try {
        fs.rmSync(path.join(releaseDir, entry.name), { force: true });
      } catch {
        // File may be locked; skip and let the copy overwrite it.
      }
    }
  }
}

if (fs.existsSync(artifactsDir)) {
  for (const entry of fs.readdirSync(artifactsDir, { withFileTypes: true })) {
    // Keep win-unpacked to avoid EPERM when user still has app open.
    if (entry.isDirectory()) {
      continue;
    }

    if (
      entry.name.toLowerCase().endsWith(".exe")
      || entry.name.toLowerCase().endsWith(".blockmap")
      || entry.name.endsWith(".yml")
      || entry.name.endsWith(".yaml")
    ) {
      fs.rmSync(path.join(artifactsDir, entry.name), { force: true });
    }
  }
}

process.stdout.write("Cleaned release folder and previous artifact files\n");
