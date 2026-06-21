const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const viteCliPath = path.join(__dirname, "..", "node_modules", "vite", "bin", "vite.js");

const child = spawn(process.execPath, [viteCliPath, "build"], {
  cwd: process.cwd(),
  env: { ...process.env },
  stdio: "inherit",
  shell: false
});

child.on("exit", (code, signal) => {
  if (signal || code !== 0) {
    process.exit(code ?? 1);
    return;
  }
  
  // Copy src/ai to dist/ai so electron-builder includes it
  const srcAiPath = path.join(__dirname, "..", "src", "ai");
  const distAiPath = path.join(__dirname, "..", "dist", "ai");
  
  try {
    // Remove existing dist/ai if it exists
    if (fs.existsSync(distAiPath)) {
      fs.rmSync(distAiPath, { recursive: true, force: true });
    }
    
    // Recursively copy src/ai to dist/ai
    function copyDirRecursive(src, dest) {
      fs.mkdirSync(dest, { recursive: true });
      const entries = fs.readdirSync(src, { withFileTypes: true });
      
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
          copyDirRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
    
    copyDirRecursive(srcAiPath, distAiPath);
    console.log("[build] Copied src/ai to dist/ai for packaging");
  } catch (err) {
    console.warn("[build] Warning: Could not copy src/ai:", err.message);
  }
  
  process.exit(0);
});

child.on("error", (error) => {
  console.error("Failed to start Vite build:", error.message);
  process.exit(1);
});
