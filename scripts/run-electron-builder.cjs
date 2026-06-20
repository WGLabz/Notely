const { spawn } = require("node:child_process");
const path = require("node:path");

const electronBuilderCliPath = path.join(__dirname, "..", "node_modules", "electron-builder", "cli.js");
const args = process.argv.slice(2);

const child = spawn(process.execPath, [electronBuilderCliPath, ...args], {
  cwd: process.cwd(),
  env: { ...process.env },
  stdio: "inherit",
  shell: false
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("Failed to start Electron Builder:", error.message);
  process.exit(1);
});
