const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, ".artifacts");
const targetDir = path.join(projectRoot, "release");
const COPY_MAX_ATTEMPTS = 6;
const COPY_INITIAL_BACKOFF_MS = 200;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function listTopLevelExeFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
    .map((entry) => entry.name);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableCopyError(err) {
  const code = String(err?.code || "").toUpperCase();
  return code === "EBUSY" || code === "EPERM" || code === "EACCES";
}

async function copyWithRetry(sourcePath, targetPath) {
  let lastError = null;

  for (let attempt = 1; attempt <= COPY_MAX_ATTEMPTS; attempt += 1) {
    try {
      // COPYFILE_EXCL not used; overwrite target in-place when available.
      await fs.promises.copyFile(sourcePath, targetPath);
      return { ok: true, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (!isRetryableCopyError(err) || attempt === COPY_MAX_ATTEMPTS) {
        break;
      }

      const backoff = COPY_INITIAL_BACKOFF_MS * (2 ** (attempt - 1));
      await sleep(backoff);
    }
  }

  return { ok: false, error: lastError, attempts: COPY_MAX_ATTEMPTS };
}

async function main() {
  const exeFiles = listTopLevelExeFiles(sourceDir);
  if (!exeFiles.length) {
    process.stdout.write("No .exe files found in .artifacts folder.\n");
    return;
  }

  ensureDir(targetDir);

  let copied = 0;
  for (const fileName of exeFiles) {
    const sourcePath = path.join(sourceDir, fileName);
    const targetPath = path.join(targetDir, fileName);
    const result = await copyWithRetry(sourcePath, targetPath);
    if (result.ok) {
      copied++;
      continue;
    }

    const message = result.error?.message || "Unknown copy failure";
    process.stderr.write(`Skipped ${fileName} after ${result.attempts} attempts: ${message}\n`);
  }

  process.stdout.write(`Copied ${copied} .exe file(s) to release\n`);
}

main().catch((error) => {
  process.stderr.write(`release:collect failed: ${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
