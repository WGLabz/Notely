const { Menu } = require("electron");

// Sends a menu-action signal to the renderer for the given window.
function sendMenuAction(win, action) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("app-menu:action", action);
}

// Builds the application menu template based on the current screen/view context.
function buildAppMenu(win, context = {}) {
  const screen = context?.screen === "document" ? "document" : "landing";
  const viewMode = context?.viewMode === "table" ? "table" : "tile";
  const dirty = Boolean(context?.dirty);

  const fileSubmenu = screen === "document"
    ? [
        {
          label: "New Note",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuAction(win, "new-note")
        },
        {
          label: "Notes Folder",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => sendMenuAction(win, "open-notes-folder-settings")
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
        {
          label: "Workspace Activity",
          accelerator: "CmdOrCtrl+Shift+A",
          click: () => sendMenuAction(win, "open-workspace-activity")
        },
        { type: "separator" },
        {
          label: "Open",
          submenu: [
            {
              label: "Open in VS Code",
              accelerator: "CmdOrCtrl+Shift+O",
              click: () => sendMenuAction(win, "open-in-editor")
            },
            {
              label: "Open Website View",
              accelerator: "CmdOrCtrl+Shift+W",
              click: () => sendMenuAction(win, "open-website")
            }
          ]
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
          label: "Notes Folder",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => sendMenuAction(win, "open-notes-folder-settings")
        },
        { type: "separator" },
        {
          label: "Open Website View",
          accelerator: "CmdOrCtrl+Shift+W",
          click: () => sendMenuAction(win, "open-website")
        },
        {
          label: "Workspace Activity",
          accelerator: "CmdOrCtrl+Shift+A",
          click: () => sendMenuAction(win, "open-workspace-activity")
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
            label: "Find or Replace",
            accelerator: "CmdOrCtrl+F",
            click: () => sendMenuAction(win, "find-replace")
          },
          {
            label: "Toggle Outline",
            accelerator: "CmdOrCtrl+Shift+L",
            click: () => sendMenuAction(win, "toggle-outline")
          },
          {
            label: "Toggle Split Preview",
            accelerator: "CmdOrCtrl+\\",
            click: () => sendMenuAction(win, "toggle-split-preview")
          },
          {
            label: "Toggle Focus Mode",
            accelerator: "CmdOrCtrl+Shift+F",
            click: () => sendMenuAction(win, "toggle-focus-mode")
          }
        ]
      : [])
  ];

  const viewSubmenu = screen === "document"
    ? [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" }
      ]
    : [
        {
          label: "Tile Notes",
          accelerator: "CmdOrCtrl+1",
          type: "radio",
          checked: viewMode === "tile",
          click: () => sendMenuAction(win, "view-tile")
        },
        {
          label: "Table Notes",
          accelerator: "CmdOrCtrl+2",
          type: "radio",
          checked: viewMode === "table",
          click: () => sendMenuAction(win, "view-table")
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" }
      ];

  return Menu.buildFromTemplate([
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
                accelerator: "CmdOrCtrl+K",
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
        { role: "toggleDevTools" }
      ]
    }
  ]);
}

module.exports = { buildAppMenu, sendMenuAction };
