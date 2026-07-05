const { Menu } = require("electron");

// Sends a menu-action signal to the renderer for the given window.
function sendMenuAction(win, action) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("app-menu:action", action);
}

function normalizeMenuText(value, fallback = "") {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  if (value && typeof value === "object") {
    for (const key of ["path", "label", "name", "title"]) {
      if (typeof value[key] === "string" && value[key].trim()) {
        return value[key].trim();
      }
    }
  }

  return fallback;
}

// Builds the application menu template based on the current screen/view context.
function buildAppMenu(win, context = {}) {
  const isMac = process.platform === "darwin";
  const screen = context?.screen === "document" ? "document" : "landing";
  const viewMode = context?.viewMode === "table" ? "table" : "tile";
  const densityMode = context?.densityMode === "compact" ? "compact" : "comfortable";
  const outlineEnabled = context?.outlineEnabled !== false;
  const splitPreviewEnabled = context?.splitPreviewEnabled === true;
  const focusModeEnabled = context?.focusModeEnabled === true;
  const previewImageMode = context?.previewImageMode === "original" ? "original" : "thumbnail";
  const embeddedMarkdownMode = context?.embeddedMarkdownMode === "inline" ? "inline" : "open";
  const typoCheckEnabled = context?.typoCheckEnabled !== false;
  const screenCaptureMode = context?.screenCaptureMode === "review" ? "review" : "auto";
  const themePreference = ["auto", "light", "dark"].includes(context?.themePreference)
    ? context.themePreference
    : "auto";
  const terminalOpen = context?.terminalOpen === true;
  const terminalShell = context?.terminalShell === "bash" || context?.terminalShell === "cmd"
    ? context.terminalShell
    : "auto";
  const isDevMode = Boolean(context?.isDevMode);
  const dirty = Boolean(context?.dirty);
  const canRemoveFolder = Boolean(context?.canRemoveFolder);
  const currentFolderLabel = normalizeMenuText(context?.currentFolderLabel, "Current Folder");
  const recentWorkspacePaths = Array.isArray(context?.recentWorkspacePaths)
    ? context.recentWorkspacePaths
        .map((entry) => normalizeMenuText(entry, ""))
        .filter(Boolean)
    : [];
  const openRecentSubmenu = recentWorkspacePaths.length
    ? recentWorkspacePaths.map((workspacePath) => ({
        label: workspacePath,
        click: () => sendMenuAction(win, `open-recent-workspace:${encodeURIComponent(workspacePath)}`)
      }))
    : [
        {
          label: "No Recent Workspaces",
          enabled: false
        }
      ];

  const fileSubmenu = screen === "document"
    ? [
        {
          label: "New Note",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuAction(win, "new-note")
        },
        {
          label: "Open Workspace",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => sendMenuAction(win, "open-workspace")
        },
        {
          label: "Open Recent",
          submenu: openRecentSubmenu
        },
        { type: "separator" },
        {
          label: dirty ? "Save*" : "Save",
          accelerator: "CmdOrCtrl+S",
          enabled: dirty,
          click: () => sendMenuAction(win, "save-document")
        },
        {
          label: "Export PDF",
          accelerator: "CmdOrCtrl+Shift+E",
          click: () => sendMenuAction(win, "export-pdf")
        },
        {
          label: "Versions",
          accelerator: "CmdOrCtrl+Shift+H",
          click: () => sendMenuAction(win, "manage-versions")
        },
        { type: "separator" },
        {
          label: "Rename Note",
          accelerator: "F2",
          click: () => sendMenuAction(win, "rename-note")
        },
        {
          label: "Reload from Disk",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => sendMenuAction(win, "reload-document")
        },
        {
          label: "Move Note to Removed",
          accelerator: "CmdOrCtrl+Delete",
          click: () => sendMenuAction(win, "remove-document")
        },
        { type: "separator" },
        {
          label: "Back to Notes",
          accelerator: "Esc",
          click: () => sendMenuAction(win, "back-to-notes")
        },
        { type: "separator" },
        { role: "quit" }
      ]
    : [
        {
          label: "New Note",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuAction(win, "new-note")
        },
        {
          label: "Open Workspace",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => sendMenuAction(win, "open-workspace")
        },
        {
          label: "Open Recent",
          submenu: openRecentSubmenu
        },
        { type: "separator" },
        {
          label: `Move ${currentFolderLabel} to Removed`,
          accelerator: "CmdOrCtrl+Shift+Delete",
          enabled: canRemoveFolder,
          click: () => sendMenuAction(win, "remove-folder")
        },
        { type: "separator" },
        { role: "quit" }
      ];

  const editSubmenu = [
    { role: "undo" },
    { role: "redo" },
    { type: "separator" },
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    { role: "selectAll" },
    ...(screen === "document"
      ? [
          { type: "separator" },
          {
            label: "Find",
            accelerator: "CmdOrCtrl+F",
            click: () => sendMenuAction(win, "find-in-note")
          },
          {
            label: "Find and Replace",
            ...(isMac ? {} : { accelerator: "CmdOrCtrl+H" }),
            click: () => sendMenuAction(win, "find-replace")
          }
        ]
      : []),
    { type: "separator" },
    {
      label: "Screen Capture Options",
      submenu: [
        {
          label: "Auto Insert",
          type: "checkbox",
          checked: screenCaptureMode === "auto",
          click: () => sendMenuAction(win, "settings-screen-capture-auto")
        },
        {
          label: "Review Before Insert",
          type: "checkbox",
          checked: screenCaptureMode === "review",
          click: () => sendMenuAction(win, "settings-screen-capture-review")
        }
      ]
    }
  ];

  const viewSubmenu = screen === "document"
    ? [
        {
          label: "Open Command Palette",
          click: () => sendMenuAction(win, "open-command-palette")
        },
        { type: "separator" },
        {
          label: "Theme",
          submenu: [
            {
              label: "System",
              type: "checkbox",
              checked: themePreference === "auto",
              click: () => sendMenuAction(win, "theme-auto")
            },
            {
              label: "Light",
              type: "checkbox",
              checked: themePreference === "light",
              click: () => sendMenuAction(win, "theme-light")
            },
            {
              label: "Dark",
              type: "checkbox",
              checked: themePreference === "dark",
              click: () => sendMenuAction(win, "theme-dark")
            }
          ]
        },
        {
          label: "Enable Typo Check",
          type: "checkbox",
          checked: typoCheckEnabled,
          click: () => sendMenuAction(win, "toggle-typo-check")
        },
        { type: "separator" },
        {
          label: "Editor Layout",
          submenu: [
            {
              label: "Show Outline",
              type: "checkbox",
              checked: outlineEnabled,
              accelerator: "CmdOrCtrl+Alt+L",
              click: () => sendMenuAction(win, "toggle-outline-enabled")
            },
            {
              label: "Split Preview",
              type: "checkbox",
              checked: splitPreviewEnabled,
              accelerator: "CmdOrCtrl+\\",
              click: () => sendMenuAction(win, "toggle-split-preview")
            },
            {
              label: "Focus Mode",
              type: "checkbox",
              checked: focusModeEnabled,
              accelerator: "CmdOrCtrl+Alt+F",
              click: () => sendMenuAction(win, "toggle-focus-mode")
            }
          ]
        },
        {
          label: "Preview Options",
          submenu: [
            {
              label: "Images",
              submenu: [
                {
                  label: "Thumbnail",
                  type: "checkbox",
                  checked: previewImageMode === "thumbnail",
                  click: () => sendMenuAction(win, "view-preview-image-thumbnail")
                },
                {
                  label: "Original",
                  type: "checkbox",
                  checked: previewImageMode === "original",
                  click: () => sendMenuAction(win, "view-preview-image-original")
                }
              ]
            },
            {
              label: "Embedded Markdown Files",
              submenu: [
                {
                  label: "Open Linked Note",
                  type: "checkbox",
                  checked: embeddedMarkdownMode === "open",
                  click: () => sendMenuAction(win, "view-embedded-markdown-open")
                },
                {
                  label: "Inline Render",
                  type: "checkbox",
                  checked: embeddedMarkdownMode === "inline",
                  click: () => sendMenuAction(win, "view-embedded-markdown-inline")
                }
              ]
            }
          ]
        },
        { type: "separator" },
        {
          label: "Terminal",
          submenu: [
            {
              label: "Show Terminal",
              type: "checkbox",
              checked: terminalOpen,
              click: () => sendMenuAction(win, "toggle-terminal")
            },
            { type: "separator" },
            {
              label: "Shell: Auto",
              type: "checkbox",
              checked: terminalShell === "auto",
              click: () => sendMenuAction(win, "terminal-shell-auto")
            },
            {
              label: "Shell: Bash",
              type: "checkbox",
              checked: terminalShell === "bash",
              click: () => sendMenuAction(win, "terminal-shell-bash")
            },
            {
              label: "Shell: CMD",
              type: "checkbox",
              checked: terminalShell === "cmd",
              click: () => sendMenuAction(win, "terminal-shell-cmd")
            }
          ]
        },
        { type: "separator" },
        {
          label: "Zoom",
          submenu: [
            {
              label: "Zoom In",
              accelerator: "CmdOrCtrl+=",
              click: () => sendMenuAction(win, "zoom-in")
            },
            {
              label: "Zoom Out",
              accelerator: "CmdOrCtrl+-",
              click: () => sendMenuAction(win, "zoom-out")
            },
            {
              label: "Reset Zoom",
              accelerator: "CmdOrCtrl+0",
              click: () => sendMenuAction(win, "zoom-reset")
            }
          ]
        },
        { type: "separator" },
        {
          label: "Developer",
          submenu: [
            { role: "reload" },
            { role: "forceReload" },
            ...(isDevMode ? [{ type: "separator" }, { role: "toggleDevTools" }] : [])
          ]
        }
      ]
    : [
        {
          label: "Open Command Palette",
          click: () => sendMenuAction(win, "open-command-palette")
        },
        { type: "separator" },
        {
          label: "Theme",
          submenu: [
            {
              label: "System",
              type: "checkbox",
              checked: themePreference === "auto",
              click: () => sendMenuAction(win, "theme-auto")
            },
            {
              label: "Light",
              type: "checkbox",
              checked: themePreference === "light",
              click: () => sendMenuAction(win, "theme-light")
            },
            {
              label: "Dark",
              type: "checkbox",
              checked: themePreference === "dark",
              click: () => sendMenuAction(win, "theme-dark")
            }
          ]
        },
        { type: "separator" },
        {
          label: "Dashboard View",
          submenu: [
            {
              label: "Tile Notes",
              accelerator: "CmdOrCtrl+1",
              type: "checkbox",
              checked: viewMode === "tile",
              click: () => sendMenuAction(win, "view-tile")
            },
            {
              label: "Table Notes",
              accelerator: "CmdOrCtrl+2",
              type: "checkbox",
              checked: viewMode === "table",
              click: () => sendMenuAction(win, "view-table")
            },
            { type: "separator" },
            {
              label: "Comfortable Density",
              accelerator: "CmdOrCtrl+3",
              type: "checkbox",
              checked: densityMode === "comfortable",
              click: () => sendMenuAction(win, "view-density-comfortable")
            },
            {
              label: "Compact Density",
              accelerator: "CmdOrCtrl+4",
              type: "checkbox",
              checked: densityMode === "compact",
              click: () => sendMenuAction(win, "view-density-compact")
            }
          ]
        },
        { type: "separator" },
        {
          label: "Terminal",
          submenu: [
            {
              label: "Show Terminal",
              type: "checkbox",
              checked: terminalOpen,
              click: () => sendMenuAction(win, "toggle-terminal")
            },
            { type: "separator" },
            {
              label: "Shell: Auto",
              type: "checkbox",
              checked: terminalShell === "auto",
              click: () => sendMenuAction(win, "terminal-shell-auto")
            },
            {
              label: "Shell: Bash",
              type: "checkbox",
              checked: terminalShell === "bash",
              click: () => sendMenuAction(win, "terminal-shell-bash")
            },
            {
              label: "Shell: CMD",
              type: "checkbox",
              checked: terminalShell === "cmd",
              click: () => sendMenuAction(win, "terminal-shell-cmd")
            }
          ]
        },
        { type: "separator" },
        {
          label: "Zoom",
          submenu: [
            {
              label: "Zoom In",
              accelerator: "CmdOrCtrl+=",
              click: () => sendMenuAction(win, "zoom-in")
            },
            {
              label: "Zoom Out",
              accelerator: "CmdOrCtrl+-",
              click: () => sendMenuAction(win, "zoom-out")
            },
            {
              label: "Reset Zoom",
              accelerator: "CmdOrCtrl+0",
              click: () => sendMenuAction(win, "zoom-reset")
            }
          ]
        },
        { type: "separator" },
        {
          label: "Developer",
          submenu: [
            { role: "reload" },
            { role: "forceReload" },
            ...(isDevMode ? [{ type: "separator" }, { role: "toggleDevTools" }] : [])
          ]
        }
      ];

  const template = [
    {
      label: "File",
      submenu: fileSubmenu
    },
    {
      label: "Edit",
      submenu: editSubmenu
    },
    {
      label: "View",
      submenu: viewSubmenu
    },
    {
      label: "Workspace",
      submenu: [
        {
          label: "Workspace Graph",
          accelerator: "CmdOrCtrl+Shift+G",
          click: () => sendMenuAction(win, "open-workspace-graph")
        },
        {
          label: "Workspace Activity",
          accelerator: "CmdOrCtrl+Shift+A",
          click: () => sendMenuAction(win, "open-workspace-activity")
        },
        { type: "separator" },
        {
          label: "Open Workspace in VS Code",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => sendMenuAction(win, "open-workspace-in-editor")
        },
        {
          label: "Reveal Workspace in File Explorer",
          accelerator: "CmdOrCtrl+Shift+J",
          click: () => sendMenuAction(win, "reveal-workspace-in-explorer")
        },
        {
          label: "Export Workspace as Zip",
          accelerator: "CmdOrCtrl+Shift+E",
          click: () => sendMenuAction(win, "export-workspace-zip")
        },
        { type: "separator" },
        {
          label: screen === "document" ? "Open Current Note Website View" : "Open Project Website",
          accelerator: "CmdOrCtrl+Shift+W",
          click: () => sendMenuAction(win, "open-website")
        }
      ]
    },
    {
      label: "P2P",
      submenu: [
        {
          label: "P2P Status",
          accelerator: "CmdOrCtrl+Shift+P",
          click: () => sendMenuAction(win, "open-p2p-status")
        },
        { type: "separator" },
        {
          label: "Run Sync Self-Test",
          click: () => sendMenuAction(win, "run-p2p-sync-self-test")
        },
        {
          label: "Conflict Center",
          click: () => sendMenuAction(win, "open-p2p-conflicts")
        },
        { type: "separator" },
        {
          label: "Rotate Workspace Keys",
          click: () => sendMenuAction(win, "rotate-p2p-workspace-keys")
        },
        { type: "separator" },
        {
          label: "How Sync Works",
          click: () => sendMenuAction(win, "open-p2p-sync-help")
        }
      ]
    },
    {
      label: "AI",
      submenu: [
        ...(screen === "document"
          ? [
              {
                label: "Open AI Palette",
                accelerator: "CmdOrCtrl+Shift+I",
                click: () => sendMenuAction(win, "open-ai-palette")
              },
              { type: "separator" }
            ]
          : []),
        {
          label: "AI Settings",
          accelerator: "CmdOrCtrl+Shift+,",
          click: () => sendMenuAction(win, "open-ai-settings")
        },
        { type: "separator" },
        {
          label: "Generate Embeddings",
          click: () => sendMenuAction(win, "ai-generate-embeddings")
        },
        {
          label: "Build Relationship Graph",
          click: () => sendMenuAction(win, "ai-build-graph")
        },
        {
          label: "Detect Patterns",
          click: () => sendMenuAction(win, "ai-detect-patterns")
        },
        { type: "separator" },
        {
          label: "Clear Cache",
          click: () => sendMenuAction(win, "ai-clear-cache")
        }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Help Center",
          accelerator: "F1",
          click: () => sendMenuAction(win, "open-help-center")
        },
        {
          label: "Keyboard Shortcuts",
          accelerator: "CmdOrCtrl+/",
          click: () => sendMenuAction(win, "open-shortcuts")
        },
        { type: "separator" },
        {
          label: "About Notely",
          click: () => sendMenuAction(win, "open-about")
        }
      ]
    }
  ];

  if (isDevMode && Array.isArray(template[template.length - 1]?.submenu)) {
    template[template.length - 1].submenu.push(
      { type: "separator" },
      { role: "toggleDevTools" }
    );
  }

  return Menu.buildFromTemplate(template);
}

module.exports = { buildAppMenu, sendMenuAction };
