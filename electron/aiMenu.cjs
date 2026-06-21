/**
 * AI Menu - Top menu integration for AI Settings
 * Add AI Settings to the application menu bar
 */

const { Menu, ipcMain } = require('electron');

/**
 * Create AI menu template
 */
function createAIMenuTemplate(mainWindow) {
  return {
    label: '⚙️ AI Agent',
    submenu: [
      {
        label: 'AI Settings',
        accelerator: 'CmdOrCtrl+Shift+A',
        click: () => {
          mainWindow.webContents.send('show-ai-settings');
        }
      },
      { type: 'separator' },
      {
        label: 'Generate Embeddings',
        click: async () => {
          const result = await mainWindow.webContents.invoke('ai:embeddings:generate', {});
          mainWindow.webContents.send('ai-task-complete', {
            task: 'embeddings',
            result
          });
        }
      },
      {
        label: 'Build Relationship Graph',
        click: async () => {
          const result = await mainWindow.webContents.invoke('ai:graph:build', {});
          mainWindow.webContents.send('ai-task-complete', {
            task: 'graph',
            result
          });
        }
      },
      {
        label: 'Detect Patterns',
        click: async () => {
          const result = await mainWindow.webContents.invoke('ai:patterns:detect', {});
          mainWindow.webContents.send('ai-task-complete', {
            task: 'patterns',
            result
          });
        }
      },
      { type: 'separator' },
      {
        label: 'Clear Cache',
        click: async () => {
          const result = await mainWindow.webContents.invoke('ai:config:clear-data', {});
          mainWindow.webContents.send('ai-task-complete', {
            task: 'cache',
            result
          });
        }
      }
    ]
  };
}

/**
 * Insert AI menu into application menu
 */
function addAIMenuToApp(app, mainWindow) {
  const template = Menu.getApplicationMenu().items.map(item => item.toJSON?.() || item);

  // Insert AI menu before Help menu (or at end if no Help)
  const helpIndex = template.findIndex(item => item.label === 'Help');
  const insertIndex = helpIndex !== -1 ? helpIndex : template.length;

  template.splice(insertIndex, 0, createAIMenuTemplate(mainWindow));

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Setup AI menu handlers for React
 */
function setupAIMenuHandlers(mainWindow) {
  // Listen for show-ai-settings request from main menu
  ipcMain.on('show-ai-settings-from-menu', () => {
    mainWindow.webContents.send('show-ai-settings');
  });
}

module.exports = {
  createAIMenuTemplate,
  addAIMenuToApp,
  setupAIMenuHandlers
};
