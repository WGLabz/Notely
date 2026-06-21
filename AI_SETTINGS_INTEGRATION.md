/**
 * AI Settings Integration Guide
 * 
 * How to integrate AISettings component and menu into Notely
 */

// ============================================
// 1. UPDATE App.jsx - Add AISettings component
// ============================================

/*
import React, { useState, useEffect } from 'react';
import AISettings from './components/AISettings';
import AIPalette from './components/AIPalette';

function App() {
  const [showAISettings, setShowAISettings] = useState(false);
  const [showAIPalette, setShowAIPalette] = useState(false);
  const [aiQueryLoading, setAiQueryLoading] = useState(false);
  const [aiQueryError, setAiQueryError] = useState(null);

  // Listen for show-ai-settings from menu
  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    const unsubscribe = window.electron.ipcRenderer.on('show-ai-settings', () => {
      setShowAISettings(true);
    });

    return unsubscribe;
  }, []);

  // Handle AI palette keybinding (Cmd+K / Ctrl+K in editor)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd+K or Ctrl+K in editor context
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && e.target.closest('.editor')) {
        e.preventDefault();
        setShowAIPalette(true);
      }
      // Cmd+Shift+A or Ctrl+Shift+A for settings
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setShowAISettings(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAIQuery = async (query) => {
    try {
      setAiQueryLoading(true);
      setAiQueryError(null);

      const response = await window.electron.ipcRenderer.invoke('ai:query', {
        query,
        context: {
          currentFile: currentFile, // from your state
          workspace: notesRoot     // from your state
        }
      });

      if (response.success) {
        // Show result (could be in palette or separate panel)
        console.log('AI Response:', response.data.result);
      } else {
        setAiQueryError(response.error);
      }
    } catch (error) {
      setAiQueryError(error.message);
    } finally {
      setAiQueryLoading(false);
    }
  };

  return (
    <div className="app">
      {/* Your existing app content */}
      
      {/* AI Components */}
      <AIPalette
        isOpen={showAIPalette}
        onClose={() => setShowAIPalette(false)}
        onQuery={handleAIQuery}
        isLoading={aiQueryLoading}
        error={aiQueryError}
      />

      <AISettings
        isOpen={showAISettings}
        onClose={() => setShowAISettings(false)}
      />
    </div>
  );
}

export default App;
*/

// ============================================
// 2. UPDATE electron/main.cjs - Add AI integration
// ============================================

/*
const { app, BrowserWindow, Menu } = require('electron');
const { initializeAIHandlers } = require('./aiHandlers.cjs');
const { addAIMenuToApp, setupAIMenuHandlers } = require('./aiMenu.cjs');
const { initializeAISystem } = require('../src/ai/index.js');

let mainWindow;
let aiAgent;

function createWindow() {
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // ... other preload settings
    }
  });

  // Add AI menu
  addAIMenuToApp(app, mainWindow);
  setupAIMenuHandlers(mainWindow);

  mainWindow.loadURL(...);
}

// Initialize AI system when app is ready
async function initializeAI() {
  try {
    const appDataDir = path.join(app.getPath('appData'), 'notely');
    const workspaceRoot = process.env.NOTES_ROOT || app.getPath('documents');

    // Get stored API key if available
    const AIConfig = require('../src/ai/utils/AIConfig');
    const config = new AIConfig();
    const geminiKey = config.getAPIKey('gemini');

    if (!geminiKey) {
      console.log('[AI] No API key configured. Users can set it in AI Settings.');
    }

    // Initialize AI system
    aiAgent = await initializeAISystem(appDataDir, workspaceRoot, {
      name: 'gemini',
      config: { apiKey: geminiKey || process.env.GEMINI_API_KEY }
    });

    // Setup IPC handlers
    initializeAIHandlers(app, aiAgent);

    console.log('[AI] System initialized successfully');
  } catch (error) {
    console.error('[AI] Initialization failed:', error);
  }
}

app.on('ready', async () => {
  createWindow();
  await initializeAI();
});

app.on('quit', () => {
  if (aiAgent) {
    aiAgent.shutdown();
  }
});
*/

// ============================================
// 3. Environment Variables
// ============================================

/*
Create a .env file in project root:

GEMINI_API_KEY=your_gemini_api_key_here

Or export before running:
  export GEMINI_API_KEY=your_key
  npm run dev
*/

// ============================================
// 4. File Structure After Integration
// ============================================

/*
src/
├── components/
│   ├── AISettings.jsx          ← New
│   ├── AISettings.css          ← New
│   ├── AIPalette.jsx
│   ├── AIPalette.css
│   └── ...
├── App.jsx                     ← Update to add components
└── ...

electron/
├── main.cjs                    ← Update to initialize AI
├── aiHandlers.cjs              ← Existing (updated)
├── aiMenu.cjs                  ← New
└── ...
*/

// ============================================
// 5. Menu Structure (After Integration)
// ============================================

/*
File Edit View Window Help ⚙️ AI Agent
                           - AI Settings (Cmd+Shift+A)
                           - Generate Embeddings
                           - Build Relationship Graph
                           - Detect Patterns
                           - Clear Cache
*/

// ============================================
// 6. Usage Examples
// ============================================

/*
// From React - Trigger AI query from palette
const response = await window.electron.ipcRenderer.invoke('ai:query', {
  query: 'Summarize this document',
  context: { currentFile: '/path/to/file.md' }
});

// From menu - Open settings
window.electron.ipcRenderer.send('show-ai-settings');

// From React - Generate embeddings
const result = await window.electron.ipcRenderer.invoke('ai:embeddings:generate', {
  forceRefresh: false
});

// From React - Get AI status
const status = await window.electron.ipcRenderer.invoke('ai:status', {});
*/

module.exports = {
  integrationGuide: true
};
