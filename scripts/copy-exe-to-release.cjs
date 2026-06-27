const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, ".artifacts");
const targetDir = path.join(projectRoot, "release");

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

function main() {
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
    try {
      // COPYFILE_EXCL not used — overwrite in-place to avoid EPERM on locked files.
      fs.copyFileSync(sourcePath, targetPath);
      copied++;
    } catch (err) {
      process.stderr.write(`Skipped ${fileName}: ${err.message}\n`);
    }
  }

  process.stdout.write(`Copied ${copied} .exe file(s) to release\n`);
}

main();
