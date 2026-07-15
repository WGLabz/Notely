const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const electronBuilderCliPath = path.join(__dirname, "..", "node_modules", "electron-builder", "cli.js");
const generatedVersionPath = path.join(__dirname, "..", "electron", "app-version.generated.json");
const args = process.argv.slice(2);

const isWindowsBuild = args.some((arg) => /^--win$/i.test(String(arg || ""))) || args.includes("nsis") || args.includes("portable") || args.includes("zip");
const hasSigningMaterial = Boolean(
  process.env.CSC_LINK
  || process.env.WIN_CSC_LINK
  || process.env.CSC_NAME
  || process.env.WIN_CSC_NAME
  || process.env.AZURE_TENANT_ID
);

let nextArgs = [...args];
const childEnv = { ...process.env };

// Remove empty signing variables so electron-builder doesn't try to resolve empty strings to the current directory
for (const key of ["CSC_LINK", "WIN_CSC_LINK", "CSC_KEY_PASSWORD", "WIN_CSC_KEY_PASSWORD"]) {
  if (childEnv[key] === "") {
    delete childEnv[key];
  }
}

try {
  if (fs.existsSync(generatedVersionPath)) {
    const generated = JSON.parse(String(fs.readFileSync(generatedVersionPath, "utf8") || "{}"));
    const fullVersion = String(generated.version || "").trim();
    const coreVersion = String(generated.versionCore || "").trim();
    const packagingVersion = coreVersion || fullVersion;
    if (packagingVersion) {
      // Use pure semver for packaging so Windows artifact names don't include git hash.
      nextArgs.push(`--config.extraMetadata.version=${packagingVersion}`);
      nextArgs.push(`--config.buildVersion=${packagingVersion}`);
    }
  }
} catch (error) {
  console.warn("[packaging] Unable to read generated app version metadata:", error?.message || error);
}

if (isWindowsBuild && !hasSigningMaterial) {
  console.warn("[packaging] Windows signing material not found.");
  console.warn("[packaging] Provide CSC_LINK/CSC_KEY_PASSWORD (PFX) or Azure Trusted Signing variables before distributing binaries.");
  childEnv.CSC_IDENTITY_AUTO_DISCOVERY = "false";
}

if (isWindowsBuild && hasSigningMaterial) {
  // Signing cert present — enable rcedit icon stamping + signature verification.
  nextArgs.push(
    "--config.win.signAndEditExecutable=true",
    "--config.win.verifyUpdateCodeSignature=true"
  );
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
