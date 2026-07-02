import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { NotebookPen, Terminal, X } from "lucide-react";
import { DocumentList } from "./components/DocumentList";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DashboardPanels } from "./components/DashboardPanels";
import { LandingListControls } from "./components/LandingListControls";
import { applyDocumentListQuery } from "./utils/documentListQuery";

// Heavy / rarely-used surfaces are code-split so they don't bloat startup.
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
const WorkspaceGraphPanel = lazy(() =>
  import("./components/WorkspaceGraphPanel").then((m) => ({ default: m.WorkspaceGraphPanel }))
);
const EmbeddedTerminal = lazy(() =>
  import("./components/EmbeddedTerminal").then((m) => ({ default: m.EmbeddedTerminal }))
);
const CommandPalette = lazy(() =>
  import("./components/CommandPalette").then((m) => ({ default: m.CommandPalette }))
);
const GlobalSearchOverlay = lazy(() =>
  import("./components/GlobalSearchOverlay").then((m) => ({ default: m.GlobalSearchOverlay }))
);
const KeyboardShortcutsModal = lazy(() =>
  import("./components/KeyboardShortcutsModal").then((m) => ({ default: m.KeyboardShortcutsModal }))
);
const HelpCenterModal = lazy(() =>
  import("./components/HelpCenterModal").then((m) => ({ default: m.HelpCenterModal }))
);
const AboutModal = lazy(() =>
  import("./components/AboutModal").then((m) => ({ default: m.AboutModal }))
);
import {
  onMenuAction,
  notifyBootReady,
  notifyBootProgress,
  getHistory,
  getAppInfo,
  getHelpDocuments,
  updateMenuContext,
  getGitWorkspaceMetadata,
  setAutoIgnoreGitMetadata,
} from "./services/electronService";
import { useToast } from "./hooks/useToast";
import { useP2PSync } from "./hooks/useP2PSync";
import { useAIAssistant } from "./hooks/useAIAssistant";
import { useDocumentManager } from "./hooks/useDocumentManager";
import { useWorkspaceScopedStorage } from "./hooks/useWorkspaceScopedStorage";

function getPaletteUsageKey(commandId) {
  const rawId = resolvePaletteCommandId(commandId);
  if (rawId.startsWith("open-sibling-note:")) {
    return "open-sibling-note";
  }
  if (rawId.startsWith("open-note:")) {
    return "open-note";
  }
  return rawId;
}

function resolvePaletteCommandId(commandId) {
  const rawId = String(commandId || "");
  if (rawId.startsWith("frequent:")) {
    return resolvePaletteCommandId(rawId.slice("frequent:".length));
  }
  if (rawId.startsWith("pinned:")) {
    return resolvePaletteCommandId(rawId.slice("pinned:".length));
  }
  return rawId;
}

function normalizePaletteUsageMap(rawValue) {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) return {};
  return Object.fromEntries(
    Object.entries(rawValue).filter(([key, value]) => typeof key === "string" && Number.isFinite(value) && value > 0)
  );
}

function normalizePalettePins(rawValue) {
  if (!Array.isArray(rawValue)) return [];
  return rawValue.filter((item) => typeof item === "string");
}

function normalizeLandingListPrefs(rawValue) {
  const source = rawValue && typeof rawValue === "object" ? rawValue : {};
  return {
    query: typeof source.query === "string" ? source.query : "",
    typeFilter: source.typeFilter === "notes" || source.typeFilter === "folders" ? source.typeFilter : "all",
    sortBy: ["updated-desc", "updated-asc", "title-asc", "title-desc"].includes(source.sortBy)
      ? source.sortBy
      : "updated-desc",
  };
}

function normalizeNotesViewMode(rawValue) {
  return rawValue === "table" ? "table" : "tile";
}

function normalizeEditorMode(rawValue) {
  return ["edit", "split", "preview"].includes(rawValue) ? rawValue : "edit";
}

function normalizeDensityMode(rawValue) {
  return rawValue === "compact" ? "compact" : "comfortable";
}

function normalizeFavoriteNotes(rawValue) {
  if (!Array.isArray(rawValue)) return [];
  return rawValue.filter((item) => typeof item === "string");
}

function normalizeOutlineEnabled(rawValue) {
  return rawValue !== false;
}
function normalizeFocusModeEnabled(rawValue) {
  return rawValue === true;
}

function normalizeTerminalOpen(rawValue) {
  return rawValue === true;
}

function normalizeTerminalShell(rawValue) {
  return rawValue === "bash" || rawValue === "cmd" ? rawValue : "auto";
}

function normalizeScreenCaptureMode(rawValue) {
  return rawValue === "review" ? "review" : "auto";
}

function normalizeTypoCheckEnabled(rawValue) {
  return rawValue !== false;
}

function normalizePathLikeValue(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    for (const key of ["filePath", "rootPath", "path", "label", "name", "title"]) {
      if (typeof value[key] === "string" && value[key].trim()) {
        return value[key].trim();
      }
    }
  }

  return "";
}

