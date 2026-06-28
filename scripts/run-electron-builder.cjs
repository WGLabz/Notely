const { spawn } = require("node:child_process");
const path = require("node:path");

const electronBuilderCliPath = path.join(__dirname, "..", "node_modules", "electron-builder", "cli.js");
const args = process.argv.slice(2);

const isWindowsBuild = args.some((arg) => /^--win$/i.test(String(arg || ""))) || args.includes("nsis") || args.includes("portable");
const hasSigningMaterial = Boolean(
  process.env.CSC_LINK
  || process.env.WIN_CSC_LINK
  || process.env.CSC_NAME
  || process.env.WIN_CSC_NAME
  || process.env.AZURE_TENANT_ID
);

let nextArgs = [...args];
const childEnv = { ...process.env };

if (isWindowsBuild && !hasSigningMaterial) {
  console.warn("[packaging] Windows signing material not found.");
  console.warn("[packaging] Provide CSC_LINK/CSC_KEY_PASSWORD (PFX) or Azure Trusted Signing variables before distributing binaries.");

  // Unsigned local build: skip signing/code-sign verification hooks entirely.
  nextArgs.push(
    "--config.win.signAndEditExecutable=false",
    "--config.win.verifyUpdateCodeSignature=false"
  );
  childEnv.CSC_IDENTITY_AUTO_DISCOVERY = "false";
}

const child = spawn(process.execPath, [electronBuilderCliPath, ...nextArgs], {
  cwd: process.cwd(),
  env: childEnv,
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
