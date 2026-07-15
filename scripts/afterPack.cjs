const path = require("node:path");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

/**
 * electron-builder afterPack hook.
 * Embeds the Notely icon into Notely.exe using rcedit directly,
 * bypassing the winCodeSign download (which fails on Windows without
 * Developer Mode due to symlink extraction errors).
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const rcEditPath = path.join(
    context.packager.projectDir,
    "node_modules",
    "rcedit",
    "bin",
    "rcedit.exe"
  );

  if (!fs.existsSync(rcEditPath)) {
    console.warn("[afterPack] rcedit.exe not found, skipping icon embed:", rcEditPath);
    return;
  }

  const icoPath = path.join(context.packager.projectDir, "build", "icon.ico");
  if (!fs.existsSync(icoPath)) {
    console.warn("[afterPack] icon.ico not found, skipping icon embed:", icoPath);
    return;
  }

  const appOutDir = context.appOutDir;
  const exeName = `${context.packager.appInfo.productName}.exe`;
  const exePath = path.join(appOutDir, exeName);

  if (!fs.existsSync(exePath)) {
    console.warn("[afterPack] App EXE not found:", exePath);
    return;
  }

  try {
    execFileSync(rcEditPath, [
      exePath,
      "--set-icon", icoPath,
    ], { stdio: "pipe" });
    console.log(`[afterPack] Embedded icon into ${exeName}`);
  } catch (err) {
    console.warn("[afterPack] rcedit failed (icon not embedded):", err.message);
  }
};