function normalizePathLikeList(entries) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const normalized = [];

  for (const entry of entries) {
    const value = normalizePathLikeValue(entry);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

function parseTagField(value) {
  return String(value || "")
    .split(/[,#]/)
    .map((tag) => tag.trim().replace(/^#+/, ""))
    .filter(Boolean);
}

const DEFAULT_LANDING_LIST_PREFS = { query: "", typeFilter: "all", sortBy: "updated-desc" };
const EMPTY_OBJECT = {};
const EMPTY_ARRAY = [];

export default function App() {
  const { toasts, notify } = useToast();
  const [landingAssetsOpen, setLandingAssetsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [workspaceGraphOpen, setWorkspaceGraphOpen] = useState(false);
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [_appInfoLoading, setAppInfoLoading] = useState(true);
  const [_helpDocsLoading, setHelpDocsLoading] = useState(false);
  const bootReadyNotifiedRef = useRef(false);
  const [appInfo, setAppInfo] = useState({
    appName: "Notely",
    version: "0.0.0",
    versionCore: "0.0.0",
    commitHash: "",
  });
  const [helpDocuments, setHelpDocuments] = useState([]);
  const [gitWorkspaceMeta, setGitWorkspaceMeta] = useState({
    workspaceRoot: "",
    isGitRoot: false,
    branch: "",
    autoIgnoreMetadataInGit: true,
    gitignoreHasNotesApp: false,
  });

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
    recentWorkspacesDialogOpen,
    setRecentWorkspacesDialogOpen,
    notesFolderPath,
    recentWorkspacePaths,
    savingNotesFolder,
    documentMenuAction,
    setDocumentMenuAction,
    landingFolderPath,
    lastSavedDocuments,
    lastSavedDocument,
    dirty,
    loadDocumentsData,
    openDocument,
    saveDocument,
    handleReloadCurrentFromDisk,
    handleDeleteCurrentDocument,
    handleDeleteCurrentFolder,
    handleRemoveListEntry,
    handleCreateNote,
    handleCreateFolder,
    handleOpenWorkspacePicker,
    handleOpenRecentWorkspace,
    handleGoHome,
    handleOpenCurrentInEditor,
    handleOpenWebsiteFromLanding,
    handleOpenWebsiteForCurrent,
    handleRenameCurrentDocument,
    handleRenameFromTopbar,
    handleOpenListItem,
    handleOpenReferencedDocument,
    handleLandingNavigateTo,
  } = useDocumentManager({ notify });

  const workspaceStorageScope = useMemo(() => {
    const rawWorkspaceId = activeProject?.slug || activeProject?.rootPath || notesFolderPath || "default";
    return encodeURIComponent(String(rawWorkspaceId));
  }, [activeProject, notesFolderPath]);

  const [landingListPreferences, setLandingListPreferences] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:landing-list-preferences",
    defaultValue: DEFAULT_LANDING_LIST_PREFS,
    normalize: normalizeLandingListPrefs,
  });
  const landingListQuery = landingListPreferences.query;
  const landingEntryFilter = landingListPreferences.typeFilter;
  const landingSortMode = landingListPreferences.sortBy;

  function setLandingListQuery(nextValue) {
    setLandingListPreferences((currentValue) => ({
      ...normalizeLandingListPrefs(currentValue),
      query: String(nextValue || ""),
    }));
  }

  function setLandingEntryFilter(nextValue) {
    setLandingListPreferences((currentValue) => ({
      ...normalizeLandingListPrefs(currentValue),
      typeFilter: nextValue === "notes" || nextValue === "folders" ? nextValue : "all",
    }));
  }

  function setLandingSortMode(nextValue) {
    setLandingListPreferences((currentValue) => ({
      ...normalizeLandingListPrefs(currentValue),
      sortBy: ["updated-desc", "updated-asc", "title-asc", "title-desc"].includes(nextValue)
        ? nextValue
        : "updated-desc",
    }));
  }

  const [paletteCommandUsage, setPaletteCommandUsage] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:palette-command-usage",
    defaultValue: EMPTY_OBJECT,
    normalize: normalizePaletteUsageMap,
    fallbackKey: "notes:palette-command-usage",
  });
  const [palettePinnedCommandKeys, setPalettePinnedCommandKeys] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:palette-pinned-commands",
    defaultValue: EMPTY_ARRAY,
    normalize: normalizePalettePins,
    fallbackKey: "notes:palette-pinned-commands",
  });
  const [outlineEnabled, setOutlineEnabled] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:outline-enabled",
    defaultValue: true,
    normalize: normalizeOutlineEnabled,
  });
  const [focusModeEnabled, setFocusModeEnabled] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:focus-mode-enabled",
    defaultValue: false,
    normalize: normalizeFocusModeEnabled,
  });
  const [notesViewMode, setNotesViewMode] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:view-mode",
    defaultValue: "tile",
    normalize: normalizeNotesViewMode,
    fallbackKey: "notes:view-mode",
  });
  const [mode, setMode] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:editor-mode",
    defaultValue: "edit",
    normalize: normalizeEditorMode,
    fallbackKey: "notes:editor-mode",
  });
  const [notesDensityMode, setNotesDensityMode] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:density-mode",
    defaultValue: "comfortable",
    normalize: normalizeDensityMode,
    fallbackKey: "notes:density-mode",
  });
  const [favoriteNotes, setFavoriteNotes] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:favorites",
    defaultValue: EMPTY_ARRAY,
    normalize: normalizeFavoriteNotes,
    fallbackKey: "notes:favorites",
  });
  const [showTerminal, setShowTerminal] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:terminal-open",
    defaultValue: false,
    normalize: normalizeTerminalOpen,
  });
  const [terminalShellPreference, setTerminalShellPreference] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:terminal-shell",
    defaultValue: "auto",
    normalize: normalizeTerminalShell,
    fallbackKey: "notely:terminal-shell",
  });
  const [screenCaptureMode, setScreenCaptureMode] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:screen-capture-mode",
    defaultValue: "auto",
    normalize: normalizeScreenCaptureMode,
  });
  const [typoCheckEnabled, setTypoCheckEnabled] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:typo-check-enabled",
    defaultValue: true,
    normalize: normalizeTypoCheckEnabled,
  });

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

  async function refreshGitWorkspaceMeta() {
    try {
      const meta = await getGitWorkspaceMetadata();
      setGitWorkspaceMeta({
        workspaceRoot: String(meta?.workspaceRoot || ""),
        isGitRoot: meta?.isGitRoot === true,
        branch: String(meta?.branch || ""),
        autoIgnoreMetadataInGit: meta?.autoIgnoreMetadataInGit !== false,
        gitignoreHasNotesApp: meta?.gitignoreHasNotesApp === true,
      });
    } catch {
      setGitWorkspaceMeta((currentValue) => ({
        ...currentValue,
        isGitRoot: false,
      }));
    }
  }

  async function handleToggleAutoIgnoreGitMetadata() {
    try {
      const nextMeta = await setAutoIgnoreGitMetadata(!(gitWorkspaceMeta.autoIgnoreMetadataInGit !== false));
      setGitWorkspaceMeta({
        workspaceRoot: String(nextMeta?.workspaceRoot || ""),
        isGitRoot: nextMeta?.isGitRoot === true,
        branch: String(nextMeta?.branch || ""),
        autoIgnoreMetadataInGit: nextMeta?.autoIgnoreMetadataInGit !== false,
        gitignoreHasNotesApp: nextMeta?.gitignoreHasNotesApp === true,
      });
      if (nextMeta?.isGitRoot) {
        notify(`Auto-ignore .notes-app in git is now ${nextMeta?.autoIgnoreMetadataInGit === false ? "off" : "on"}.`, "success");
      } else {
        notify(`Auto-ignore preference set to ${nextMeta?.autoIgnoreMetadataInGit === false ? "off" : "on"}. It will apply when workspace is a Git root.`, "info");
      }
    } catch (error) {
      notify(error?.message || "Unable to update git metadata settings.", "error");
    }
  }

  useEffect(() => {
    void refreshGitWorkspaceMeta();
    // notesFolderPath updates when notes root changes.
  }, [notesFolderPath]);

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
    void getAppInfo()
      .then((info) => {
        setAppInfo({
          appName: String(info?.appName || "Notely"),
          version: String(info?.version || "0.0.0"),
          versionCore: String(info?.versionCore || "0.0.0"),
          commitHash: String(info?.commitHash || ""),
        });
      })
      .catch(() => {
        // Ignore app-info failures in renderer and keep fallback values.
      })
      .finally(() => {
        setAppInfoLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!helpCenterOpen) return;
    if (helpDocuments.length > 0) return;

    setHelpDocsLoading(true);
    void getHelpDocuments()
      .then((docs) => {
        setHelpDocuments(Array.isArray(docs) ? docs : []);
      })
      .catch(() => {
        setHelpDocuments([]);
      })
      .finally(() => {
        setHelpDocsLoading(false);
      });
  }, [helpCenterOpen, helpDocuments.length]);

  const bootProgress = useMemo(() => {
    return loading ? 25 : 100;
  }, [loading]);

  const bootPhase = loading
    ? "Loading workspace"
    : "Launching application";

  useEffect(() => {
    notifyBootProgress({ phase: bootPhase, percent: bootProgress });
  }, [bootPhase, bootProgress]);

  useEffect(() => {
    if (bootProgress < 100) return;
    if (bootReadyNotifiedRef.current) return;
    bootReadyNotifiedRef.current = true;
    notifyBootProgress({ phase: "Ready", percent: 100 });
    notifyBootReady();
  }, [bootProgress]);

  useEffect(() => {
    const rootPath = normalizePathLikeValue(activeProject?.rootPath || notesFolderPath).replace(/[\\/]+$/, "");
    const currentPath = normalizePathLikeValue(landingFolderPath || rootPath).replace(/[\\/]+$/, "");
    const canRemoveFolder = Boolean(rootPath && currentPath && rootPath.toLowerCase() !== currentPath.toLowerCase());

    updateMenuContext({
      screen: current ? "document" : "landing",
      viewMode: notesViewMode,
      densityMode: notesDensityMode,
      typoCheckEnabled,
      screenCaptureMode,
      dirty,
      terminalOpen: showTerminal,
      terminalShell: terminalShellPreference,
      outlineEnabled,
      splitPreviewEnabled: current ? mode === "split" : false,
      focusModeEnabled: current ? focusModeEnabled : false,
      canRemoveFolder,
      currentFolderLabel: currentPath ? currentPath.replace(/^.*[\\/]/, "") : "",
      recentWorkspacePaths: normalizePathLikeList(recentWorkspacePaths),
    });
  }, [current, notesViewMode, notesDensityMode, typoCheckEnabled, screenCaptureMode, dirty, activeProject, notesFolderPath, landingFolderPath, showTerminal, terminalShellPreference, outlineEnabled, mode, focusModeEnabled, recentWorkspacePaths]);

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

      if (action === "open-workspace") {
        void handleOpenWorkspacePicker();
        return;
      }

      if (action === "open-recent-workspaces") {
        setRecentWorkspacesDialogOpen(true);
        return;
      }

      if (action.startsWith("open-recent-workspace:")) {
        const encodedPath = String(action).slice("open-recent-workspace:".length);
        const workspacePath = decodeURIComponent(encodedPath || "");
        void handleOpenRecentWorkspace(workspacePath);
        return;
      }

      if (action === "open-command-palette") {
        setGlobalSearchOpen(false);
        setShortcutsModalOpen(false);
        setCommandPaletteOpen(true);
        return;
      }

      if (action === "open-help-center" || action === "open-about") {
        if (action === "open-about") {
          setAboutOpen(true);
        } else {
          setHelpCenterOpen(true);
        }
        return;
      }

      if (action === "open-shortcuts") {
        setGlobalSearchOpen(false);
        setCommandPaletteOpen(false);
        setShortcutsModalOpen(true);
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

      if (action === "open-workspace-graph") {
        setWorkspaceGraphOpen(true);
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

      if (action === "toggle-terminal") {
        setShowTerminal((open) => !open);
        return;
      }

      if (action === "terminal-shell-auto") {
        setTerminalShellPreference("auto");
        return;
      }

      if (action === "terminal-shell-bash") {
        setTerminalShellPreference("bash");
        return;
      }

      if (action === "terminal-shell-cmd") {
        setTerminalShellPreference("cmd");
        return;
      }

      if (action === "settings-screen-capture-auto") {
        setScreenCaptureMode("auto");
        notify("Screen capture mode set to Auto insert.", "info");
        return;
      }

      if (action === "settings-screen-capture-review") {
        setScreenCaptureMode("review");
        notify("Screen capture mode set to Review before insert.", "info");
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

      if (action === "toggle-typo-check") {
        setTypoCheckEnabled((enabled) => !enabled);
        return;
      }

      if (action === "toggle-outline" || action === "toggle-outline-enabled" || action === "toggle-split-preview" || action === "toggle-focus-mode") {
        if (current) {
          setDocumentMenuAction({
            action: action === "toggle-outline" ? "toggle-outline-enabled" : action,
            nonce: Date.now(),
          });
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

      if (action === "remove-folder") {
        handleDeleteCurrentFolder();
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
  }, [current, dirty, activeProject, activeTab, landingFolderPath]);

  const folderCount = documents.filter((entry) => entry.entryType === "folder").length;
  const noteCount = documents.length - folderCount;
  const visibleDocuments = applyDocumentListQuery(documents, {
    query: landingListQuery,
    typeFilter: landingEntryFilter,
    sortBy: landingSortMode,
  });
  const workspaceTagSuggestions = useMemo(() => {
    const pool = new Set();
    for (const entry of documents) {
      if (entry?.entryType !== "file") continue;
      const tagsValue = entry?.metadata?.tags || entry?.metadata?.Tags;
      for (const tag of parseTagField(tagsValue)) {
        const key = tag.toLowerCase();
        if (!key) continue;
        if (!pool.has(key)) pool.add(tag);
      }
    }
    return [...pool].sort((left, right) => left.localeCompare(right));
  }, [documents]);
  const paletteRootPath = activeProject?.rootPath || notesFolderPath || "";
  const normalizedPaletteRootPath = String(paletteRootPath || "").replace(/[\\/]+$/, "");
  const currentNoteParentPath = current?.filePath
    ? String(current.filePath).replace(/[\\/][^\\/]+$/, "").replace(/[\\/]+$/, "")
    : "";
  const currentNoteParentComparable = currentNoteParentPath.replace(/\\/g, "/").toLowerCase();
  const rootComparable = normalizedPaletteRootPath.replace(/\\/g, "/").toLowerCase();
  const canOpenCurrentNoteParent = Boolean(
    current && currentNoteParentPath
      && (!rootComparable || currentNoteParentComparable === rootComparable || currentNoteParentComparable.startsWith(`${rootComparable}/`))
  );
  const siblingPaletteNotes = current
    ? documents
      .filter((entry) => entry.entryType === "file" && entry.filePath !== current.filePath)
      .sort((left, right) => {
        const leftTime = new Date(left.updatedAt || 0).getTime();
        const rightTime = new Date(right.updatedAt || 0).getTime();
        return rightTime - leftTime;
      })
      .slice(0, 8)
    : [];
  const siblingPaletteNotePaths = new Set(siblingPaletteNotes.map((entry) => entry.filePath));
  const recentPaletteNotes = [...documents]
    .filter((entry) => {
      if (entry.entryType !== "file") return false;
      if (current?.filePath && entry.filePath === current.filePath) return false;
      return !siblingPaletteNotePaths.has(entry.filePath);
    })
    .sort((left, right) => {
      const leftTime = new Date(left.updatedAt || 0).getTime();
      const rightTime = new Date(right.updatedAt || 0).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 8);

  const hasPaletteUsage = Object.keys(paletteCommandUsage).length > 0;
  const palettePinnedCommandSet = new Set(palettePinnedCommandKeys);
  const hasPinnedCommands = palettePinnedCommandSet.size > 0;
  function getPaletteUsageCount(commandId) {
    const usageKey = getPaletteUsageKey(commandId);
    return Number(paletteCommandUsage[usageKey] || 0);
  }

  const paletteCommandsBase = [
    { id: "new-note", label: "Create New Note", group: "Notes", shortcut: "Ctrl/Cmd+N", aliases: "add note new document" },
    { id: "open-help-center", label: "Open Help Center", group: "Help", shortcut: "F1", aliases: "help docs guide manual about" },
    { id: "open-about", label: "Open About Notely", group: "Help", aliases: "about version build" },
    { id: "new-folder", label: "Create New Folder", group: "Notes", aliases: "add folder create directory" },
    { id: "open-global-search", label: "Open Global Search", group: "Search", shortcut: "Ctrl/Cmd+Shift+F", aliases: "find everywhere search all notes" },
    { id: "open-shortcuts", label: "Open Keyboard Shortcuts", group: "Help", shortcut: "Ctrl/Cmd+/", aliases: "hotkeys keymap shortcuts" },
    { id: "open-workspace", label: "Open Workspace", group: "Workspace", shortcut: "Ctrl/Cmd+Shift+N", aliases: "open workspace folder notes root path" },
    {
      id: "open-recent-workspaces",
      label: "Open Recent Workspace",
      group: "Workspace",
      disabled: recentWorkspacePaths.length === 0,
      aliases: "recent workspaces recently opened folders",
    },
    { id: "open-assets", label: "Open Assets Library", group: "Workspace", aliases: "media images assets" },
    { id: "open-workspace-activity", label: "Open Workspace Activity", group: "Sync", aliases: "activity timeline sync events" },
    { id: "open-p2p-status", label: "Open P2P Status", group: "Sync", aliases: "peer status p2p" },
    { id: "open-ai-settings", label: "Open AI Settings", group: "AI", aliases: "llm ai config" },
    { id: "toggle-terminal", label: showTerminal ? "Hide Terminal" : "Show Terminal", group: "View", aliases: "console shell" },
    {
      id: "toggle-view-mode",
      label: notesViewMode === "tile" ? "Switch to Table View" : "Switch to Tile View",
      group: "View",
      aliases: "toggle list layout",
    },
    {
      id: "set-view-tile",
      label: "Use Tile View",
      group: "View",
      disabled: notesViewMode === "tile",
      aliases: "grid cards",
    },
    {
      id: "set-view-table",
      label: "Use Table View",
      group: "View",
      disabled: notesViewMode === "table",
      aliases: "rows list table",
    },
    {
      id: "set-density-comfortable",
      label: "Use Comfortable Density",
      group: "View",
      disabled: notesDensityMode === "comfortable",
      aliases: "spacious cozy",
    },
    {
      id: "set-density-compact",
      label: "Use Compact Density",
      group: "View",
      disabled: notesDensityMode === "compact",
      aliases: "tight dense",
    },
    {
      id: "find-in-note",
      label: "Find in Current Note",
      group: "Editor",
      shortcut: "Ctrl/Cmd+F",
      disabled: !current,
      aliases: "search in note replace",
    },
    {
      id: "open-reference-note",
      label: "Open Reference Note",
      group: "Editor",
      shortcut: "Ctrl/Cmd+Shift+K",
      disabled: !current,
      aliases: "reference note preview linked note",
    },
    {
      id: "insert-reference-link",
      label: "Insert Reference Link",
      group: "Editor",
      shortcut: "Ctrl/Cmd+Shift+L",
      disabled: !current,
      aliases: "insert markdown link note reference",
    },
    {
      id: "open-current-note-parent-folder",
      label: "Open Parent Folder (Current Note)",
      group: "Navigation",
      disabled: !canOpenCurrentNoteParent,
      aliases: "go parent folder",
    },
    {
      id: "reveal-current-note-in-list",
      label: "Reveal Current Note in List",
      group: "Navigation",
      disabled: !canOpenCurrentNoteParent,
      aliases: "show current note in folder",
    },
    ...siblingPaletteNotes.map((note) => ({
      id: `open-sibling-note:${encodeURIComponent(note.filePath)}`,
      label: `Open: ${note.title}`,
      group: "Current Folder",
      keywords: `${note.title} ${note.filePath || ""}`,
      priority: 10,
    })),
    ...recentPaletteNotes.map((note) => ({
      id: `open-note:${encodeURIComponent(note.filePath)}`,
      label: `Open: ${note.title}`,
      group: "Recent",
      keywords: `${note.title} ${note.filePath || ""}`,
      priority: 30,
    })),
    {
      id: "clear-command-usage",
      label: "Clear Command Usage History",
      group: "Help",
      disabled: !hasPaletteUsage,
      priority: 200,
      aliases: "reset command history usage",
    },
    {
      id: "clear-pinned-commands",
      label: "Clear Pinned Commands",
      group: "Help",
      disabled: !hasPinnedCommands,
      priority: 200,
      aliases: "reset pinned commands",
    },
    {
      id: "reset-palette-personalization",
      label: "Reset Command Palette Personalization",
      group: "Help",
      disabled: !hasPaletteUsage && !hasPinnedCommands,
      priority: 220,
      aliases: "reset command palette personalization frequent pinned",
    },
  ];

  const paletteCommandsWithUsage = paletteCommandsBase.map((command) => {
    const resolvedId = resolvePaletteCommandId(command.id);
    return {
      ...command,
      pinKey: resolvedId,
      usageBoost: getPaletteUsageCount(command.id),
    };
  });

  const frequentPaletteCommands = Object.entries(paletteCommandUsage)
    .filter(([id, count]) => id && Number.isFinite(count) && count > 1)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([id, count]) => {
      const source = paletteCommandsWithUsage.find((command) => command.id === id && !command.disabled);
      if (!source) return null;
      return {
        ...source,
        id: `frequent:${source.id}`,
        group: "Frequent",
        keywords: `${source.keywords || ""} ${source.group || ""} popular often used`,
        aliases: `${source.aliases || ""} frequent popular`,
        priority: -5,
        usageBoost: Math.min(count, 20),
      };
    })
    .filter(Boolean);

  const pinnedPaletteCommands = paletteCommandsWithUsage
    .filter((command) => palettePinnedCommandSet.has(command.pinKey) && !command.disabled)
    .slice(0, 12)
    .map((command) => ({
      ...command,
      id: `pinned:${command.id}`,
      group: "Pinned",
      priority: -15,
      aliases: `${command.aliases || ""} pinned`,
      usageBoost: Math.max(command.usageBoost || 0, 2),
    }));

  const paletteCommands = [
    ...pinnedPaletteCommands,
    ...frequentPaletteCommands,
    ...paletteCommandsWithUsage.filter((command) => !palettePinnedCommandSet.has(command.pinKey)),
  ];

  function handleTogglePinnedPaletteCommand(commandId) {
    const resolvedId = resolvePaletteCommandId(commandId);
    if (!resolvedId || resolvedId === "clear-command-usage" || resolvedId === "clear-pinned-commands") {
      return;
    }
    const currentlyPinned = palettePinnedCommandSet.has(resolvedId);
    setPalettePinnedCommandKeys((currentPinned) => {
      if (currentPinned.includes(resolvedId)) {
        return currentPinned.filter((item) => item !== resolvedId);
      }
      return [...currentPinned, resolvedId];
    });
    notify(currentlyPinned ? "Command unpinned." : "Command pinned.", "success");
  }

  async function handleRunPaletteCommand(commandId) {
    setCommandPaletteOpen(false);

    const resolvedCommandId = resolvePaletteCommandId(commandId);

    if (
      resolvedCommandId
      && resolvedCommandId !== "clear-command-usage"
      && resolvedCommandId !== "clear-pinned-commands"
      && resolvedCommandId !== "reset-palette-personalization"
    ) {
      const usageKey = getPaletteUsageKey(resolvedCommandId);
      setPaletteCommandUsage((currentUsage) => ({
        ...currentUsage,
        [usageKey]: Number(currentUsage[usageKey] || 0) + 1,
      }));
    }

    if (resolvedCommandId === "clear-command-usage") {
      setPaletteCommandUsage({});
      notify("Command usage history cleared.", "success");
      return;
    }

    if (resolvedCommandId === "clear-pinned-commands") {
      setPalettePinnedCommandKeys([]);
      notify("Pinned commands cleared.", "success");
      return;
    }

    if (resolvedCommandId === "reset-palette-personalization") {
      setPaletteCommandUsage({});
      setPalettePinnedCommandKeys([]);
      notify("Command palette personalization reset.", "success");
      return;
    }

    if (resolvedCommandId.startsWith("open-note:")) {
      const encodedPath = String(resolvedCommandId).slice("open-note:".length);
      const filePath = decodeURIComponent(encodedPath || "");
      const target = documents.find((entry) => entry.filePath === filePath && entry.entryType === "file");
      if (!target) {
        notify("That note is no longer available in this view.", "warning");
        return;
      }
      await handleOpenListItem(target);
      return;
    }

    if (resolvedCommandId.startsWith("open-sibling-note:")) {
      const encodedPath = String(resolvedCommandId).slice("open-sibling-note:".length);
      const filePath = decodeURIComponent(encodedPath || "");
      const target = documents.find((entry) => entry.filePath === filePath && entry.entryType === "file");
      if (!target) {
        notify("That sibling note is no longer available in this folder.", "warning");
        return;
      }
      await handleOpenListItem(target);
      return;
    }

    if (resolvedCommandId === "new-note") {
      setNoteDialogOpen(true);
      return;
    }

    if (resolvedCommandId === "open-help-center") {
      setHelpCenterOpen(true);
      return;
    }

    if (resolvedCommandId === "open-reference-note") {
      if (!current) {
        notify("Open a note first to reference another note.", "info");
        return;
      }
      window.dispatchEvent(new CustomEvent("notely:open-reference-note-picker"));
      return;
    }

    if (resolvedCommandId === "insert-reference-link") {
      if (!current) {
        notify("Open a note first to insert a reference link.", "info");
        return;
      }
      window.dispatchEvent(new CustomEvent("notely:insert-reference-link-picker"));
      return;
    }

    if (resolvedCommandId === "open-about") {
      setAboutOpen(true);
      return;
    }

    if (resolvedCommandId === "new-folder") {
      setFolderDialogOpen(true);
      return;
    }

    if (resolvedCommandId === "open-workspace") {
      await handleOpenWorkspacePicker();
      return;
    }

    if (resolvedCommandId === "open-recent-workspaces") {
      setRecentWorkspacesDialogOpen(true);
      return;
    }

    if (resolvedCommandId === "open-global-search") {
      setGlobalSearchOpen(true);
      return;
    }

    if (resolvedCommandId === "open-shortcuts") {
      setShortcutsModalOpen(true);
      return;
    }

    if (resolvedCommandId === "open-assets") {
      setLandingAssetsOpen(true);
      return;
    }

    if (resolvedCommandId === "open-workspace-activity") {
      await handleOpenWorkspaceActivity();
      return;
    }

    if (resolvedCommandId === "open-p2p-status") {
      await handleOpenP2PStatus();
      return;
    }

    if (resolvedCommandId === "open-ai-settings") {
      setAiSettingsOpen(true);
      return;
    }

    if (resolvedCommandId === "toggle-terminal") {
      setShowTerminal((open) => !open);
      return;
    }

    if (resolvedCommandId === "toggle-view-mode") {
      setNotesViewMode((value) => (value === "tile" ? "table" : "tile"));
      return;
    }

    if (resolvedCommandId === "set-view-tile") {
      setNotesViewMode("tile");
      return;
    }

    if (resolvedCommandId === "set-view-table") {
      setNotesViewMode("table");
      return;
    }

    if (resolvedCommandId === "set-density-comfortable") {
      setNotesDensityMode("comfortable");
      return;
    }

    if (resolvedCommandId === "set-density-compact") {
      setNotesDensityMode("compact");
      return;
    }

    if (resolvedCommandId === "find-in-note") {
      if (!current) {
        notify("Open a note to search within it.", "info");
        return;
      }
      setDocumentMenuAction({ action: "find-replace", nonce: Date.now() });
      return;
    }

    if (resolvedCommandId === "open-current-note-parent-folder") {
      if (!canOpenCurrentNoteParent) {
        notify("Current note is outside the active workspace path.", "info");
        return;
      }
      const canLeaveCurrent = handleGoHome();
      if (!canLeaveCurrent) return;
      await handleLandingNavigateTo(currentNoteParentPath);
      return;
    }

    if (resolvedCommandId === "reveal-current-note-in-list") {
      if (!canOpenCurrentNoteParent) {
        notify("Current note is outside the active workspace path.", "info");
        return;
      }
      const canLeaveCurrent = handleGoHome();
      if (!canLeaveCurrent) return;
      await handleLandingNavigateTo(currentNoteParentPath);
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

  const landingTitle = breadcrumbSegments.length
    ? breadcrumbSegments[breadcrumbSegments.length - 1].label
    : (activeProject?.isRoot ? "Workspace" : (activeProject?.name || "Project"));

  const trackedSavedNotes = useMemo(() => {
    const list = Array.isArray(lastSavedDocuments) && lastSavedDocuments.length
      ? lastSavedDocuments
      : (lastSavedDocument ? [lastSavedDocument] : []);
    if (!list.length) return [];

    const byPath = new Map(
      documents
        .filter((item) => item?.entryType === "file" && item?.filePath)
        .map((item) => [String(item.filePath).toLowerCase(), item])
    );

    return list
      .map((item) => {
        const key = String(item?.filePath || "").toLowerCase();
        const fromDocuments = byPath.get(key);
        if (fromDocuments) {
          return {
            ...item,
            title: fromDocuments.title || item.title,
            updatedAt: fromDocuments.updatedAt || item.updatedAt,
          };
        }
        return item?.filePath ? item : null;
      })
      .filter(Boolean)
      .slice(0, 4);
  }, [lastSavedDocuments, lastSavedDocument, documents]);

  return (
    <div className={`app-shell${showTerminal ? " terminal-open" : ""}${current ? " document-screen" : " landing-screen"}`}>
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
            <span className={`terminal-meta-pill ${gitWorkspaceMeta.isGitRoot ? "" : "warn"}`} title={gitWorkspaceMeta.isGitRoot ? "Workspace Git branch" : "Workspace is not a Git root"}>
              {gitWorkspaceMeta.isGitRoot ? `Git: ${gitWorkspaceMeta.branch || "(unknown)"}` : "Git: not root"}
            </span>
            <span className={`terminal-meta-pill ${gitWorkspaceMeta.isGitRoot && !gitWorkspaceMeta.gitignoreHasNotesApp ? "warn" : ""}`} title=".notes-app gitignore status">
              {gitWorkspaceMeta.isGitRoot
                ? (gitWorkspaceMeta.gitignoreHasNotesApp ? ".notes-app ignored" : ".notes-app tracked")
                : ".notes-app n/a"}
            </span>
            <button
              className={`terminal-meta-pill terminal-meta-toggle ${gitWorkspaceMeta.autoIgnoreMetadataInGit ? "active" : ""}`}
              type="button"
              title="Toggle auto-ignore of .notes-app in workspace .gitignore"
              onClick={() => {
                void handleToggleAutoIgnoreGitMetadata();
              }}
            >
              {gitWorkspaceMeta.autoIgnoreMetadataInGit ? "Ignore .notes-app: On" : "Ignore .notes-app: Off"}
            </button>
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
              <div className="landing-title-row">
                <h1>{landingTitle}</h1>
                <div className="landing-stats" aria-label="Current folder metrics">
                  <span><em>Folders</em><strong>{folderCount}</strong></span>
                  <span><em>Notes</em><strong>{noteCount}</strong></span>
                </div>
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
                  continueNotes={trackedSavedNotes}
                  favorites={favoriteNotes}
                  layout="rail"
                />
              </aside>
              <div className="landing-notes-pane">
                <LandingListControls
                  query={landingListQuery}
                  onQueryChange={setLandingListQuery}
                  typeFilter={landingEntryFilter}
                  onTypeFilterChange={setLandingEntryFilter}
                  sortBy={landingSortMode}
                  onSortByChange={setLandingSortMode}
                  visibleCount={visibleDocuments.length}
                  totalCount={documents.length}
                  onCreateNote={() => handleDashboardAction("new-note")}
                />
                <DocumentList
                  documents={visibleDocuments}
                  onOpen={handleOpenListItem}
                  onRemove={handleRemoveListEntry}
                  loading={loading}
                  viewMode={notesViewMode}
                  density={notesDensityMode}
                  favorites={favoriteNotes}
                  onToggleFavorite={handleToggleFavorite}
                  emptyMessage="No notes or folders match your current filters."
                />
              </div>
            </div>
          ) : (
            <div className="landing-notes-pane standalone">
              <LandingListControls
                query={landingListQuery}
                onQueryChange={setLandingListQuery}
                typeFilter={landingEntryFilter}
                onTypeFilterChange={setLandingEntryFilter}
                sortBy={landingSortMode}
                onSortByChange={setLandingSortMode}
                visibleCount={visibleDocuments.length}
                totalCount={documents.length}
                onCreateNote={() => handleDashboardAction("new-note")}
              />
              <DocumentList
                documents={visibleDocuments}
                onOpen={handleOpenListItem}
                onRemove={handleRemoveListEntry}
                loading={loading}
                viewMode={notesViewMode}
                density={notesDensityMode}
                favorites={favoriteNotes}
                onToggleFavorite={handleToggleFavorite}
                emptyMessage="No notes or folders match your current filters."
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
            onRenameTitle={handleRenameCurrentDocument}
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
            workspaceTagSuggestions={workspaceTagSuggestions}
            workspaceStorageScope={workspaceStorageScope}
            typoCheckEnabled={typoCheckEnabled}
            screenCaptureMode={screenCaptureMode}
            outlineEnabled={outlineEnabled}
            onOutlineEnabledChange={setOutlineEnabled}
            focusModeEnabled={focusModeEnabled}
            onFocusModeChange={setFocusModeEnabled}
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
              <EmbeddedTerminal
                cwd={terminalCwd}
                shellPreference={terminalShellPreference}
                onShellPreferenceChange={setTerminalShellPreference}
                onClose={() => setShowTerminal(false)}
              />
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

      {recentWorkspacesDialogOpen ? (
        <div className="overlay-dialog" role="dialog" aria-modal="true" aria-label="Open recent workspace">
          <div className="overlay-dialog-card">
            <div className="overlay-dialog-header">
              <h2>Open Recent Workspace</h2>
              <button
                className="icon-button"
                onClick={() => setRecentWorkspacesDialogOpen(false)}
                type="button"
                aria-label="Close recent workspaces dialog"
              >
                <X size={16} />
              </button>
            </div>
            {recentWorkspacePaths.length ? (
              <div className="overlay-dialog-recents" aria-label="Recent workspaces">
                <span>Recent Workspaces</span>
                <div className="overlay-dialog-recent-list">
                  {recentWorkspacePaths.map((workspacePath) => (
                    <button
                      key={workspacePath}
                      className="overlay-dialog-recent-button"
                      onClick={() => handleOpenRecentWorkspace(workspacePath)}
                      disabled={savingNotesFolder}
                      title={workspacePath}
                      type="button"
                    >
                      {workspacePath}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="overlay-dialog-empty">No recent workspaces yet.</p>
            )}
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

      {commandPaletteOpen ? (
        <Suspense fallback={<div className="lazy-loading">Loading commands…</div>}>
          <CommandPalette
            isOpen={commandPaletteOpen}
            commands={paletteCommands.filter((command) => !command.disabled)}
            pinnedCommandKeys={palettePinnedCommandKeys}
            onClose={() => setCommandPaletteOpen(false)}
            onRun={handleRunPaletteCommand}
            onTogglePinCommand={handleTogglePinnedPaletteCommand}
          />
        </Suspense>
      ) : null}

      {globalSearchOpen ? (
        <Suspense fallback={<div className="lazy-loading">Loading search…</div>}>
          <GlobalSearchOverlay
            isOpen={globalSearchOpen}
            documents={documents}
            currentDocument={current}
            onClose={() => setGlobalSearchOpen(false)}
            workspaceStorageScope={workspaceStorageScope}
            onOpenResult={handleOpenGlobalSearchResult}
          />
        </Suspense>
      ) : null}

      {shortcutsModalOpen ? (
        <Suspense fallback={<div className="lazy-loading">Loading shortcuts…</div>}>
          <KeyboardShortcutsModal
            isOpen={shortcutsModalOpen}
            onClose={() => setShortcutsModalOpen(false)}
          />
        </Suspense>
      ) : null}

      {workspaceGraphOpen && (
        <Suspense fallback={null}>
          <WorkspaceGraphPanel
            onClose={() => setWorkspaceGraphOpen(false)}
            onOpenDocument={async (filePath) => {
              setWorkspaceGraphOpen(false);
              const target = documents.find((d) => d.filePath === filePath && d.entryType === "file");
              if (target) await handleOpenListItem(target);
            }}
          />
        </Suspense>
      )}

      {helpCenterOpen ? (
        <Suspense fallback={<div className="lazy-loading">Loading help center…</div>}>
          <HelpCenterModal
            open={helpCenterOpen}
            onClose={() => setHelpCenterOpen(false)}
            appInfo={appInfo}
            documents={helpDocuments}
          />
        </Suspense>
      ) : null}

      {aboutOpen ? (
        <Suspense fallback={<div className="lazy-loading">Loading about…</div>}>
          <AboutModal
            open={aboutOpen}
            onClose={() => setAboutOpen(false)}
            appInfo={appInfo}
          />
        </Suspense>
      ) : null}

    </div>
  );
}
