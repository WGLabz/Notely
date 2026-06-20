const fs = require("node:fs");
const path = require("node:path");

const STORAGE_ROOT = path.join(process.cwd(), ".artifacts", "p2p-harness");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cleanupHarnessStorage() {
  if (fs.existsSync(STORAGE_ROOT)) {
    fs.rmSync(STORAGE_ROOT, { recursive: true, force: true });
  }
}

module.exports = {
  STORAGE_ROOT,
  ensureDir,
  writeJson,
  readJson,
  cleanupHarnessStorage
};
