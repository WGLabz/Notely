const { spawn } = require("node:child_process");
const path = require("node:path");

const viteCliPath = path.join(__dirname, "..", "node_modules", "vite", "bin", "vite.js");

const child = spawn(process.execPath, [viteCliPath, "build"], {
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
  console.error("Failed to start Vite build:", error.message);
  process.exit(1);
});
