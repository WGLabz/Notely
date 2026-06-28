import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { FolderOpen, NotebookPen, Terminal, X } from "lucide-react";
import { DocumentList } from "./components/DocumentList";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CommandPalette } from "./components/CommandPalette";
import { GlobalSearchOverlay } from "./components/GlobalSearchOverlay";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { DashboardPanels } from "./components/DashboardPanels";

// Heavy / rarely-used surfaces are code-split so they don't bloat startup.
const EmbeddedTerminal = lazy(() =>
  import("./components/EmbeddedTerminal").then((m) => ({ default: m.EmbeddedTerminal }))
);
const MediaTab = lazy(() =>
  import("./components/MediaTab").then((m) => ({ default: m.MediaTab }))
);
const DocumentDetail = lazy(() =>
  import("./components/DocumentDetail").then((m) => ({ default: m.DocumentDetail }))
);
const P2PStatusPanel = lazy(() =>
  import("./components/P2PStatusPanel").then((m) => ({ default: m.P2PStatusPanel }))
);
const WorkspaceActivityPanel = lazy(() =>
  import("./components/WorkspaceActivityPanel").then((m) => ({ default: m.WorkspaceActivityPanel }))
);
const ConflictResolutionPanel = lazy(() =>
  import("./components/ConflictResolutionPanel").then((m) => ({ default: m.ConflictResolutionPanel }))
);
const AIChatPanel = lazy(() => import("./components/AIChatPanel"));
const AISettings = lazy(() => import("./components/AISettings"));
import {
  onMenuAction,
  getHistory,
  updateMenuContext,
} from "./services/electronService";
import { useToast } from "./hooks/useToast";
import { useP2PSync } from "./hooks/useP2PSync";
import { useAIAssistant } from "./hooks/useAIAssistant";
import { useDocumentManager } from "./hooks/useDocumentManager";

