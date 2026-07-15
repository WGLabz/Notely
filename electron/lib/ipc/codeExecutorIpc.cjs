const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { assertTrustedIpcSender } = require("./ipcSecurity.cjs");

function registerCodeExecutorIpcHandlers(ipcMain, deps) {
  const { BrowserWindow } = deps;

  ipcMain.handle("code:execute", async (event, payload) => {
    assertTrustedIpcSender(BrowserWindow, event, "code:execute");

    const { language, code } = payload || {};
    if (!language || typeof code !== "string") {
      throw new Error("Invalid execution payload: language and code are required.");
    }

    const normLang = language.toLowerCase();
    const supportedLangs = ["javascript", "js", "python", "py", "bash", "sh", "powershell", "ps1", "html"];
    if (!supportedLangs.includes(normLang)) {
      throw new Error(`Unsupported execution language: ${language}`);
    }

    if (normLang === "html") {
      return {
        success: true,
        isHtml: true,
        htmlContent: code,
        exitCode: 0,
        stdout: "",
        stderr: ""
      };
    }

    // Determine execution configurations
    let commands = [];
    let fileExt = ".txt";
    let getArgs = (file) => [file];

    if (normLang === "javascript" || normLang === "js") {
      fileExt = ".js";
      commands = ["node"];
    } else if (normLang === "python" || normLang === "py") {
      fileExt = ".py";
      commands = process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"];
    } else if (normLang === "bash" || normLang === "sh") {
      fileExt = ".sh";
      commands = ["bash", "sh"];
    } else if (normLang === "powershell" || normLang === "ps1") {
      fileExt = ".ps1";
      commands = process.platform === "win32" ? ["powershell", "pwsh"] : ["pwsh", "powershell"];
      getArgs = (file) => ["-ExecutionPolicy", "Bypass", "-File", file];
    }

    // Write code to a temp file to run it
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `notely-exec-${Date.now()}-${Math.random().toString(36).substring(7)}${fileExt}`);

    try {
      fs.writeFileSync(tempFile, code, "utf8");
    } catch (err) {
      return {
        success: false,
        stdout: "",
        stderr: `Failed to create temporary script file: ${err.message}`,
        exitCode: -1
      };
    }

    const safeEnv = {
      PATH: process.env.PATH,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      USERPROFILE: process.env.USERPROFILE,
      HOME: process.env.HOME,
      APPDATA: process.env.APPDATA,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      SystemRoot: process.env.SystemRoot,
      ComSpec: process.env.ComSpec,
      PATHEXT: process.env.PATHEXT,
    };

    const timeoutLimit = 10000;
    const maxBufferSize = 64 * 1024; // 64KB

    return new Promise((resolve) => {
      let currentIdx = 0;
      let child = null;
      let timer = null;
      let stdoutData = "";
      let stderrData = "";
      let hasFinished = false;

      function finish(result) {
        if (hasFinished) return;
        hasFinished = true;
        if (timer) clearTimeout(timer);
        cleanupTempFile(tempFile);
        resolve(result);
      }

      function tryNext() {
        if (currentIdx >= commands.length) {
          finish({
            success: false,
            stdout: stdoutData,
            stderr: stderrData + `\nProcess error: Failed to spawn executable process. Ensure one of the following is installed and in your PATH: ${commands.join(", ")}`,
            exitCode: -1
          });
          return;
        }

        const command = commands[currentIdx];
        const args = getArgs(tempFile);

        try {
          child = spawn(command, args, { env: safeEnv });
        } catch {
          currentIdx++;
          tryNext();
          return;
        }

        child.on("error", (err) => {
          if (err.code === "ENOENT") {
            currentIdx++;
            tryNext();
          } else {
            finish({
              success: false,
              stdout: stdoutData,
              stderr: stderrData + `\nProcess error: ${err.message}`,
              exitCode: -1
            });
          }
        });

        child.stdout.on("data", (data) => {
          if (stdoutData.length + data.length > maxBufferSize) {
            stdoutData = stdoutData.substring(0, maxBufferSize) + "\n[Output Truncated: Max Buffer Limit Reached]";
            try { child.kill("SIGKILL"); } catch { /* ignore */ }
          } else {
            stdoutData += data.toString();
          }
        });

        child.stderr.on("data", (data) => {
          if (stderrData.length + data.length > maxBufferSize) {
            stderrData = stderrData.substring(0, maxBufferSize) + "\n[Output Truncated: Max Buffer Limit Reached]";
            try { child.kill("SIGKILL"); } catch { /* ignore */ }
          } else {
            stderrData += data.toString();
          }
        });

        // Setup timer
        timer = setTimeout(() => {
          if (child && !child.killed) {
            try {
              child.kill("SIGKILL");
            } catch {
              /* ignore */
            }
            finish({
              success: false,
              stdout: stdoutData,
              stderr: stderrData + `\n[Execution Timeout] The script was terminated because it exceeded the ${timeoutLimit / 1000}-second limit.`,
              exitCode: -1
            });
          }
        }, timeoutLimit);

        child.on("close", (code) => {
          finish({
            success: code === 0,
            stdout: stdoutData,
            stderr: stderrData,
            exitCode: code
          });
        });
      }

      tryNext();
    });
  });
}

function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn(`[CodeExecutor] Failed to clean up temp file ${filePath}:`, err.message);
  }
}

module.exports = {
  registerCodeExecutorIpcHandlers
};