export default function App() {
  const initialViewMode = (() => {
    try {
      const stored = window.localStorage.getItem("notes:view-mode");
      return stored === "table" ? "table" : "tile";
    } catch {
      return "tile";
    }
  })();

  const initialEditorMode = (() => {
    try {
      const stored = window.localStorage.getItem("notes:editor-mode");
      return ["edit", "split", "preview"].includes(stored) ? stored : "edit";
    } catch {
      return "edit";
    }
  })();

  const initialDensityMode = (() => {
    try {
      const stored = window.localStorage.getItem("notes:density-mode");
      return stored === "compact" ? "compact" : "comfortable";
    } catch {
      return "comfortable";
    }
  })();

  const initialFavorites = (() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("notes:favorites") || "[]");
      return Array.isArray(stored) ? stored.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  })();

  const [mode, setMode] = useState(initialEditorMode);
  const { toasts, notify } = useToast();
  const [notesViewMode, setNotesViewMode] = useState(initialViewMode);
  const [notesDensityMode, setNotesDensityMode] = useState(initialDensityMode);
  const [favoriteNotes, setFavoriteNotes] = useState(initialFavorites);
  const [showTerminal, setShowTerminal] = useState(false);
  const [landingAssetsOpen, setLandingAssetsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);

  const {
    documents,
    current,
    setCurrent,
    history,
    setHistory,
    loading,
    saving,
    activeTab,
    setActiveTab,
    error,
    setError,
    activeProject,
    newNoteTitle,
    setNewNoteTitle,
    creatingNote,
    newFolderName,
    setNewFolderName,
    creatingFolder,
    noteDialogOpen,
    setNoteDialogOpen,
    folderDialogOpen,
    setFolderDialogOpen,
    notesFolderDialogOpen,
    setNotesFolderDialogOpen,
    notesFolderPath,
    setNotesFolderPath,
    savingNotesFolder,
    documentMenuAction,
    setDocumentMenuAction,
    landingFolderPath,
    dirty,
    loadDocumentsData,
    openDocument,
    saveDocument,
    handleReloadCurrentFromDisk,
    handleDeleteCurrentDocument,
    handleCreateNote,
    handleCreateFolder,
    handlePickNotesFolder,
    handleSaveNotesFolder,
    handleGoHome,
    handleOpenCurrentInEditor,
    handleOpenWebsiteFromLanding,
    handleOpenWebsiteForCurrent,
    handleRenameFromTopbar,
    handleOpenListItem,
    handleOpenReferencedDocument,
    handleLandingNavigateTo,
  } = useDocumentManager({ notify });

  const syncStateRef = useRef({ current: null, dirty: false, openDocument: null });
  syncStateRef.current = { doc: current, dirty, openDocument };
  const {
    p2pStatusOpen,
    setP2PStatusOpen,
    p2pStatusLoading,
    p2pStatus,
    fullSyncProgressByPeer,
    handleOpenP2PStatus,
    handleStartP2PDiscovery,
    handleStopP2PDiscovery,
    handleSetP2PDeviceName,
    handleSetP2PKeyPolicyDays,
    handleCreateP2PInvite,
    handlePairP2PWithCode,
    handleManualP2PConnect,
    handleRemoveTrustedP2PPeer,
    handleRotateP2PWorkspaceKeys,
    workspaceActivityOpen,
    setWorkspaceActivityOpen,
    workspaceActivityLoading,
    workspaceActivity,
    handleOpenWorkspaceActivity,
    p2pSyncHelpOpen,
    setP2PSyncHelpOpen,
    syncSelfTestOpen,
    setSyncSelfTestOpen,
    syncSelfTestLoading,
    syncSelfTestResult,
    handleRunP2PSyncSelfTest,
    conflictCenterOpen,
    setConflictCenterOpen,
    conflictCenterLoading,
    conflictCenterData,
    conflictResolutionOpen,
    setConflictResolutionOpen,
    conflictResolutionEntry,
    conflictResolutionFiles,
    conflictResolutionLoading,
    handleOpenConflictCenter,
    handleOpenConflictFile,
    handleOpenConflictResolution,
    handleResolveConflict,
    handleOpenNextConflict,
  } = useP2PSync({ notify, setError, loadDocumentsData, syncStateRef });
  const {
    aiSettingsOpen,
    setAiSettingsOpen,
    aiQueryLoading,
    aiQueryError,
    aiContextSummary,
    aiPaletteIntent,
    aiChatMessages,
    isAIConfigured,
    aiPanelVisible,
    setAiPanelVisible,
    inlineGhostSuggestion,
    aiEditorRef,
    refreshAIConfiguration,
    handleAIEmbeddings,
    handleAIGraph,
    handleAIPatterns,
    handleAIClearCache,
    handleOpenAIPalette,
    handleInlineAIRequest,
    handleApplyAIResult,
    handleAIChatSend,
    handleClearAIChat,
    handleRejectInlineGhost,
    handleAcceptInlineGhost,
  } = useAIAssistant({
    current,
    activeTab,
    mode,
    activeProject,
    landingFolderPath,
    notesFolderPath,
    notify,
  });

  const terminalCwd = current?.filePath
    ? current.filePath.replace(/[\\/][^\\/]+$/, "")
    : (landingFolderPath || activeProject?.rootPath || notesFolderPath);

  async function handleOpenReferencedDocumentFromUI(filePath) {
    await handleOpenReferencedDocument(filePath);
    setLandingAssetsOpen(false);
  }

  useEffect(() => {
    try {
      window.localStorage.setItem("notes:view-mode", notesViewMode);
    } catch {
      // Ignore storage failures.
    }
  }, [notesViewMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem("notes:editor-mode", mode);
    } catch {
      // Ignore storage failures.
    }
  }, [mode]);

  useEffect(() => {
    try {
      window.localStorage.setItem("notes:density-mode", notesDensityMode);
    } catch {
      // Ignore storage failures.
    }
  }, [notesDensityMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem("notes:favorites", JSON.stringify(favoriteNotes));
    } catch {
      // Ignore storage failures.
    }
  }, [favoriteNotes]);

  useEffect(() => {
    function onGlobalKeyDown(event) {
      const isCmdK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      const isGlobalSearch = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f";
      const isShortcutHelp = (event.ctrlKey || event.metaKey) && event.key === "/";

      if (isCmdK) {
        event.preventDefault();
        setGlobalSearchOpen(false);
        setShortcutsModalOpen(false);
        setCommandPaletteOpen(true);
        return;
      }

      if (isGlobalSearch) {
        event.preventDefault();
        setCommandPaletteOpen(false);
        setShortcutsModalOpen(false);
        setGlobalSearchOpen(true);
        return;
      }

      if (isShortcutHelp) {
        event.preventDefault();
        setCommandPaletteOpen(false);
        setGlobalSearchOpen(false);
        setShortcutsModalOpen(true);
      }
    }

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  useEffect(() => {
    updateMenuContext({
      screen: current ? "document" : "landing",
      viewMode: notesViewMode,
      densityMode: notesDensityMode,
      dirty,
    });
  }, [current, notesViewMode, notesDensityMode, dirty]);

  useEffect(() => {
    return onMenuAction((action) => {
      if (action === "new-note") {
        setNoteDialogOpen(true);
        return;
      }

      if (action === "new-folder") {
        setFolderDialogOpen(true);
        return;
      }

      if (action === "open-notes-folder-settings") {
        setNotesFolderDialogOpen(true);
        return;
      }

      if (action === "open-p2p-status") {
        handleOpenP2PStatus();
        return;
      }

      if (action === "open-workspace-activity") {
        handleOpenWorkspaceActivity();
        return;
      }

      if (action === "open-p2p-sync-help") {
        setP2PSyncHelpOpen(true);
        return;
      }

      if (action === "run-p2p-sync-self-test") {
        handleRunP2PSyncSelfTest();
        return;
      }

      if (action === "rotate-p2p-workspace-keys") {
        handleRotateP2PWorkspaceKeys();
        return;
      }

      if (action === "open-p2p-conflicts") {
        handleOpenConflictCenter();
        return;
      }

      if (action === "view-tile") {
        setNotesViewMode("tile");
        return;
      }

      if (action === "view-table") {
        setNotesViewMode("table");
        return;
      }

      if (action === "view-density-comfortable") {
        setNotesDensityMode("comfortable");
        return;
      }

      if (action === "view-density-compact") {
        setNotesDensityMode("compact");
        return;
      }

      if (action === "save-document") {
        saveDocument();
        return;
      }

      if (action === "back-to-notes") {
        handleGoHome();
        return;
      }

      if (action === "open-in-editor") {
        handleOpenCurrentInEditor();
        return;
      }

      if (action === "rename-note") {
        handleRenameFromTopbar();
        return;
      }

      if (action === "find-in-note" || action === "find-replace") {
        if (current) {
          setDocumentMenuAction({ action: "find-replace", nonce: Date.now() });
        }
        return;
      }

      if (action === "toggle-outline" || action === "toggle-split-preview" || action === "toggle-focus-mode") {
        if (current) {
          setDocumentMenuAction({ action, nonce: Date.now() });
        }
        return;
      }

      if (action === "export-pdf") {
        if (current) {
          setDocumentMenuAction({ action, nonce: Date.now() });
        }
        return;
      }

      if (action === "manage-versions") {
        if (current) {
          setDocumentMenuAction({ action, nonce: Date.now() });
        }
        return;
      }

      if (action === "open-website") {
        if (current) {
          handleOpenWebsiteForCurrent();
        } else {
          handleOpenWebsiteFromLanding();
        }
        return;
      }

      if (action === "reload-document") {
        handleReloadCurrentFromDisk();
        return;
      }

      if (action === "remove-document") {
        handleDeleteCurrentDocument();
        return;
      }

      if (action === "open-ai-settings") {
        setAiSettingsOpen(true);
        return;
      }

      if (action === "open-ai-palette") {
        handleOpenAIPalette({ forceOpen: true });
        return;
      }

      if (action === "ai-generate-embeddings") {
        handleAIEmbeddings();
        return;
      }

      if (action === "ai-build-graph") {
        handleAIGraph();
        return;
      }

      if (action === "ai-detect-patterns") {
        handleAIPatterns();
        return;
      }

      if (action === "ai-clear-cache") {
        handleAIClearCache();
        return;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, dirty, activeProject, activeTab]);

  const folderCount = documents.filter((entry) => entry.entryType === "folder").length;
  const noteCount = documents.length - folderCount;
  const paletteCommands = [
    { id: "new-note", label: "Create New Note", group: "Notes", shortcut: "Ctrl/Cmd+N" },
    { id: "new-folder", label: "Create New Folder", group: "Notes" },
    { id: "open-global-search", label: "Open Global Search", group: "Search", shortcut: "Ctrl/Cmd+Shift+F" },
    { id: "open-shortcuts", label: "Open Keyboard Shortcuts", group: "Help", shortcut: "Ctrl/Cmd+/" },
    { id: "open-notes-folder", label: "Open Notes Folder Settings", group: "Workspace" },
    { id: "open-assets", label: "Open Assets Library", group: "Workspace" },
    { id: "open-workspace-activity", label: "Open Workspace Activity", group: "Sync" },
    { id: "open-p2p-status", label: "Open P2P Status", group: "Sync" },
    { id: "open-ai-settings", label: "Open AI Settings", group: "AI" },
    { id: "toggle-terminal", label: showTerminal ? "Hide Terminal" : "Show Terminal", group: "View" },
    {
      id: "toggle-view-mode",
      label: notesViewMode === "tile" ? "Switch to Table View" : "Switch to Tile View",
      group: "View",
    },
    {
      id: "find-in-note",
      label: "Find in Current Note",
      group: "Editor",
      shortcut: "Ctrl/Cmd+F",
      disabled: !current,
    },
  ];

  async function handleRunPaletteCommand(commandId) {
    setCommandPaletteOpen(false);

    if (commandId === "new-note") {
      setNoteDialogOpen(true);
      return;
    }

    if (commandId === "new-folder") {
      setFolderDialogOpen(true);
      return;
    }

    if (commandId === "open-notes-folder") {
      setNotesFolderDialogOpen(true);
      return;
    }

    if (commandId === "open-global-search") {
      setGlobalSearchOpen(true);
      return;
    }

    if (commandId === "open-shortcuts") {
      setShortcutsModalOpen(true);
      return;
    }

    if (commandId === "open-assets") {
      setLandingAssetsOpen(true);
      return;
    }

    if (commandId === "open-workspace-activity") {
      await handleOpenWorkspaceActivity();
      return;
    }

    if (commandId === "open-p2p-status") {
      await handleOpenP2PStatus();
      return;
    }

    if (commandId === "open-ai-settings") {
      setAiSettingsOpen(true);
      return;
    }

    if (commandId === "toggle-terminal") {
      setShowTerminal((open) => !open);
      return;
    }

    if (commandId === "toggle-view-mode") {
      setNotesViewMode((value) => (value === "tile" ? "table" : "tile"));
      return;
    }

    if (commandId === "find-in-note") {
      if (!current) {
        notify("Open a note to search within it.", "info");
        return;
      }
      setDocumentMenuAction({ action: "find-replace", nonce: Date.now() });
    }
  }

  async function handleOpenGlobalSearchResult(result, query) {
    setGlobalSearchOpen(false);

    if (result?.kind === "current-note-match") {
      if (!current) {
        notify("Open a note to search inside it.", "info");
        return;
      }
      setDocumentMenuAction({ action: "find-replace", query, nonce: Date.now() });
      return;
    }

    if (result?.kind === "document" && result.entry) {
      await handleOpenListItem(result.entry);
    }
  }

  function handleDashboardAction(action) {
    if (action === "new-note") {
      setNoteDialogOpen(true);
      return;
    }

    if (action === "new-folder") {
      setFolderDialogOpen(true);
      return;
    }

    if (action === "search") {
      setGlobalSearchOpen(true);
      return;
    }

    if (action === "assets") {
      setLandingAssetsOpen(true);
    }
  }

  function handleToggleFavorite(filePath) {
    if (!filePath) return;
    setFavoriteNotes((currentFavorites) => {
      if (currentFavorites.includes(filePath)) {
        return currentFavorites.filter((item) => item !== filePath);
      }
      return [...currentFavorites, filePath];
    });
  }
  const rootPath = activeProject?.rootPath || notesFolderPath || "";
  const currentLandingPath = landingFolderPath || rootPath;
  const normalizedRootPath = String(rootPath || "").replace(/[\\/]+$/, "");
  const normalizedLandingPath = String(currentLandingPath || "").replace(/[\\/]+$/, "");
  const isRootLandingView = Boolean(normalizedRootPath) && normalizedRootPath.toLowerCase() === normalizedLandingPath.toLowerCase();
  const breadcrumbSegments = [];
  if (normalizedRootPath) {
    breadcrumbSegments.push({
      path: normalizedRootPath,
      label: activeProject?.isRoot ? "Workspace" : (activeProject?.name || "Project"),
    });

    const rootForCompare = normalizedRootPath.replace(/\\/g, "/").toLowerCase();
    const currentForCompare = normalizedLandingPath.replace(/\\/g, "/").toLowerCase();

    if (currentForCompare.startsWith(rootForCompare)) {
      const relativePath = normalizedLandingPath.slice(normalizedRootPath.length).replace(/^[\\/]+/, "");
      const pathSeparator = normalizedRootPath.includes("\\") ? "\\" : "/";
      let cursorPath = normalizedRootPath;
      if (relativePath) {
        relativePath.split(/[\\/]+/).filter(Boolean).forEach((segment) => {
          cursorPath = `${cursorPath}${cursorPath.endsWith("/") || cursorPath.endsWith("\\") ? "" : pathSeparator}${segment}`;
          breadcrumbSegments.push({ path: cursorPath, label: segment });
        });
      }
    }
  }

  const noteBreadcrumbSegments = [];
  if (current?.filePath && normalizedRootPath) {
    noteBreadcrumbSegments.push({
      path: normalizedRootPath,
      label: activeProject?.isRoot ? "Workspace" : (activeProject?.name || "Project"),
    });

    const noteParentPath = String(current.filePath || "").replace(/[\\/][^\\/]+$/, "").replace(/[\\/]+$/, "");
    const rootForCompare = normalizedRootPath.replace(/\\/g, "/").toLowerCase();
    const noteParentForCompare = noteParentPath.replace(/\\/g, "/").toLowerCase();

    if (noteParentForCompare.startsWith(rootForCompare)) {
      const relativePath = noteParentPath.slice(normalizedRootPath.length).replace(/^[\\/]+/, "");
      const pathSeparator = normalizedRootPath.includes("\\") ? "\\" : "/";
      let cursorPath = normalizedRootPath;
      if (relativePath) {
        relativePath.split(/[\\/]+/).filter(Boolean).forEach((segment) => {
          cursorPath = `${cursorPath}${cursorPath.endsWith("/") || cursorPath.endsWith("\\") ? "" : pathSeparator}${segment}`;
          noteBreadcrumbSegments.push({ path: cursorPath, label: segment });
        });
      }
    }
  }

  return (
    <div className={`app-shell${showTerminal ? " terminal-open" : ""}`}>
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div className={`toast-item ${toast.type}`} key={toast.id}>
            {toast.message}
          </div>
        ))}
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!showTerminal ? (
        <div className="terminal-status-bar">
          <div className="terminal-status-left">
            <button
              className="terminal-status-button"
              type="button"
              onClick={() => setShowTerminal(true)}
              title="Open terminal"
            >
              <Terminal size={16} />
              <strong>Terminal</strong>
              {terminalCwd && <span className="terminal-status-path">{terminalCwd}</span>}
            </button>
          </div>
          <div className="terminal-status-right" aria-label="Terminal metadata">
            <span className="terminal-meta-pill" title="Current workspace scope">
              {activeProject?.isRoot ? "Root" : activeProject?.name || "Project"}
            </span>
            {current ? (
              <>
                <span className="terminal-meta-pill" title="Editor mode and active tab">
                  {mode === "split" ? "Split" : mode === "preview" ? "Preview" : "Edit"} | {activeTab === "raw" ? "Raw" : "Formal"}
                </span>
                <span className={`terminal-meta-pill ${dirty ? "warn" : ""}`} title="Document save status">
                  {dirty ? "Unsaved" : "Saved"}
                </span>
              </>
            ) : (
              <span className="terminal-meta-pill" title="Current notes in list">
                {documents.length} notes
              </span>
            )}
          </div>
        </div>
      ) : null}
      {!current ? (
        <div className="landing-shell">
          <header className="landing-header">
            <div className="landing-header-main">
              <h1>{activeProject?.isRoot ? "All Notes" : `${activeProject?.name || "Folder"} Notes`}</h1>
              <div className="landing-stats" aria-label="Current folder metrics">
                <span><em>Folders</em><strong>{folderCount}</strong></span>
                <span><em>Notes</em><strong>{noteCount}</strong></span>
              </div>
              {breadcrumbSegments.length ? (
                <nav
                  className="landing-path"
                  aria-label="Folder path"
                  title={landingFolderPath || activeProject?.rootPath || notesFolderPath || "Path unavailable"}
                >
                  {breadcrumbSegments.map((segment, index) => {
                    const isCurrent = index === breadcrumbSegments.length - 1;
                    return (
                      <span className="landing-path-part" key={segment.path}>
                        <button
                          className={`landing-path-segment${isCurrent ? " active" : ""}`}
                          type="button"
                          onClick={() => handleLandingNavigateTo(segment.path)}
                          disabled={isCurrent}
                        >
                          {segment.label}
                        </button>
                        {isCurrent ? null : <span className="landing-path-separator" aria-hidden="true">/</span>}
                      </span>
                    );
                  })}
                </nav>
              ) : (
                <div className="landing-path">Path unavailable</div>
              )}
            </div>
          </header>
          {isRootLandingView ? (
            <div className="landing-workspace-layout">
              <aside className="landing-dashboard-rail" aria-label="Workspace dashboard rail">
                <DashboardPanels
                  documents={documents}
                  loading={loading}
                  onOpen={handleOpenListItem}
                  onAction={handleDashboardAction}
                  favorites={favoriteNotes}
                  layout="rail"
                />
              </aside>
              <div className="landing-notes-pane">
                <DocumentList
                  documents={documents}
                  onOpen={handleOpenListItem}
                  loading={loading}
                  viewMode={notesViewMode}
                  density={notesDensityMode}
                  favorites={favoriteNotes}
                  onToggleFavorite={handleToggleFavorite}
                />
              </div>
            </div>
          ) : (
            <div className="landing-notes-pane standalone">
              <DocumentList
                documents={documents}
                onOpen={handleOpenListItem}
                loading={loading}
                viewMode={notesViewMode}
                density={notesDensityMode}
                favorites={favoriteNotes}
                onToggleFavorite={handleToggleFavorite}
              />
            </div>
          )}
          {landingAssetsOpen ? (
            <div
              className="overlay-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Assets"
              onClick={(event) => {
                if (event.target === event.currentTarget) setLandingAssetsOpen(false);
              }}
            >
              <div className="overlay-dialog-card assets-dialog-card">
                <div className="overlay-dialog-header assets-dialog-header">
                  <div className="assets-dialog-title-group">
                    <h2>Assets Library</h2>
                    <p>Browse assets in this folder.</p>
                  </div>
                  <button
                    className="icon-button assets-close-button"
                    onClick={() => setLandingAssetsOpen(false)}
                    type="button"
                    aria-label="Close assets dialog"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="assets-dialog-body">
                  <Suspense fallback={<div className="lazy-loading">Loading media…</div>}>
                    <MediaTab
                      content=""
                      basePath={`${(landingFolderPath || activeProject?.rootPath || notesFolderPath || "").replace(/[\\/]+$/, "")}/_assets.md`}
                      onNotify={notify}
                      onOpenDocument={handleOpenReferencedDocumentFromUI}
                    />
                  </Suspense>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <Suspense fallback={<div className="lazy-loading">Loading editor…</div>}>
          <DocumentDetail
            document={current}
            history={history}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            mode={mode}
            setMode={setMode}
            onChange={setCurrent}
            onSave={saveDocument}
            onRefreshHistory={async () => setHistory(await getHistory(current.filePath))}
            saving={saving}
            dirty={dirty}
            menuAction={documentMenuAction}
            onNotify={notify}
            onBack={handleGoHome}
            breadcrumbs={noteBreadcrumbSegments}
            onNavigateBreadcrumb={async (targetPath) => {
              const didLeave = handleGoHome();
              if (!didLeave) return;
              await handleLandingNavigateTo(targetPath);
            }}
            onOpenAI={handleOpenAIPalette}
            onOpenAIRequest={handleOpenAIPalette}
            onInlineAIRequest={handleInlineAIRequest}
            onRegisterAIEditor={(api) => {
              aiEditorRef.current = api;
            }}
            inlineGhostSuggestion={inlineGhostSuggestion}
            onAcceptInlineGhost={handleAcceptInlineGhost}
            onRejectInlineGhost={handleRejectInlineGhost}
            aiEnabled={isAIConfigured}
            aiPanelVisible={aiPanelVisible}
            onShowAI={() => {
              if (!isAIConfigured) {
                notify("Configure an AI provider key in AI Settings to use AI chat.", "warning");
                setAiSettingsOpen(true);
                return;
              }
              setAiPanelVisible(true);
            }}
            onOpenAISettings={() => setAiSettingsOpen(true)}
            onOpenDocument={handleOpenReferencedDocumentFromUI}
            aiSidebar={aiPanelVisible && isAIConfigured ? (
              <ErrorBoundary label="AI chat">
                <Suspense fallback={<div className="lazy-loading">Loading AI…</div>}>
                  <AIChatPanel
                    onHide={() => setAiPanelVisible(false)}
                    onClear={handleClearAIChat}
                    onSend={handleAIChatSend}
                    onApply={handleApplyAIResult}
                    isLoading={aiQueryLoading}
                    error={aiQueryError || null}
                    contextSummary={aiContextSummary}
                    intent={aiPaletteIntent}
                    messages={aiChatMessages}
                    noteTitle={current?.title || "Current Note"}
                  />
                </Suspense>
              </ErrorBoundary>
            ) : null}
          />
        </Suspense>
      )}

      {showTerminal ? (
        <div className="terminal-dock open">
          <ErrorBoundary label="Terminal">
            <Suspense fallback={<div className="lazy-loading">Loading terminal…</div>}>
              <EmbeddedTerminal cwd={terminalCwd} onClose={() => setShowTerminal(false)} />
            </Suspense>
          </ErrorBoundary>
        </div>
      ) : null}

      {noteDialogOpen ? (
        <div className="overlay-dialog" role="dialog" aria-modal="true" aria-label="Create note">
          <div className="overlay-dialog-card">
            <div className="overlay-dialog-header">
              <h2>New Note</h2>
              <button
                className="icon-button"
                onClick={() => setNoteDialogOpen(false)}
                type="button"
                aria-label="Close new note dialog"
              >
                <X size={16} />
              </button>
            </div>
            <label className="overlay-dialog-field">
              <span>Note title</span>
              <input
                type="text"
                value={newNoteTitle}
                onChange={(event) => setNewNoteTitle(event.target.value)}
                placeholder="Enter note title"
                autoFocus
              />
            </label>
            <div className="overlay-dialog-actions">
              <button className="primary-button" onClick={handleCreateNote} disabled={creatingNote} type="button">
                <NotebookPen size={14} />
                {creatingNote ? "Creating..." : "Create Note"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {folderDialogOpen ? (
        <div className="overlay-dialog" role="dialog" aria-modal="true" aria-label="Create folder">
          <div className="overlay-dialog-card">
            <div className="overlay-dialog-header">
              <h2>New Folder</h2>
              <button
                className="icon-button"
                onClick={() => setFolderDialogOpen(false)}
                type="button"
                aria-label="Close new folder dialog"
              >
                <X size={16} />
              </button>
            </div>
            <label className="overlay-dialog-field">
              <span>Folder name</span>
              <input
                type="text"
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="Enter folder name"
                autoFocus
              />
            </label>
            <div className="overlay-dialog-actions">
              <button className="primary-button" onClick={handleCreateFolder} disabled={creatingFolder} type="button">
                {creatingFolder ? "Creating..." : "Create Folder"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notesFolderDialogOpen ? (
        <div className="overlay-dialog" role="dialog" aria-modal="true" aria-label="Configure notes folder">
          <div className="overlay-dialog-card">
            <div className="overlay-dialog-header">
              <h2>Notes Folder</h2>
              <button
                className="icon-button"
                onClick={() => setNotesFolderDialogOpen(false)}
                type="button"
                aria-label="Close notes folder dialog"
              >
                <X size={16} />
              </button>
            </div>
            <label className="overlay-dialog-field">
              <span>Location</span>
              <input
                type="text"
                value={notesFolderPath}
                onChange={(event) => setNotesFolderPath(event.target.value)}
                placeholder="Select notes folder path"
              />
            </label>
            <div className="overlay-dialog-actions split">
              <button className="small-button" onClick={handlePickNotesFolder} type="button">
                <FolderOpen size={14} />
                Browse
              </button>
              <button
                className="primary-button"
                onClick={handleSaveNotesFolder}
                disabled={savingNotesFolder}
                type="button"
              >
                {savingNotesFolder ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {p2pStatusOpen ? (
        <div className="overlay-dialog" role="dialog" aria-modal="true" aria-label="P2P status">
          <div className="overlay-dialog-card p2p-status-dialog-card">
            <div className="overlay-dialog-header">
              <h2>P2P Status</h2>
              <button
                className="icon-button"
                onClick={() => setP2PStatusOpen(false)}
                type="button"
                aria-label="Close P2P status"
              >
                <X size={16} />
              </button>
            </div>
            <Suspense fallback={<div className="lazy-loading">Loading P2P status…</div>}>
              <P2PStatusPanel
                status={p2pStatus}
                loading={p2pStatusLoading}
                fullSyncProgressByPeer={fullSyncProgressByPeer}
                onRefresh={handleOpenP2PStatus}
                onStartDiscovery={handleStartP2PDiscovery}
                onStopDiscovery={handleStopP2PDiscovery}
                onSetDeviceName={handleSetP2PDeviceName}
                onSetKeyPolicyDays={handleSetP2PKeyPolicyDays}
                onCreateInvite={handleCreateP2PInvite}
                onPairWithCode={handlePairP2PWithCode}
                onManualConnect={handleManualP2PConnect}
                onRemoveTrustedPeer={handleRemoveTrustedP2PPeer}
                onRotateWorkspaceKeys={handleRotateP2PWorkspaceKeys}
              />
            </Suspense>
          </div>
        </div>
      ) : null}

      {workspaceActivityOpen ? (
        <div className="overlay-dialog" role="dialog" aria-modal="true" aria-label="Workspace activity">
          <div className="overlay-dialog-card activity-dialog-card">
            <div className="overlay-dialog-header">
              <h2>Workspace Activity</h2>
              <button
                className="icon-button"
                onClick={() => setWorkspaceActivityOpen(false)}
                type="button"
                aria-label="Close workspace activity"
              >
                <X size={16} />
              </button>
            </div>
            <Suspense fallback={<div className="lazy-loading">Loading activity…</div>}>
              <WorkspaceActivityPanel
                data={workspaceActivity}
                loading={workspaceActivityLoading}
                onRefresh={handleOpenWorkspaceActivity}
              />
            </Suspense>
          </div>
        </div>
      ) : null}

      {aiSettingsOpen ? (
        <Suspense fallback={<div className="lazy-loading">Loading settings…</div>}>
          <AISettings
            isOpen={aiSettingsOpen}
            onClose={() => {
              setAiSettingsOpen(false);
              refreshAIConfiguration();
            }}
          />
        </Suspense>
      ) : null}

      {p2pSyncHelpOpen ? (
        <div className="overlay-dialog" role="dialog" aria-modal="true" aria-label="P2P sync notes">
          <div className="overlay-dialog-card">
            <div className="overlay-dialog-header">
              <h2>How P2P Sync Works</h2>
              <button
                className="icon-button"
                onClick={() => setP2PSyncHelpOpen(false)}
                type="button"
                aria-label="Close P2P sync help"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p2p-sync-help-content">
              <p><strong>Current behavior</strong></p>
              <ol>
                <li>Discovery: each app broadcasts a LAN hello packet and lists nearby peers.</li>
                <li>Connect: you can manually ping a peer by address and port.</li>
                <li>Pairing: one peer creates an invite code, the other submits the code to establish trust.</li>
                <li>Trust state: trusted peers are saved locally on each device.</li>
                <li>Sync: create, update, and delete note events are shared between trusted peers.</li>
              </ol>
              <p><strong>File sync status</strong></p>
              <p>Automatic note sync is enabled for trusted peers using AES-256-GCM encrypted sync events.</p>
              <p><strong>Planned next phase</strong></p>
              <ol>
                <li>Replace full-content updates with true section/line deltas.</li>
                <li>Add richer conflict resolution UI (manual choose/merge).</li>
                <li>Add delivery retry queues and offline reconciliation.</li>
              </ol>
            </div>
          </div>
        </div>
      ) : null}

      {conflictResolutionOpen && conflictResolutionEntry ? (
        <div className="overlay-dialog" role="dialog" aria-modal="true" aria-label="Resolve sync conflict">
          <div className="overlay-dialog-card conflict-resolve-dialog-card">
            <div className="overlay-dialog-header">
              <h2>Resolve Conflict</h2>
              <button
                className="icon-button"
                onClick={() => setConflictResolutionOpen(false)}
                type="button"
                aria-label="Close conflict resolution"
              >
                <X size={16} />
              </button>
            </div>
            {conflictResolutionLoading && !conflictResolutionFiles ? (
              <p className="p2p-status-table-empty">Loading files...</p>
            ) : conflictResolutionFiles ? (
              <Suspense fallback={<div className="lazy-loading">Loading conflict resolver…</div>}>
                <ConflictResolutionPanel
                  localFile={conflictResolutionFiles.local}
                  conflictFile={conflictResolutionFiles.conflict}
                  relativePath={conflictResolutionEntry.relativePath || conflictResolutionEntry.filePath}
                  onResolve={handleResolveConflict}
                  loading={conflictResolutionLoading}
                />
              </Suspense>
            ) : null}
          </div>
        </div>
      ) : null}

      {syncSelfTestOpen ? (
        <div className="overlay-dialog" role="dialog" aria-modal="true" aria-label="P2P sync self-test">
          <div className="overlay-dialog-card">
            <div className="overlay-dialog-header">
              <h2>P2P Sync Self-Test</h2>
              <button
                className="icon-button"
                onClick={() => setSyncSelfTestOpen(false)}
                type="button"
                aria-label="Close sync self-test"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p2p-sync-help-content">
              {syncSelfTestLoading ? (
                <p>Running self-test...</p>
              ) : syncSelfTestResult ? (
                <>
                  <p>
                    <strong>Result:</strong>{" "}
                    <span className={syncSelfTestResult.ok ? "p2p-test-pass" : "p2p-test-fail"}>
                      {syncSelfTestResult.ok ? "PASS" : "FAIL"}
                    </span>
                  </p>
                  <p><strong>Crypto round-trip:</strong> {syncSelfTestResult.cryptoRoundTrip || "N/A"}</p>
                  <p><strong>Trusted peers:</strong> {syncSelfTestResult.trustedPeers ?? "N/A"}</p>
                  <p><strong>Outbox count:</strong> {syncSelfTestResult.outboxCount ?? "N/A"}</p>
                  {syncSelfTestResult.error ? (
                    <p className="p2p-test-fail"><strong>Error:</strong> {syncSelfTestResult.error}</p>
                  ) : null}
                </>
              ) : (
                <p>No result yet.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {conflictCenterOpen ? (
        <div className="overlay-dialog" role="dialog" aria-modal="true" aria-label="P2P conflict center">
          <div className="overlay-dialog-card p2p-status-dialog-card">
            <div className="overlay-dialog-header">
              <h2>Conflict Center</h2>
              <button
                className="icon-button"
                onClick={() => setConflictCenterOpen(false)}
                type="button"
                aria-label="Close conflict center"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p2p-conflict-center">
              <div className="p2p-conflict-center-actions">
                <button
                  className="small-button"
                  type="button"
                  onClick={handleOpenNextConflict}
                  disabled={!conflictCenterData?.conflicts?.length}
                >
                  Resolve Next Unresolved
                </button>
              </div>
              {conflictCenterLoading ? (
                <p className="p2p-status-table-empty">Loading conflicts...</p>
              ) : !conflictCenterData?.conflicts?.length ? (
                <p className="p2p-status-table-empty">No unresolved sync conflicts.</p>
              ) : (
                <table className="p2p-status-peer-table">
                  <thead>
                    <tr>
                      <th>Note</th>
                      <th>Conflict File</th>
                      <th>When</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conflictCenterData.conflicts.map((entry) => (
                      <tr key={entry.id}>
                        <td className="mono-cell">{entry.relativePath || entry.filePath}</td>
                        <td className="mono-cell" title={entry.conflictPath}>
                          {entry.conflictPath.split(/[\\/]/).pop()}
                        </td>
                        <td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "Unknown"}</td>
                        <td className="p2p-conflict-actions">
                          <button
                            className="small-button"
                            type="button"
                            onClick={() => handleOpenConflictResolution(entry)}
                          >
                            Resolve
                          </button>
                          <button
                            className="small-button"
                            type="button"
                            onClick={() => handleOpenConflictFile(entry.filePath)}
                          >
                            Open Local
                          </button>
                          <button
                            className="small-button"
                            type="button"
                            onClick={() => handleOpenConflictFile(entry.conflictPath)}
                          >
                            Open Conflict
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <CommandPalette
        isOpen={commandPaletteOpen}
        commands={paletteCommands.filter((command) => !command.disabled)}
        onClose={() => setCommandPaletteOpen(false)}
        onRun={handleRunPaletteCommand}
      />

      <GlobalSearchOverlay
        isOpen={globalSearchOpen}
        documents={documents}
        currentDocument={current}
        onClose={() => setGlobalSearchOpen(false)}
        onOpenResult={handleOpenGlobalSearchResult}
      />

      <KeyboardShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />

    </div>
  );
}
