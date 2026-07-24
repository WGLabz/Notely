import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotebookPen, Terminal, X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OverlayDialog } from "./components/OverlayDialog";
import GlobalTooltip from "./components/GlobalTooltip";
import { applyDocumentListQuery } from "./utils/documentListQuery";

// Heavy / rarely-used surfaces are code-split so they don't bloat startup.
const MediaTab = lazy(() =>
  import("./components/MediaTab").then((m) => ({ default: m.MediaTab }))
);
const DocumentDetail = lazy(() =>
  import("./components/DocumentDetail").then((m) => ({ default: m.DocumentDetail }))
);
const WorkspaceActivityPanel = lazy(() =>
  import("./components/WorkspaceActivityPanel").then((m) => ({ default: m.WorkspaceActivityPanel }))
);
const ConflictResolutionPanel = lazy(() =>
  import("./components/ConflictResolutionPanel").then((m) => ({ default: m.ConflictResolutionPanel }))
);
const AIChatPanel = lazy(() => import("./components/AIChatPanel"));
const KnowledgeGraph = lazy(() => import("./components/KnowledgeGraph"));
const EmbeddingsPage = lazy(() => import("./components/EmbeddingsPage"));
const AIPersonasManager = lazy(() => import("./components/AIPersonasManager"));
const AIHealthPage = lazy(() => import("./components/AIHealthPage"));
const AppLogsPage = lazy(() => import("./components/AppLogsPage"));

import { SettingsModal } from "./components/SettingsModal";
import { LandingView } from "./components/layout/LandingView";
import { TitleBar } from "./components/layout/TitleBar";
import { TrashDialog } from "./components/TrashDialog";
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
const GitVersionControlPage = lazy(() =>
  import("./components/GitVersionControlPage").then((m) => ({ default: m.GitVersionControlPage }))
);
const GitCommitDialog = lazy(() =>
  import("./components/GitCommitDialog").then((m) => ({ default: m.GitCommitDialog }))
);
import { GitStatusBar } from "./components/GitStatusBar";
import { AIStatusBar } from "./components/AIStatusBar";
import NotePreviewModal from "./components/NotePreviewModal";

const TasksPanel = lazy(() =>
  import("./components/TasksPanel").then((m) => ({ default: m.TasksPanel }))
);
const AllTasksPanel = lazy(() =>
  import("./components/AllTasksPanel").then((m) => ({ default: m.AllTasksPanel }))
);
const NoteListPanel = lazy(() =>
  import("./components/NoteListPanel").then((m) => ({ default: m.NoteListPanel }))
);
const MarkdownGuideModal = lazy(() =>
  import("./components/MarkdownGuideModal").then((m) => ({ default: m.MarkdownGuideModal }))
);
const AboutModal = lazy(() =>
  import("./components/AboutModal").then((m) => ({ default: m.AboutModal }))
);
const FeedbackModal = lazy(() =>
  import("./components/FeedbackModal").then((m) => ({ default: m.FeedbackModal }))
);
const HelpConfirmationModal = lazy(() =>
  import("./components/HelpConfirmationModal").then((m) => ({ default: m.HelpConfirmationModal }))
);
const WorkspaceExportDialog = lazy(() =>
  import("./components/WorkspaceExportDialog").then((m) => ({ default: m.WorkspaceExportDialog }))
);
const DictionaryModal = lazy(() => import("./components/DictionaryModal"));
const ExportImportModal = lazy(() => import("./components/ExportImportModal"));
import {
  onMenuAction,
  notifyBootReady,
  notifyBootProgress,
  getAppInfo,
  getDashboardCache,
  listWorkspaceTaskDocuments,
  updateMenuContext,
  getGitWorkspaceMetadata,
  setAutoIgnoreGitMetadata,
  getAppearanceSettings,
  setThemePreference as persistThemePreference,
  setZoomFactor as persistZoomFactor,
  onThemeChanged,
  getWorkspaceExportDefaults,
  browseWorkspaceExportDestination,
  exportWorkspaceZip,
  onWorkspaceExportProgress,
  openWorkspaceInEditor,
  revealWorkspaceInExplorer,
  getOnboardingComplete,
  setOnboardingComplete,
  getNotesRootSetting,
  setNotesRootSetting,
  gitGetStatus,
  gitCommit,
  checkForUpdates,
  aiSetPreferences,
  aiSetProviderModel,
} from "./services/electronService";
import UpdateModal from "./components/UpdateModal";
import { useToast } from "./hooks/useToast";
import { useP2PSync } from "./hooks/useP2PSync";
import { useAIAssistant } from "./hooks/useAIAssistant";
import { useDocumentManager } from "./hooks/useDocumentManager";
import { useWorkspaceScopedStorage } from "./hooks/useWorkspaceScopedStorage";
import { OnboardingFlow } from "./components/OnboardingFlow";
import { useUIState } from "./contexts/UIStateContext";
import { setupDemoWorkspace } from "./utils/demoWorkspace";

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

function normalizeWorkspaceExportMode(rawValue) {
  return ["raw", "pdf", "web"].includes(rawValue) ? rawValue : "raw";
}

function normalizeWorkspaceExportContentMode(rawValue) {
  return ["combined", "separate", "raw", "cleansed"].includes(rawValue) ? rawValue : "combined";
}

function getWorkspaceExportType(rawMode) {
  const mode = normalizeWorkspaceExportMode(rawMode);
  if (mode === "pdf") return "pdf";
  if (mode === "web") return "html";
  return "docs";
}

function updateWorkspaceExportTypeSegment(fileName, mode) {
  const current = String(fileName || "").trim();
  if (!current) return current;
  const nextType = getWorkspaceExportType(mode);
  const pattern = /(.*_)(pdf|html|docs)(_\d{2}_\d{2}_\d{4}\.zip)$/i;
  if (!pattern.test(current)) return current;
  return current.replace(pattern, `$1${nextType}$3`);
}

function normalizeWorkspaceExportOptions(rawValue) {
  const source = rawValue && typeof rawValue === "object" ? rawValue : {};
  return {
    destinationPath: typeof source.destinationPath === "string" ? source.destinationPath : "",
    fileName: typeof source.fileName === "string" && source.fileName.trim() ? source.fileName : "workspace_docs_dd_mm_yyyy.zip",
    includeMetadata: source.includeMetadata === true,
    mode: normalizeWorkspaceExportMode(source.mode),
    contentMode: normalizeWorkspaceExportContentMode(source.contentMode),
  };
}

function normalizeTypoCheckEnabled(rawValue) {
  return rawValue !== false;
}

function normalizePreviewImageMode(rawValue) {
  return rawValue === "original" ? "original" : "thumbnail";
}

function normalizeEmbeddedMarkdownMode(rawValue) {
  return rawValue === "inline" ? "inline" : "open";
}

function normalizeIgnoredWords(rawValue) {
  if (!Array.isArray(rawValue)) return [];
  const seen = new Set();
  const output = [];
  for (const entry of rawValue) {
    const word = String(entry || "").trim().toLowerCase();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    output.push(word);
  }
  return output;
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

function getFavoriteDashboardNotes(favorites, recentNotes, continueNotes) {
  const favoriteSet = new Set(Array.isArray(favorites) ? favorites : []);
  const metadataMap = new Map(
    [...(Array.isArray(recentNotes) ? recentNotes : []), ...(Array.isArray(continueNotes) ? continueNotes : [])]
      .filter((item) => item?.entryType === "file" && item?.filePath)
      .map((item) => [String(item.filePath).toLowerCase(), item])
  );

  return Array.from(favoriteSet)
    .map((filePath) => {
      const key = String(filePath || "").toLowerCase();
      const item = metadataMap.get(key) || { filePath, title: filePath, entryType: "file" };
      return {
        ...item,
        displayName: item.title || filePath,
      };
    })
    .filter((item) => item?.filePath)
    .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime());
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
  const { toasts, notify, dismiss } = useToast();

  useEffect(() => {
    const handleToast = (e) => {
      if (e.detail && e.detail.message) {
        notify(e.detail.message, e.detail.type || "info");
      }
    };
    window.addEventListener("app:toast", handleToast);
    return () => window.removeEventListener("app:toast", handleToast);
  }, [notify]);
  const {
    landingAssetsOpen, setLandingAssetsOpen,
    commandPaletteOpen, setCommandPaletteOpen,
    globalSearchOpen, setGlobalSearchOpen,
    globalSearchQuery, setGlobalSearchQuery,
    shortcutsModalOpen, setShortcutsModalOpen,
    markdownGuideOpen, setMarkdownGuideOpen,
    aboutOpen, setAboutOpen,
    helpConfirmationOpen, setHelpConfirmationOpen,
    gitVCOpen, setGitVCOpen,
    gitVCInitialTab, setGitVCInitialTab,
    graphPanelOpen, setGraphPanelOpen,
    embeddingsPageOpen, setEmbeddingsPageOpen,
    personasPageOpen, setPersonasPageOpen,
    healthPageOpen, setHealthPageOpen,
    appLogsOpen, setAppLogsOpen,
    globalCommitDialogOpen, setGlobalCommitDialogOpen,
    tasksPanelOpen, setTasksPanelOpen,
    allTasksPanelOpen, setAllTasksPanelOpen,
    recentNotesPanelOpen, setRecentNotesPanelOpen,
    favoritesPanelOpen, setFavoritesPanelOpen,
    trashDialogOpen, setTrashDialogOpen,
    onboardingComplete, setOnboardingCompleteState,
    defaultNotesPath, setDefaultNotesPath,
    themePreference, setThemePreferenceState,
    effectiveTheme, setEffectiveTheme,
    zoomFactor, setZoomFactorState,
  } = useUIState();

  const [globalNotePreviewTarget, setGlobalNotePreviewTarget] = useState({ open: false, filePath: null, lineNum: null });

  const handlePreviewNote = useCallback((filePath, lineNum = null) => {
    if (!filePath) return;
    setGlobalNotePreviewTarget({ open: true, filePath, lineNum });
  }, []);

  const [workspaceExportOpen, setWorkspaceExportOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [exportImportOpen, setExportImportOpen] = useState(false);
  const [exportImportMode, setExportImportMode] = useState("export");
  const [workspaceExportBusy, setWorkspaceExportBusy] = useState(false);
  const [workspaceExportProgress, setWorkspaceExportProgress] = useState({ phase: "", percent: 0 });
  const [workspaceExportOptions, setWorkspaceExportOptions] = useState(
    normalizeWorkspaceExportOptions(null)
  );
  const [_appInfoLoading, setAppInfoLoading] = useState(true);
  const bootReadyNotifiedRef = useRef(false);
  const [appInfo, setAppInfo] = useState({
    appName: "Notely",
    version: "0.0.0",
    versionCore: "0.0.0",
    commitHash: "",
    isPackaged: true,
  });
  const [workspaceTaskDocuments, setWorkspaceTaskDocuments] = useState([]);
  const [dashboardCache, setDashboardCache] = useState({ continueWriting: [], recentNotes: [] });
  const [gitWorkspaceMeta, setGitWorkspaceMeta] = useState({
    workspaceRoot: "",
    isGitRoot: false,
    branch: "",
    autoIgnoreMetadataInGit: true,
    gitignoreHasNotesApp: false,
    pendingCount: 0,
    files: [],
  });
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateDetails, setUpdateDetails] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const landingLayoutRef = useRef(null);

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
    dirty,
    loadDocumentsData,
    openDocument,
    saveDocument,
    handleReloadCurrentFromDisk,
    reloadDocument: _reloadDocument,
    handleReloadWorkspace,
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
    openTabs,
    handleReorderTabs,
    activeTabPath,
    tabStates,
    handleCloseTab,
    handleCloseOthers,
    handleCloseToRight,
    handleCloseSaved,
    handleCloseAll,
    handleOpenInEditor,
    handleRevealInExplorer,
    workspaceFolders,
    selectedParentFolder,
    setSelectedParentFolder,
    initialLine,
    setInitialLine,
  } = useDocumentManager({ notify });

  const handleCopyLinkPath = useCallback((target) => {
    const filePath = typeof target === "object" ? target?.filePath : target;
    if (!filePath || !notesFolderPath) return;
    let relativePath = "";
    const baseNorm = notesFolderPath.replace(/\\/g, "/").replace(/\/$/, "");
    const fileNorm = filePath.replace(/\\/g, "/");
    if (fileNorm.startsWith(baseNorm)) {
      relativePath = fileNorm.slice(baseNorm.length).replace(/^\//, "");
    } else {
      relativePath = fileNorm;
    }
    const normalized = relativePath.split("/").map(encodeURIComponent).join("/");
    navigator.clipboard.writeText(normalized);
    notify(`Copied relative path: ${normalized}`, "success");
  }, [notesFolderPath, notify]);

  const [activeDocumentChangedOnDisk, setActiveDocumentChangedOnDisk] = useState(false);
  const currentFilePath = current?.filePath;

  useEffect(() => {
    setActiveDocumentChangedOnDisk(false);
  }, [current?.filePath, current?.rawNotes, current?.cleansed]);

  useEffect(() => {
    if (typeof window.notesApi?.onDocumentChangedOnDisk !== "function") return undefined;
    const unsubscribe = window.notesApi.onDocumentChangedOnDisk((payload) => {
      if (payload && currentFilePath && payload.filePath === currentFilePath) {
        setActiveDocumentChangedOnDisk(true);
      }
    });
    return () => unsubscribe();
  }, [currentFilePath]);

  const workspaceStorageScope = useMemo(() => {
    const rawWorkspaceId = activeProject?.slug || activeProject?.rootPath || notesFolderPath || "default";
    return encodeURIComponent(String(rawWorkspaceId));
  }, [activeProject, notesFolderPath]);

  const [landingSidebarWidth, setLandingSidebarWidth] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:landing-sidebar-width",
    defaultValue: 260,
    normalize: (value) => {
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? 260 : parsed;
    },
  });

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
  const [previewImageMode, setPreviewImageMode] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:preview-image-mode",
    defaultValue: "thumbnail",
    normalize: normalizePreviewImageMode,
  });
  const [embeddedMarkdownMode, setEmbeddedMarkdownMode] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:embedded-markdown-mode",
    defaultValue: "open",
    normalize: normalizeEmbeddedMarkdownMode,
  });

  const [ignoredSpellingWords, setIgnoredSpellingWords] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:ignored-spelling-words",
    defaultValue: EMPTY_ARRAY,
    normalize: normalizeIgnoredWords,
  });
  const [autosaveEnabled, setAutosaveEnabled] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:autosave-enabled",
    defaultValue: false,
    normalize: (value) => value === true,
    fallbackKey: "notely:autosave-enabled",
  });
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");

  const openSettings = (tab = "general") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const handleSetTheme = async (theme) => {
    try {
      const themeResult = await persistThemePreference(theme);
      const appliedPreference = ["auto", "light", "dark"].includes(themeResult?.themePreference)
        ? themeResult.themePreference
        : theme;
      const appliedTheme = themeResult?.effectiveTheme === "dark" ? "dark" : "light";
      setThemePreferenceState(appliedPreference);
      setEffectiveTheme(appliedTheme);
    } catch {
      notify("Failed to set theme preference.", "error");
    }
  };

  const handleSetZoom = async (zoom) => {
    try {
      const result = await persistZoomFactor(zoom);
      const appliedZoom = Number.isFinite(Number(result?.zoomFactor))
        ? Number(result.zoomFactor)
        : zoom;
      setZoomFactorState(appliedZoom);
    } catch {
      notify("Failed to change zoom scale.", "error");
    }
  };



  const handleAddDictionaryWord = (word) => {
    const normalized = String(word || "").trim().toLowerCase();
    if (!normalized) return;
    if (ignoredSpellingWords.includes(normalized)) {
      notify(`"${normalized}" is already in the dictionary.`, "info");
      return;
    }
    setIgnoredSpellingWords((current) => {
      const next = normalizeIgnoredWords(current);
      return [...next, normalized];
    });
    notify(`Added "${normalized}" to dictionary.`, "success");
  };

  const handleRemoveDictionaryWord = (word) => {
    const normalized = String(word || "").trim().toLowerCase();
    if (!normalized) return;
    setIgnoredSpellingWords((current) => {
      const next = normalizeIgnoredWords(current);
      return next.filter((item) => item !== normalized);
    });
    notify(`Removed "${word}" from dictionary.`, "success");
  };

  const handleClearDictionary = () => {
    setIgnoredSpellingWords([]);
    notify("Cleared spelling dictionary.", "success");
  };

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
    handleAIClearCache,
    handleOpenAIPalette,
    handleInlineAIRequest,
    handleApplyAIResult,
    handleAIChatSend,
    handleAIChatAbort,
    handleClearAIChat,
    handleRejectInlineGhost,
    handleAcceptInlineGhost,
    activeProvider,
    activePersona,
    setActivePersona,
    activeQueryId,
    conversations,
    loadConversations,
    loadConversation,
    deleteConversation,
  } = useAIAssistant({
    current,
    activeTab,
    mode,
    activeProject,
    landingFolderPath,
    notesFolderPath,
    notify,
  });

  useEffect(() => {
    if (p2pStatusOpen) {
      setSettingsTab("p2p");
      setSettingsOpen(true);
      setP2PStatusOpen(false);
    }
  }, [p2pStatusOpen, setP2PStatusOpen]);

  useEffect(() => {
    if (aiSettingsOpen) {
      setSettingsTab("ai");
      setSettingsOpen(true);
      setAiSettingsOpen(false);
    }
  }, [aiSettingsOpen, setAiSettingsOpen]);

  const terminalCwd = current?.filePath
    ? current.filePath.replace(/[\\/][^\\/]+$/, "")
    : (landingFolderPath || activeProject?.rootPath || notesFolderPath);

  const clampLandingSidebarWidth = (w) => Math.min(Math.max(w, 200), 450);

  const startLandingSidebarResize = (event) => {
    const layout = landingLayoutRef.current;
    if (!layout) return;
    event.preventDefault();
    const updateWidth = (clientX) => {
      const bounds = layout.getBoundingClientRect();
      const nextWidth = clientX - bounds.left;
      setLandingSidebarWidth(clampLandingSidebarWidth(nextWidth));
    };
    const handlePointerMove = (moveEvent) => {
      updateWidth(moveEvent.clientX);
    };
    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  const handleLandingSidebarResizerKeyDown = (event) => {
    const STEP = event.shiftKey ? 20 : 5;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setLandingSidebarWidth((w) => clampLandingSidebarWidth(w - STEP));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setLandingSidebarWidth((w) => clampLandingSidebarWidth(w + STEP));
    } else if (event.key === "Home") {
      event.preventDefault();
      setLandingSidebarWidth(200);
    } else if (event.key === "End") {
      event.preventDefault();
      setLandingSidebarWidth(450);
    }
  };

  async function handleOpenWorkspaceInEditor() {
    const workspacePath = activeProject?.rootPath || notesFolderPath;
    if (!workspacePath) {
      notify("Workspace path unavailable.", "error");
      return;
    }

    try {
      const result = await openWorkspaceInEditor(workspacePath);
      if (result?.openedWith === "default") {
        notify("VS Code not available. Opened workspace in the system default app.", "info");
      } else {
        notify("Opened workspace in VS Code.", "success");
      }
    } catch (error) {
      notify(error?.message || "Unable to open workspace in VS Code.", "error");
    }
  }

  async function handleRevealWorkspaceInExplorer() {
    const workspacePath = activeProject?.rootPath || notesFolderPath;
    if (!workspacePath) {
      notify("Workspace path unavailable.", "error");
      return;
    }

    try {
      await revealWorkspaceInExplorer(workspacePath);
      notify("Revealed workspace in File Explorer.", "success");
    } catch (error) {
      notify(error?.message || "Unable to reveal workspace in File Explorer.", "error");
    }
  }

  async function handleOpenReferencedDocumentFromUI(filePath, optionsOrLineNumber) {
    await handleOpenReferencedDocument(filePath, optionsOrLineNumber);
    setLandingAssetsOpen(false);
  }

  const refreshGitWorkspaceMeta = useCallback(async function refreshGitWorkspaceMeta() {
    try {
      const meta = await getGitWorkspaceMetadata();
      let pendingCount = 0;
      let files = [];
      if (meta?.isGitRoot && notesFolderPath) {
        const statusResult = await gitGetStatus(notesFolderPath);
        if (statusResult?.ok) {
          pendingCount = statusResult.data.files?.length || 0;
          files = statusResult.data.files || [];
        }
      }
      setGitWorkspaceMeta({
        workspaceRoot: String(meta?.workspaceRoot || ""),
        isGitRoot: meta?.isGitRoot === true,
        branch: String(meta?.branch || ""),
        autoIgnoreMetadataInGit: meta?.autoIgnoreMetadataInGit !== false,
        gitignoreHasNotesApp: meta?.gitignoreHasNotesApp === true,
        pendingCount,
        files,
      });
    } catch {
      setGitWorkspaceMeta((currentValue) => ({
        ...currentValue,
        isGitRoot: false,
        pendingCount: 0,
        files: [],
      }));
    }
  }, [notesFolderPath]);

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

  const handleGitStateChange = useCallback(({ branch, pendingCount }) => {
    setGitWorkspaceMeta((meta) => {
      if (meta.branch === branch && meta.pendingCount === pendingCount) return meta;
      return {
        ...meta,
        branch,
        pendingCount,
      };
    });
  }, []);

  const handleManualUpdateCheck = useCallback(async () => {
    setUpdateStatus("checking");
    setShowUpdateModal(true);
    try {
      const res = await checkForUpdates();
      if (res.success) {
        setUpdateStatus(res.updateAvailable ? "available" : "up-to-date");
        setUpdateDetails(res);
      } else {
        setUpdateStatus("error");
        setUpdateDetails({ error: res.error });
      }
    } catch (err) {
      setUpdateStatus("error");
      setUpdateDetails({ error: err.message });
    }
  }, []);

  useEffect(() => {
    void refreshGitWorkspaceMeta();
  }, [notesFolderPath, currentFilePath, dirty, refreshGitWorkspaceMeta]);

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
        setGlobalSearchQuery("");
        setGlobalSearchOpen(true);
        return;
      }

      if (isShortcutHelp) {
        event.preventDefault();
        setCommandPaletteOpen(false);
        setGlobalSearchOpen(false);
        setShortcutsModalOpen(true);
        return;
      }
    }

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void getAppInfo()
      .then((info) => {
        setAppInfo({
          appName: String(info?.appName || "Notely"),
          version: String(info?.version || "0.0.0"),
          versionCore: String(info?.versionCore || "0.0.0"),
          commitHash: String(info?.commitHash || ""),
          isPackaged: Boolean(info?.isPackaged),
        });
      })
      .catch(() => {
        // Ignore app-info failures in renderer and keep fallback values.
      })
      .finally(() => {
        setAppInfoLoading(false);
        // Trigger auto-check for updates on load
        void (async () => {
          try {
            const res = await checkForUpdates();
            if (res.success && res.updateAvailable) {
              setUpdateStatus("available");
              setUpdateDetails(res);
            } else if (res.success) {
              setUpdateStatus("up-to-date");
              setUpdateDetails(res);
            }
          } catch {
            // Silently ignore update errors on startup auto-check
          }
        })();
      });
  }, []);



  useEffect(() => {
    const workspaceRoot = normalizePathLikeValue(activeProject?.rootPath || notesFolderPath);
    if (!workspaceRoot) {
      setWorkspaceTaskDocuments([]);
      return undefined;
    }

    let cancelled = false;

    void listWorkspaceTaskDocuments()
      .then((entries) => {
        if (cancelled) return;
        setWorkspaceTaskDocuments(Array.isArray(entries) ? entries : []);
      })
      .catch(() => {
        if (cancelled) return;
        setWorkspaceTaskDocuments([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProject, notesFolderPath, documents]);

  useEffect(() => {
    const workspaceRoot = normalizePathLikeValue(activeProject?.rootPath || notesFolderPath);
    if (!workspaceRoot) {
      setDashboardCache({ continueWriting: [], recentNotes: [] });
      return undefined;
    }

    let cancelled = false;

    void getDashboardCache()
      .then((cache) => {
        if (cancelled) return;
        setDashboardCache({
          continueWriting: Array.isArray(cache?.continueWriting) ? cache.continueWriting : [],
          recentNotes: Array.isArray(cache?.recentNotes) ? cache.recentNotes : [],
        });
      })
      .catch(() => {
        if (cancelled) return;
        setDashboardCache({ continueWriting: [], recentNotes: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [activeProject, notesFolderPath, documents, current?.filePath]);

  useEffect(() => {
    void getAppearanceSettings()
      .then((appearance) => {
        const nextPreference = ["auto", "light", "dark"].includes(appearance?.themePreference)
          ? appearance.themePreference
          : "auto";
        const nextEffective = appearance?.effectiveTheme === "dark" ? "dark" : "light";
        const nextZoom = Number.isFinite(Number(appearance?.zoomFactor))
          ? Math.max(0.75, Math.min(2, Number(appearance.zoomFactor)))
          : 1;
        setThemePreferenceState(nextPreference);
        setEffectiveTheme(nextEffective);
        setZoomFactorState(nextZoom);
      })
      .catch(() => {
        // Keep defaults when appearance settings are unavailable.
      });

    return onThemeChanged((payload) => {
      const nextPreference = ["auto", "light", "dark"].includes(payload?.themePreference)
        ? payload.themePreference
        : "auto";
      const nextEffective = payload?.effectiveTheme === "dark" ? "dark" : "light";
      setThemePreferenceState(nextPreference);
      setEffectiveTheme(nextEffective);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key && e.key.toLowerCase() === "m" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setMarkdownGuideOpen(true);
      }
      if (e.key === "," && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        openSettings("general");
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleTabSwitchKeyDown = (e) => {
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        if (!openTabs || openTabs.length <= 1) return;
        const currentIndex = openTabs.indexOf(activeTabPath);
        if (currentIndex === -1) return;

        let nextIndex;
        if (e.shiftKey) {
          nextIndex = (currentIndex - 1 + openTabs.length) % openTabs.length;
        } else {
          nextIndex = (currentIndex + 1) % openTabs.length;
        }

        const nextTab = openTabs[nextIndex];
        if (nextTab) {
          openDocument(nextTab);
        }
      }
    };
    window.addEventListener("keydown", handleTabSwitchKeyDown, true);
    return () => window.removeEventListener("keydown", handleTabSwitchKeyDown, true);
  }, [openTabs, activeTabPath, openDocument]);

  useEffect(() => {
    function handleCustomSearch(e) {
      setGlobalSearchQuery(e.detail?.query || "");
      setGlobalSearchOpen(true);
    }
    window.addEventListener("open-global-search-query", handleCustomSearch);
    return () => window.removeEventListener("open-global-search-query", handleCustomSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void getOnboardingComplete()
      .then((res) => {
        setOnboardingCompleteState(res?.onboardingComplete ?? false);
      })
      .catch(() => {
        setOnboardingCompleteState(true);
      });

    void getNotesRootSetting()
      .then((res) => {
        if (res?.notesRoot) {
          setDefaultNotesPath(res.notesRoot);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document?.documentElement;
    if (!root) return;
    root.setAttribute("data-theme", effectiveTheme === "dark" ? "dark" : "light");
    root.setAttribute("data-theme-preference", themePreference);
  }, [effectiveTheme, themePreference]);

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
      previewImageMode,
      embeddedMarkdownMode,
      screenCaptureMode,
      themePreference,
      dirty: dirty && !activeDocumentChangedOnDisk,
      terminalOpen: showTerminal,
      terminalShell: terminalShellPreference,
      outlineEnabled,
      splitPreviewEnabled: current ? mode === "split" : false,
      focusModeEnabled: current ? focusModeEnabled : false,
      canRemoveFolder,
      currentFolderLabel: currentPath ? currentPath.replace(/^.*[\\/]/, "") : "",
      recentWorkspacePaths: normalizePathLikeList(recentWorkspacePaths),
      autosaveEnabled,
    });
  }, [current, notesViewMode, notesDensityMode, typoCheckEnabled, previewImageMode, embeddedMarkdownMode, screenCaptureMode, themePreference, dirty, activeDocumentChangedOnDisk, activeProject, notesFolderPath, landingFolderPath, showTerminal, terminalShellPreference, outlineEnabled, mode, focusModeEnabled, recentWorkspacePaths, autosaveEnabled]);

  useEffect(() => {
    const handleAction = (action) => {
      if (action === "toggle-autosave") {
        setAutosaveEnabled((prev) => !prev);
        return;
      }

      if (action === "open-dictionary") {
        setDictionaryOpen(true);
        return;
      }

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

      if (action === "export-workspace-zip") {
        void handleOpenWorkspaceExport();
        return;
      }

      if (action === "open-export-import") {
        setExportImportMode("export");
        setExportImportOpen(true);
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

      if (action === "open-feedback") {
        setFeedbackOpen(true);
        return;
      }

      if (action === "open-help-center" || action === "open-about" || action === "check-for-updates") {
        if (action === "open-about") {
          setAboutOpen(true);
        } else if (action === "check-for-updates") {
          void handleManualUpdateCheck();
        } else {
          setHelpConfirmationOpen(true);
        }
        return;
      }

      if (action === "open-markdown-guide") {
        setMarkdownGuideOpen(true);
        return;
      }

      if (action === "open-shortcuts") {
        setGlobalSearchOpen(false);
        setCommandPaletteOpen(false);
        setShortcutsModalOpen(true);
        return;
      }

      if (action === "set-icon-and-color") {
        window.dispatchEvent(new CustomEvent("app:set-icon-and-color"));
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


      const closeAllFullscreenViews = () => {
        setGraphPanelOpen(false);
        setEmbeddingsPageOpen(false);
        setPersonasPageOpen(false);
        setHealthPageOpen(false);
        setAppLogsOpen(false);
        setGitVCOpen(false);
      };

      if (action === "open-workspace-graph") {
        closeAllFullscreenViews();
        setGraphPanelOpen(true);
        return;
      }

      if (action === "open-embeddings-page") {
        closeAllFullscreenViews();
        setEmbeddingsPageOpen(true);
        return;
      }

      if (action === "open-personas-page") {
        closeAllFullscreenViews();
        setPersonasPageOpen(true);
        return;
      }

      if (action === "open-app-logs") {
        closeAllFullscreenViews();
        setAppLogsOpen(true);
        return;
      }

      if (action === "open-git-version-control") {
        closeAllFullscreenViews();
        setGitVCInitialTab("status");
        setGitVCOpen(true);
        return;
      }

      if (action === "open-ai-health") {
        closeAllFullscreenViews();
        setHealthPageOpen(true);
        return;
      }

      if (action === "git-commit") {
        setGlobalCommitDialogOpen(true);
        return;
      }

      if (action === "git-history") {
        if (current) {
          setDocumentMenuAction({ action, nonce: Date.now() });
        } else {
          notify("Open a note to view its history.", "info");
        }
        return;
      }

      if (action === "git-diff-current") {
        if (current) {
          setDocumentMenuAction({ action, nonce: Date.now() });
        } else {
          notify("Open a note to diff.", "info");
        }
        return;
      }

      if (action === "git-compare") {
        setGitVCInitialTab("compare");
        setGitVCOpen(true);
        return;
      }

      if (action === "git-create-branch" || action === "git-switch-branch" || action === "git-merge-branch") {
        setGitVCInitialTab("branches");
        setGitVCOpen(true);
        return;
      }

      if (action === "git-tags") {
        setGitVCInitialTab("tags");
        setGitVCOpen(true);
        return;
      }

      if (action === "git-stash") {
        setGitVCInitialTab("stashes");
        setGitVCOpen(true);
        return;
      }

      if (action === "git-push" || action === "git-pull" || action === "git-fetch" || action === "git-sync") {
        setGitVCInitialTab("remotes");
        setGitVCOpen(true);
        return;
      }

      if (action === "toggle-auto-ignore-git-metadata") {
        void handleToggleAutoIgnoreGitMetadata();
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

      if (action === "theme-auto" || action === "theme-light" || action === "theme-dark") {
        const nextPreference = action === "theme-light"
          ? "light"
          : action === "theme-dark"
            ? "dark"
            : "auto";
        void persistThemePreference(nextPreference)
          .then((result) => {
            const appliedPreference = ["auto", "light", "dark"].includes(result?.themePreference)
              ? result.themePreference
              : nextPreference;
            const appliedTheme = result?.effectiveTheme === "dark" ? "dark" : "light";
            setThemePreferenceState(appliedPreference);
            setEffectiveTheme(appliedTheme);
            notify(`Theme set to ${appliedPreference === "auto" ? "System" : appliedPreference}.`, "info");
          })
          .catch(() => {
            notify("Unable to update theme preference.", "error");
          });
        return;
      }

      if (action === "zoom-in" || action === "zoom-out" || action === "zoom-reset") {
        const nextZoom = action === "zoom-reset"
          ? 1
          : action === "zoom-in"
            ? Math.min(2, Number((zoomFactor + 0.1).toFixed(2)))
            : Math.max(0.75, Number((zoomFactor - 0.1).toFixed(2)));

        void persistZoomFactor(nextZoom)
          .then((result) => {
            const appliedZoom = Number.isFinite(Number(result?.zoomFactor))
              ? Number(result.zoomFactor)
              : nextZoom;
            setZoomFactorState(appliedZoom);
            notify(`Zoom ${Math.round(appliedZoom * 100)}%.`, "info");
          })
          .catch(() => {
            notify("Unable to update zoom level.", "error");
          });
        return;
      }

      if (action === "save-document") {
        if (!activeDocumentChangedOnDisk) {
          saveDocument();
        }
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
          setDocumentMenuAction({ action, nonce: Date.now() });
        }
        return;
      }

      if (action === "toggle-typo-check") {
        setTypoCheckEnabled((enabled) => !enabled);
        return;
      }

      if (action === "view-preview-image-thumbnail") {
        setPreviewImageMode("thumbnail");
        return;
      }

      if (action === "view-preview-image-original") {
        setPreviewImageMode("original");
        return;
      }

      if (action === "view-embedded-markdown-open") {
        setEmbeddedMarkdownMode("open");
        return;
      }

      if (action === "view-embedded-markdown-inline") {
        setEmbeddedMarkdownMode("inline");
        return;
      }

      if (
        action === "toggle-outline"
        || action === "toggle-outline-enabled"
        || action === "toggle-split-preview"
        || action === "toggle-focus-mode"
      ) {
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
        // Deprecated version action
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

      if (action === "open-workspace-in-editor") {
        handleOpenWorkspaceInEditor();
        return;
      }

      if (action === "reveal-workspace-in-explorer") {
        handleRevealWorkspaceInExplorer();
        return;
      }

      if (action === "reload-document") {
        handleReloadCurrentFromDisk();
        return;
      }

      if (action === "reload-workspace") {
        handleReloadWorkspace();
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

      if (action === "open-knowledge-graph") {
        setGraphPanelOpen(true);
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


      if (action === "open-personas-page") {
        setPersonasPageOpen(true);
        return;
      }

      if (action === "open-health-page") {
        setHealthPageOpen(true);
        return;
      }

      if (action === "ai-clear-cache") {
        handleAIClearCache();
        return;
      }
    };

    const unsubscribeMenu = onMenuAction(handleAction);

    const handleCustomMenuAction = (e) => {
      if (e.detail && e.detail.action) {
        handleAction(e.detail.action);
      }
    };
    window.addEventListener("app:menu-action", handleCustomMenuAction);

    return () => {
      unsubscribeMenu();
      window.removeEventListener("app:menu-action", handleCustomMenuAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, dirty, activeProject, activeTab, landingFolderPath, zoomFactor]);

  async function handleOpenWorkspaceExport() {
    setWorkspaceExportOpen(true);
    setWorkspaceExportProgress({ phase: "", percent: 0 });
    try {
      const defaults = await getWorkspaceExportDefaults();
      setWorkspaceExportOptions(normalizeWorkspaceExportOptions(defaults));
    } catch (error) {
      notify(error?.message || "Unable to load export defaults.", "error");
    }
  }

  function handleWorkspaceExportOptionChange(patch) {
    setWorkspaceExportOptions((currentValue) => {
      const currentNormalized = normalizeWorkspaceExportOptions(currentValue);
      const nextValue = {
        ...currentNormalized,
        ...(patch || {}),
      };
      if (Object.prototype.hasOwnProperty.call(patch || {}, "mode") && !Object.prototype.hasOwnProperty.call(patch || {}, "fileName")) {
        nextValue.fileName = updateWorkspaceExportTypeSegment(currentNormalized.fileName, nextValue.mode);
      }
      return normalizeWorkspaceExportOptions(nextValue);
    });
  }

  async function handleBrowseWorkspaceExportDestination() {
    try {
      const result = await browseWorkspaceExportDestination();
      if (result?.canceled || !result?.destinationPath) return;
      handleWorkspaceExportOptionChange({ destinationPath: result.destinationPath });
    } catch (error) {
      notify(error?.message || "Unable to browse export destination.", "error");
    }
  }

  async function handleRunWorkspaceExport() {
    const options = normalizeWorkspaceExportOptions(workspaceExportOptions);
    if (!options.destinationPath.trim()) {
      notify("Select an export destination folder.", "warning");
      return;
    }
    if (!options.fileName.trim()) {
      notify("Provide a zip filename.", "warning");
      return;
    }

    setWorkspaceExportBusy(true);
    setWorkspaceExportProgress({ phase: "Preparing export", percent: 2 });
    try {
      notify("Workspace export started...", "info");
      const result = await exportWorkspaceZip(options);
      if (!result?.canceled) {
        setWorkspaceExportProgress({ phase: "Export complete", percent: 100 });
        notify(`Workspace exported: ${result?.filePath || "zip created"}`, "success");
        setWorkspaceExportOpen(false);
      }
    } catch (error) {
      notify(error?.message || "Workspace export failed.", "error");
    } finally {
      setWorkspaceExportBusy(false);
    }
  }

  useEffect(() => {
    return onWorkspaceExportProgress((payload) => {
      const phase = String(payload?.phase || "").trim();
      const parsedPercent = Number(payload?.percent);
      const percent = Number.isFinite(parsedPercent) ? Math.max(0, Math.min(100, parsedPercent)) : 0;
      setWorkspaceExportProgress({ phase, percent });
    });
  }, []);

  const [noteAIStats, setNoteAIStats] = useState({ chunkCount: 0, edgeCount: 0 });

  useEffect(() => {
    if (!current?.filePath) {
      setNoteAIStats({ chunkCount: 0, edgeCount: 0 });
      return undefined;
    }
    let active = true;
    const fetchStats = async () => {
      try {
        if (window.notesApi?.aiGetNoteStats) {
          const res = await window.notesApi.aiGetNoteStats(current.filePath);
          if (res?.success && active) {
            setNoteAIStats(res.data);
          }
        }
      } catch (err) {
        console.error("Failed to fetch note stats in App", err);
      }
    };
    fetchStats();
    return () => { active = false; };
  }, [current?.filePath, current?.rawNotes, current?.cleansed]);

  const folderCount = documents.filter((entry) => entry.entryType === "folder").length;
  const noteCount = documents.length - folderCount;

  const documentStats = useMemo(() => {
    if (!current) return null;
    const text = activeTab === "raw" ? (current.rawNotes || "") : (current.cleansed || "");
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lineCount = text.split(/\n/).length;
    const readMinutes = Math.max(1, Math.ceil(wordCount / 200));
    return { wordCount, lineCount, readMinutes };
  }, [current, activeTab]);
  const visibleDocuments = applyDocumentListQuery(documents, {
    query: landingListQuery,
    typeFilter: landingEntryFilter,
    sortBy: landingSortMode,
  });
  const visibleFolderCount = visibleDocuments.filter((entry) => entry.entryType === "folder").length;
  const visibleNoteCount = visibleDocuments.length - visibleFolderCount;
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
    { id: "new-note", label: "Create New Note", group: "Notes", shortcut: "Ctrl/Cmd+N", aliases: "add note new document write jot capture" },
    { id: "open-ai-palette", label: "Open AI Palette", group: "AI", shortcut: "Ctrl/Cmd+Shift+I", aliases: "assistant ask ai prompt summarize rewrite" },
    { id: "open-help-center", label: "Open Help Center", group: "Help", shortcut: "F1", aliases: "help docs guide manual about" },
    { id: "open-feedback", label: "Report Bug / Feedback", group: "Help", aliases: "feedback bug report issue feature request" },
    { id: "open-about", label: "Open About Notely", group: "Help", aliases: "about version build" },
    { id: "new-folder", label: "Create New Folder", group: "Notes", aliases: "add folder create directory organize" },
    { id: "open-global-search", label: "Open Global Search", group: "Search", shortcut: "Ctrl/Cmd+Shift+F", aliases: "find everywhere search all notes quick open jump" },
    { id: "open-shortcuts", label: "Open Keyboard Shortcuts", group: "Help", shortcut: "Ctrl/Cmd+/", aliases: "hotkeys keymap shortcuts" },
    { id: "open-workspace", label: "Open Workspace", group: "Workspace", shortcut: "Ctrl/Cmd+Shift+N", aliases: "open workspace folder notes root path" },
    { id: "reload-workspace", label: "Reload Workspace from Disk", group: "Workspace", shortcut: "Ctrl/Cmd+Alt+R", aliases: "refresh reload workspace disk" },
    { id: "reload-document", label: "Reload Current Note from Disk", group: "Editor", shortcut: "Ctrl/Cmd+Shift+R", disabled: !current, aliases: "refresh reload note file disk" },
    { id: "export-workspace-zip", label: "Export Workspace as Zip", group: "Workspace", aliases: "export backup archive zip workspace" },
    { id: "open-workspace-graph", label: "Open Workspace Graph", group: "Navigation", aliases: "graph map relationships links topology" },
    { id: "open-tasks-panel", label: "Open Tasks Panel", group: "Navigation", aliases: "tasks todos checkboxes unchecked open items" },
    { id: "open-all-tasks", label: "Open All Tasks", group: "Navigation", aliases: "all tasks completed closed open task list workspace tasks" },
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
    { id: "open-knowledge-graph", label: "Open Knowledge Graph", group: "AI", aliases: "workspace graph mind map network relations nodes" },
    { id: "open-embeddings-page", label: "Open Embeddings Dashboard", group: "AI", aliases: "vector database indexing onnx local bge segments" },
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
      aliases: "search in note find search",
    },
    {
      id: "find-replace",
      label: "Find and Replace in Current Note",
      group: "Editor",
      shortcut: "Ctrl/Cmd+H",
      disabled: !current,
      aliases: "search replace substitute in note",
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
      id: "go-home",
      label: "Go to Notes Home",
      group: "Navigation",
      disabled: !current,
      aliases: "home notes list landing back",
    },
    {
      id: "toggle-focus-mode",
      label: focusModeEnabled ? "Exit Focus Mode" : "Enter Focus Mode",
      group: "View",
      shortcut: "F11",
      disabled: !current,
      aliases: "focus distraction free writing",
    },
    {
      id: "toggle-outline-enabled",
      label: outlineEnabled ? "Hide Outline" : "Show Outline",
      group: "View",
      shortcut: "Ctrl/Cmd+Alt+L",
      disabled: !current || focusModeEnabled,
      aliases: "outline headings navigation sections",
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

    if (resolvedCommandId === "reload-document") {
      await handleReloadCurrentFromDisk();
      return;
    }

    if (resolvedCommandId === "reload-workspace") {
      await handleReloadWorkspace();
      return;
    }

    if (resolvedCommandId === "new-note") {
      setNoteDialogOpen(true);
      return;
    }

    if (resolvedCommandId === "open-ai-palette") {
      handleOpenAIPalette({ forceOpen: true });
      return;
    }

    if (resolvedCommandId === "open-help-center") {
      setHelpConfirmationOpen(true);
      return;
    }

    if (resolvedCommandId === "open-feedback") {
      setFeedbackOpen(true);
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

    if (resolvedCommandId === "export-workspace-zip") {
      await handleOpenWorkspaceExport();
      return;
    }

    if (resolvedCommandId === "open-recent-workspaces") {
      setRecentWorkspacesDialogOpen(true);
      return;
    }


    if (resolvedCommandId === "open-workspace-graph") {
      setGraphPanelOpen(true);
      return;
    }

    if (resolvedCommandId === "open-embeddings-page") {
      setEmbeddingsPageOpen(true);
      return;
    }

    if (resolvedCommandId === "open-personas-page") {
      setPersonasPageOpen(true);
      return;
    }

    if (resolvedCommandId === "open-tasks-panel") {
      setTasksPanelOpen(true);
      return;
    }

    if (resolvedCommandId === "open-all-tasks") {
      setAllTasksPanelOpen(true);
      return;
    }

    if (resolvedCommandId === "open-global-search") {
      setGlobalSearchQuery("");
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

    if (resolvedCommandId === "open-knowledge-graph") {
      setGraphPanelOpen(true);
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

    if (resolvedCommandId === "toggle-focus-mode") {
      if (!current) {
        notify("Open a note to use Focus Mode.", "info");
        return;
      }
      setDocumentMenuAction({ action: "toggle-focus-mode", nonce: Date.now() });
      return;
    }

    if (resolvedCommandId === "toggle-outline-enabled") {
      if (!current) {
        notify("Open a note to use the outline.", "info");
        return;
      }
      setDocumentMenuAction({ action: "toggle-outline-enabled", nonce: Date.now() });
      return;
    }

    if (resolvedCommandId === "find-in-note") {
      if (!current) {
        notify("Open a note to search within it.", "info");
        return;
      }
      setDocumentMenuAction({ action: "find-in-note", nonce: Date.now() });
      return;
    }

    if (resolvedCommandId === "find-replace") {
      if (!current) {
        notify("Open a note to search within it.", "info");
        return;
      }
      setDocumentMenuAction({ action: "find-replace", nonce: Date.now() });
      return;
    }

    if (resolvedCommandId === "go-home") {
      handleGoHome();
      return;
    }

    if (resolvedCommandId === "open-current-note-parent-folder") {
      if (!canOpenCurrentNoteParent) {
        notify("Current note is outside the active workspace path.", "info");
        return;
      }
      const canLeaveCurrent = await handleGoHome();
      if (!canLeaveCurrent) return;
      await handleLandingNavigateTo(currentNoteParentPath);
      return;
    }

    if (resolvedCommandId === "reveal-current-note-in-list") {
      if (!canOpenCurrentNoteParent) {
        notify("Current note is outside the active workspace path.", "info");
        return;
      }
      const canLeaveCurrent = await handleGoHome();
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
      setDocumentMenuAction({ action: "find-in-note", query, nonce: Date.now() });
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
      setGlobalSearchQuery("");
      setGlobalSearchOpen(true);
      return;
    }

    if (action === "assets") {
      setLandingAssetsOpen(true);
      return;
    }

    if (action === "ai") {
      if (!isAIConfigured) {
        notify("Configure an AI provider key in AI Settings to use AI chat.", "warning");
        setAiSettingsOpen(true);
        return;
      }
      setAiPanelVisible((visible) => !visible);
      return;
    }

    if (action === "trash") {
      setTrashDialogOpen(true);
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

  const continueDashboardNotes = useMemo(
    () => (Array.isArray(dashboardCache?.continueWriting) ? dashboardCache.continueWriting : []),
    [dashboardCache]
  );
  const recentDashboardNotes = useMemo(
    () => (Array.isArray(dashboardCache?.recentNotes) ? dashboardCache.recentNotes : []),
    [dashboardCache]
  );
  const favoriteDashboardNotes = useMemo(
    () => getFavoriteDashboardNotes(favoriteNotes, recentDashboardNotes, continueDashboardNotes),
    [favoriteNotes, recentDashboardNotes, continueDashboardNotes]
  );

  const handleOnboardingComplete = async ({ workspacePath, theme, setupDemo, aiEnabled, aiProvider, enableEmbeddings }) => {
    try {
      const themeResult = await persistThemePreference(theme);
      const appliedPreference = ["auto", "light", "dark"].includes(themeResult?.themePreference)
        ? themeResult.themePreference
        : theme;
      const appliedTheme = themeResult?.effectiveTheme === "dark" ? "dark" : "light";
      setThemePreferenceState(appliedPreference);
      setEffectiveTheme(appliedTheme);

      // Save AI onboarding preferences
      try {
        await aiSetPreferences({
          aiEnabled: aiEnabled !== false,
          enableEmbeddings: enableEmbeddings !== false,
          enablePatternLearning: true,
          enableRelationshipDiscovery: true,
          maxTokensPerQuery: 2048,
          temperature: 0.7
        });
        if (aiEnabled && aiProvider) {
          await aiSetProviderModel(aiProvider, '');
        }
        await refreshAIConfiguration();
      } catch (aiErr) {
        console.error("Failed to save AI onboarding preferences:", aiErr);
      }

      if (workspacePath) {
        await setNotesRootSetting(workspacePath);
        if (setupDemo) {
          try {
            await setupDemoWorkspace(workspacePath);
          } catch (demoErr) {
            console.error("Demo setup failed:", demoErr);
          }
        }
        await loadDocumentsData();
      }

      await setOnboardingComplete(true);
      setOnboardingCompleteState(true);
      notify("Onboarding complete! Welcome to Notely.", "success");
    } catch (err) {
      notify(err?.message || "Failed to complete onboarding setup.", "error");
    }
  };

  const handleResetOnboarding = async () => {
    try {
      await setOnboardingComplete(false);
      setOnboardingCompleteState(false);
      notify("Onboarding reset. Re-loading flow...", "info");
    } catch {
      notify("Failed to reset onboarding.", "error");
    }
  };

  const aiSidebarComponent = aiPanelVisible && isAIConfigured ? (
    <ErrorBoundary label="AI chat">
      <Suspense fallback={<div className="lazy-loading">Loading AI…</div>}>
        <AIChatPanel
          onHide={() => setAiPanelVisible(false)}
          onClear={handleClearAIChat}
          onSend={handleAIChatSend}
          onAbort={handleAIChatAbort}
          activeQueryId={activeQueryId}
          onApply={handleApplyAIResult}
          onOpenDocument={handleOpenReferencedDocumentFromUI}
          onPreviewNote={handlePreviewNote}
          isLoading={aiQueryLoading}
          error={aiQueryError || null}
          contextSummary={aiContextSummary}
          intent={aiPaletteIntent}
          messages={aiChatMessages}
          noteTitle={current?.title || "Current Note"}
          activeProvider={activeProvider}
          activePersona={activePersona}
          setActivePersona={setActivePersona}
          workspaceStorageScope={workspaceStorageScope}
          conversations={conversations}
          onLoadConversations={loadConversations}
          onLoadConversation={loadConversation}
          onDeleteConversation={deleteConversation}
        />

      </Suspense>
    </ErrorBoundary>
  ) : null;

  return (
    <div className={`app-shell${showTerminal ? " terminal-open" : ""}${current ? " document-screen" : " landing-screen"}${focusModeEnabled && current ? " focus-mode-active" : ""}`}>
      <TitleBar
        title={current ? current.title : (activeProject ? activeProject.name : "Notely")}
        onOpenWebsite={current ? handleOpenWebsiteForCurrent : handleOpenWebsiteFromLanding}
      />
      <div className="app-main-layout">
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => {
          let IconComponent = Info;
          if (toast.type === "success") IconComponent = CheckCircle2;
          else if (toast.type === "error") IconComponent = AlertCircle;
          else if (toast.type === "warning") IconComponent = AlertTriangle;

          return (
            <div className={`toast-item ${toast.type}`} key={toast.id}>
              <IconComponent size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={toast.action.onClick}
                  style={{
                    marginLeft: "8px",
                    background: "var(--accent-solid)",
                    color: "var(--text-on-accent)",
                    border: "none",
                    padding: "2px 6px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "11px",
                    fontWeight: "600",
                    cursor: "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                style={{
                  background: "transparent",
                  color: "inherit",
                  opacity: 0.65,
                  border: "none",
                  padding: "4px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  marginLeft: "4px"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "rgba(0,0,0,0.05)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.65"; e.currentTarget.style.background = "transparent"; }}
                aria-label="Dismiss notification"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!showTerminal && !(focusModeEnabled && current) ? (
        <div className="terminal-status-bar">
          <div className="terminal-status-left">
            <button
              className="terminal-status-button"
              type="button"
              onClick={() => setShowTerminal(true)}
              data-tooltip="Open terminal"
            >
              <Terminal size={16} />
              <strong>Terminal</strong>
              {terminalCwd && <span className="terminal-status-path">{terminalCwd}</span>}
            </button>
          </div>
          <div className="terminal-status-right" aria-label="Terminal metadata">
            <span className="terminal-meta-pill" data-tooltip="Current workspace scope">
              {activeProject?.isRoot ? "Root" : activeProject?.name || "Project"}
            </span>
            <GitStatusBar
              gitState={{
                gitAvailable: gitWorkspaceMeta.isGitRoot || gitWorkspaceMeta.branch !== "",
                isRepo: gitWorkspaceMeta.isGitRoot,
                branch: gitWorkspaceMeta.branch,
                pendingCount: gitWorkspaceMeta.pendingCount || 0,
                loading: false,
              }}
              onClick={() => setGitVCOpen(true)}
            />
            <AIStatusBar onClick={() => setAiSettingsOpen(true)} />
            {current && !(graphPanelOpen || embeddingsPageOpen || personasPageOpen || healthPageOpen || appLogsOpen || gitVCOpen) ? (
              <>
                <span className="terminal-meta-pill" data-tooltip="Editor mode and active tab">
                  {mode === "split" ? "Split" : mode === "preview" ? "Preview" : "Edit"} | {activeTab === "raw" ? "Raw" : "Formal"}
                </span>
                <span className={`terminal-meta-pill ${dirty ? "warn" : ""}`} data-tooltip="Document save status">
                  {dirty ? "Unsaved" : "Saved"}
                </span>
                {documentStats ? (
                  <>
                    <span className="terminal-meta-pill" data-tooltip="Word count for active tab">
                      {documentStats.wordCount} words
                    </span>
                    <span className="terminal-meta-pill" data-tooltip="Line count for active tab">
                      {documentStats.lineCount} lines
                    </span>
                    <span className="terminal-meta-pill" data-tooltip="Estimated reading time">
                      ~{documentStats.readMinutes} min read
                    </span>
                    <span className="terminal-meta-pill" data-tooltip="Graph database edges for this note">
                      {noteAIStats.edgeCount} edges
                    </span>
                    <span className="terminal-meta-pill" data-tooltip="Embedding database chunks for this note">
                      {noteAIStats.chunkCount} chunks
                    </span>
                  </>
                ) : null}
              </>
            ) : !current && !(graphPanelOpen || embeddingsPageOpen || personasPageOpen || healthPageOpen || appLogsOpen || gitVCOpen) ? (
              <span className="terminal-meta-pill" data-tooltip="Total note files in current view">
                {(documents || []).filter(d => d && d.entryType !== 'folder' && !d.isDirectory).length} notes
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {!current ? (
        <>
          <LandingView
            isRootLandingView={isRootLandingView}
            landingSidebarWidth={landingSidebarWidth}
            landingLayoutRef={landingLayoutRef}
            startLandingSidebarResize={startLandingSidebarResize}
            handleLandingSidebarResizerKeyDown={handleLandingSidebarResizerKeyDown}
            documents={documents}
            workspaceTaskDocuments={workspaceTaskDocuments}
            loading={loading}
            aiSidebar={aiSidebarComponent}
            aiPanelVisible={aiPanelVisible}
            isAIConfigured={isAIConfigured}
            onShowAI={() => {
              if (!isAIConfigured) {
                notify("Configure an AI provider key in AI Settings to use AI chat.", "warning");
                setAiSettingsOpen(true);
                return;
              }
              setAiPanelVisible((visible) => !visible);
            }}
            onOpenListItem={handleOpenListItem}
            onOpenReferencedDocument={(task) => handleOpenReferencedDocument(task?.filePath)}
            onOpenAllTasks={() => setAllTasksPanelOpen(true)}
            onOpenRecentNotes={() => setRecentNotesPanelOpen(true)}
            onOpenFavorites={() => setFavoritesPanelOpen(true)}
            onDashboardAction={handleDashboardAction}
            continueDashboardNotes={continueDashboardNotes}
            favoriteNotes={favoriteNotes}
            landingListQuery={landingListQuery}
            setLandingListQuery={setLandingListQuery}
            landingEntryFilter={landingEntryFilter}
            setLandingEntryFilter={setLandingEntryFilter}
            landingSortMode={landingSortMode}
            setLandingSortMode={setLandingSortMode}
            visibleDocuments={visibleDocuments}
            visibleFolderCount={visibleFolderCount}
            folderCount={folderCount}
            visibleNoteCount={visibleNoteCount}
            noteCount={noteCount}
            notesViewMode={notesViewMode}
            density={notesDensityMode}
            onToggleFavorite={handleToggleFavorite}
            onRemoveListEntry={handleRemoveListEntry}
            landingTitle={landingTitle}
            breadcrumbSegments={breadcrumbSegments}
            onLandingNavigateTo={handleLandingNavigateTo}
            updateStatus={updateStatus}
            updateDetails={updateDetails}
            onShowUpdateModal={() => setShowUpdateModal(true)}
            onDismissUpdate={() => setUpdateStatus("dismissed")}
            onCopyLinkPath={handleCopyLinkPath}
            onReloadWorkspace={handleReloadWorkspace}
          />
          {landingAssetsOpen ? (
            <OverlayDialog open={landingAssetsOpen} onClose={() => setLandingAssetsOpen(false)} ariaLabel="Assets" cardClassName="assets-dialog-card">
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
            </OverlayDialog>
          ) : null}
        </>
      ) : (
        <Suspense fallback={<div className="lazy-loading">Loading editor…</div>}>
          <DocumentDetail
            document={current}
            openTabs={openTabs}
            onReorderTabs={handleReorderTabs}
            activeTabPath={activeTabPath}
            tabStates={tabStates}
            documents={documents}
            onSelectTab={openDocument}
            onCloseTab={handleCloseTab}
            onNewTab={() => setNoteDialogOpen(true)}
            onNewFolder={() => setFolderDialogOpen(true)}
            onCloseOthers={handleCloseOthers}
            onCloseToRight={handleCloseToRight}
            onCloseSaved={handleCloseSaved}
            onCloseAll={handleCloseAll}
            onOpenInEditor={handleOpenInEditor}
            onRevealInExplorer={handleRevealInExplorer}
            onCopyLinkPath={handleCopyLinkPath}
            history={history}
            workspacePath={notesFolderPath}
            branch={gitWorkspaceMeta.branch}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            mode={mode}
            setMode={setMode}
            onChange={setCurrent}
            onSave={saveDocument}
            onRenameTitle={handleRenameCurrentDocument}
            ignoredSpellingWords={ignoredSpellingWords}
            onIgnoreSpellingWord={(word) => {
              const normalized = String(word || "").trim().toLowerCase();
              if (!normalized) return;
              setIgnoredSpellingWords((current) => {
                const next = normalizeIgnoredWords(current);
                if (next.includes(normalized)) return next;
                return [...next, normalized];
              });
              notify?.(`Added "${word}" to dictionary.`, "success");
            }}
            onRemoveIgnoredSpellingWord={handleRemoveDictionaryWord}
            onClearIgnoredSpellingWords={handleClearDictionary}
            onForceSaveDocument={async (nextContent) => {
              await saveDocument({ reason: "diagram-or-code-save", silent: true, content: nextContent });
            }}
            autosaveEnabled={autosaveEnabled}
            setAutosaveEnabled={setAutosaveEnabled}
            onRefreshHistory={async () => setHistory([])}
            saving={saving}
            dirty={dirty}
            menuAction={documentMenuAction}
            onNotify={notify}
            onBack={handleGoHome}
            breadcrumbs={noteBreadcrumbSegments}
            onNavigateBreadcrumb={async (targetPath) => {
              const didLeave = await handleGoHome();
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
              setAiPanelVisible((visible) => !visible);
            }}
            onOpenAISettings={() => setAiSettingsOpen(true)}
            onOpenDocument={handleOpenReferencedDocumentFromUI}
            initialLine={initialLine}
            onLineJumped={() => setInitialLine(null)}
            workspaceTagSuggestions={workspaceTagSuggestions}
            workspaceStorageScope={workspaceStorageScope}
            typoCheckEnabled={typoCheckEnabled}
            screenCaptureMode={screenCaptureMode}
            showOriginalImages={previewImageMode === "original"}
            inlineLinkedMarkdown={embeddedMarkdownMode === "inline"}
            outlineEnabled={outlineEnabled}
            onOutlineEnabledChange={setOutlineEnabled}
            focusModeEnabled={focusModeEnabled}
            onFocusModeChange={setFocusModeEnabled}
            onReloadFromDisk={(filePath) => handleReloadCurrentFromDisk(filePath)}
            aiSidebar={aiSidebarComponent}
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
        <OverlayDialog open={noteDialogOpen} onClose={() => setNoteDialogOpen(false)} ariaLabel="Create note">
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
        </OverlayDialog>
      ) : null}

      {folderDialogOpen ? (
        <OverlayDialog open={folderDialogOpen} onClose={() => setFolderDialogOpen(false)} ariaLabel="Create folder">
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
            <label className="overlay-dialog-field">
              <span>Parent folder</span>
              <select
                value={selectedParentFolder}
                onChange={(event) => setSelectedParentFolder(event.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--surface-border)",
                  background: "var(--surface-bg)",
                  color: "var(--text-strong)",
                  fontSize: "12.5px",
                  marginTop: "4px",
                  fontFamily: "inherit"
                }}
              >
                {workspaceFolders.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="overlay-dialog-actions">
              <button className="primary-button" onClick={handleCreateFolder} disabled={creatingFolder} type="button">
                {creatingFolder ? "Creating..." : "Create Folder"}
              </button>
            </div>
        </OverlayDialog>
      ) : null}

      {recentWorkspacesDialogOpen ? (
        <OverlayDialog open={recentWorkspacesDialogOpen} onClose={() => setRecentWorkspacesDialogOpen(false)} ariaLabel="Open recent workspace">
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
                      data-tooltip={workspacePath}
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
        </OverlayDialog>
      ) : null}

      {workspaceExportOpen ? (
        <Suspense fallback={<div className="lazy-loading">Loading export options...</div>}>
          <WorkspaceExportDialog
            isOpen={workspaceExportOpen}
            values={workspaceExportOptions}
            loading={workspaceExportBusy}
            progress={workspaceExportProgress}
            onClose={() => {
              if (!workspaceExportBusy) setWorkspaceExportOpen(false);
            }}
            onChange={handleWorkspaceExportOptionChange}
            onBrowse={handleBrowseWorkspaceExportDestination}
            onExport={handleRunWorkspaceExport}
          />
        </Suspense>
      ) : null}

      {settingsOpen ? (
        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => {
            setSettingsOpen(false);
            refreshAIConfiguration();
          }}
          activeTab={settingsTab}
          themePreference={themePreference}
          onThemeChange={handleSetTheme}
          zoomFactor={zoomFactor}
          onZoomChange={handleSetZoom}
          autosaveEnabled={autosaveEnabled}
          onAutosaveToggle={setAutosaveEnabled}
          typoCheckEnabled={typoCheckEnabled}
          onTypoCheckToggle={setTypoCheckEnabled}
          outlineEnabled={outlineEnabled}
          onOutlineToggle={setOutlineEnabled}
          previewImageMode={previewImageMode}
          onPreviewImageModeChange={setPreviewImageMode}
          embeddedMarkdownMode={embeddedMarkdownMode}
          onEmbeddedMarkdownModeToggle={setEmbeddedMarkdownMode}
          p2pStatus={p2pStatus}
          p2pLoading={p2pStatusLoading}
          fullSyncProgressByPeer={fullSyncProgressByPeer}
          onRefreshP2P={handleOpenP2PStatus}
          onStartP2PDiscovery={handleStartP2PDiscovery}
          onStopP2PDiscovery={handleStopP2PDiscovery}
          onSetP2PDeviceName={handleSetP2PDeviceName}
          onSetP2PKeyPolicyDays={handleSetP2PKeyPolicyDays}
          onCreateP2PInvite={handleCreateP2PInvite}
          onPairP2PWithCode={handlePairP2PWithCode}
          onManualP2PConnect={handleManualP2PConnect}
          onRemoveTrustedP2PPeer={handleRemoveTrustedP2PPeer}
          onRotateP2PWorkspaceKeys={handleRotateP2PWorkspaceKeys}
        />
      ) : null}

      {workspaceActivityOpen ? (
        <OverlayDialog open={workspaceActivityOpen} onClose={() => setWorkspaceActivityOpen(false)} ariaLabel="Workspace activity" cardClassName="activity-dialog-card">
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
        </OverlayDialog>
      ) : null}

      {p2pSyncHelpOpen ? (
        <OverlayDialog open={p2pSyncHelpOpen} onClose={() => setP2PSyncHelpOpen(false)} ariaLabel="P2P sync notes">
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
        </OverlayDialog>
      ) : null}

      {conflictResolutionOpen && conflictResolutionEntry ? (
        <OverlayDialog open={conflictResolutionOpen && Boolean(conflictResolutionEntry)} onClose={() => setConflictResolutionOpen(false)} ariaLabel="Resolve sync conflict" cardClassName="conflict-resolve-dialog-card">
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
        </OverlayDialog>
      ) : null}

      {syncSelfTestOpen ? (
        <OverlayDialog open={syncSelfTestOpen} onClose={() => setSyncSelfTestOpen(false)} ariaLabel="P2P sync self-test">
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
        </OverlayDialog>
      ) : null}

      {conflictCenterOpen ? (
        <OverlayDialog open={conflictCenterOpen} onClose={() => setConflictCenterOpen(false)} ariaLabel="P2P conflict center" cardClassName="p2p-status-dialog-card">
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
                        <td className="mono-cell" data-tooltip={entry.conflictPath}>
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
        </OverlayDialog>
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
            initialQuery={globalSearchQuery}
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


      {tasksPanelOpen ? (
        <Suspense fallback={null}>
          <TasksPanel
            isOpen={tasksPanelOpen}
            documents={workspaceTaskDocuments}
            onClose={() => setTasksPanelOpen(false)}
            onOpenNote={(group) => handleOpenReferencedDocument(group?.filePath)}
          />
        </Suspense>
      ) : null}

      {recentNotesPanelOpen ? (
        <Suspense fallback={null}>
          <NoteListPanel
            isOpen={recentNotesPanelOpen}
            title="Recent Notes"
            type="recent"
            notes={recentDashboardNotes}
            emptyMessage="No recent notes available."
            onClose={() => setRecentNotesPanelOpen(false)}
            onOpenNote={(note) => handleOpenListItem(note)}
          />
        </Suspense>
      ) : null}

      {favoritesPanelOpen ? (
        <Suspense fallback={null}>
          <NoteListPanel
            isOpen={favoritesPanelOpen}
            title="Favorites"
            type="favorites"
            notes={favoriteDashboardNotes}
            emptyMessage="No favorites yet. Star notes from the list."
            onClose={() => setFavoritesPanelOpen(false)}
            onOpenNote={(note) => handleOpenListItem(note)}
          />
        </Suspense>
      ) : null}

      {allTasksPanelOpen ? (
        <Suspense fallback={null}>
          <AllTasksPanel
            isOpen={allTasksPanelOpen}
            documents={workspaceTaskDocuments}
            onClose={() => setAllTasksPanelOpen(false)}
            onOpenNote={(group) => handleOpenReferencedDocument(group?.filePath)}
          />
        </Suspense>
      ) : null}



      {markdownGuideOpen ? (
        <Suspense fallback={null}>
          <MarkdownGuideModal
            open={markdownGuideOpen}
            onClose={() => setMarkdownGuideOpen(false)}
          />
        </Suspense>
      ) : null}

      {dictionaryOpen ? (
        <Suspense fallback={null}>
          <DictionaryModal
            open={dictionaryOpen}
            onClose={() => setDictionaryOpen(false)}
            ignoredSpellingWords={ignoredSpellingWords}
            onAddWord={handleAddDictionaryWord}
            onRemoveWord={handleRemoveDictionaryWord}
          />
        </Suspense>
      ) : null}

      {trashDialogOpen ? (
        <TrashDialog
          isOpen={trashDialogOpen}
          onClose={() => setTrashDialogOpen(false)}
          onRestored={loadDocumentsData}
        />
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

      {feedbackOpen ? (
        <Suspense fallback={null}>
          <FeedbackModal
            open={feedbackOpen}
            onClose={() => setFeedbackOpen(false)}
            themePreference={themePreference}
          />
        </Suspense>
      ) : null}

      {showUpdateModal ? (
        <UpdateModal
          isOpen={showUpdateModal}
          onClose={() => setShowUpdateModal(false)}
          status={updateStatus}
          details={updateDetails}
        />
      ) : null}

      {helpConfirmationOpen ? (
        <Suspense fallback={null}>
          <HelpConfirmationModal
            open={helpConfirmationOpen}
            onClose={() => setHelpConfirmationOpen(false)}
          />
        </Suspense>
      ) : null}

      {exportImportOpen && (
        <Suspense fallback={null}>
          <ExportImportModal
            isOpen={exportImportOpen}
            mode={exportImportMode}
            onClose={() => setExportImportOpen(false)}
            notify={notify}
            reloadDocuments={loadDocumentsData}
          />
        </Suspense>
      )}

      {!onboardingComplete && (
        <OnboardingFlow
          onComplete={handleOnboardingComplete}
          defaultNotesPath={defaultNotesPath}
          themePreference={themePreference}
          onThemeChange={(theme) => {
            const isDark = theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
            setEffectiveTheme(isDark ? "dark" : "light");
            setThemePreferenceState(theme);
          }}
          appInfo={appInfo}
          canClose={Boolean(notesFolderPath)}
        />
      )}

      {!appInfo.isPackaged && (
        <button
          type="button"
          onClick={handleResetOnboarding}
          style={{
            position: "fixed",
            bottom: "32px",
            left: "12px",
            zIndex: 10000,
            background: "var(--status-danger-bg)",
            color: "var(--status-danger-text)",
            border: "1px solid var(--status-danger-border)",
            padding: "var(--space-2) var(--space-4)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            fontSize: "var(--font-size-caption)",
            fontWeight: "bold",
            boxShadow: "var(--shadow-md)"
          }}
        >
          Dev: Reset Onboarding
        </button>
      )}

      {gitVCOpen && (
        <div style={{ position: "fixed", top: "32px", right: 0, bottom: "28px", left: 0, zIndex: 1000, display: "flex", flexDirection: "column", background: "var(--app-bg)", color: "var(--app-text)" }}>
          <Suspense fallback={<div className="lazy-loading">Loading Version Control…</div>}>
            <GitVersionControlPage
              workspacePath={notesFolderPath}
              onBack={() => setGitVCOpen(false)}
              onNotify={notify}
              onGitStateChange={handleGitStateChange}
              currentFilePath={current?.filePath}
              initialTab={gitVCInitialTab}
              documents={documents}
            />
          </Suspense>
        </div>
      )}

      {globalCommitDialogOpen && (
        <Suspense fallback={null}>
          <GitCommitDialog
            open={globalCommitDialogOpen}
            onClose={() => setGlobalCommitDialogOpen(false)}
            onCommit={async (payload) => {
              const result = await gitCommit({ workspacePath: notesFolderPath, ...payload });
              if (!result?.ok) throw new Error(result?.error || "Commit failed.");
              notify("Committed successfully.", "success");
              void refreshGitWorkspaceMeta();
            }}
            stagedFiles={gitWorkspaceMeta.files || []}
            workspacePath={notesFolderPath}
            currentFilePath={current?.filePath}
          />
        </Suspense>
      )}

      {graphPanelOpen && (
        <div style={{ position: "fixed", top: "32px", right: 0, bottom: "28px", left: 0, zIndex: 1000, display: "flex", flexDirection: "column", background: "var(--app-bg)", color: "var(--app-text)" }}>
          <Suspense fallback={<div className="lazy-loading">Loading Knowledge Graph…</div>}>
            <KnowledgeGraph
              onBack={() => setGraphPanelOpen(false)}
            />
          </Suspense>
        </div>
      )}

      {embeddingsPageOpen && (
        <div style={{ position: "fixed", top: "32px", right: 0, bottom: "28px", left: 0, zIndex: 1000, display: "flex", flexDirection: "column", background: "var(--app-bg)", color: "var(--app-text)" }}>
          <Suspense fallback={<div className="lazy-loading">Loading Embeddings Engine…</div>}>
            <EmbeddingsPage
              onBack={() => setEmbeddingsPageOpen(false)}
            />
          </Suspense>
        </div>
      )}

      {personasPageOpen && (
        <div style={{ position: "fixed", top: "32px", right: 0, bottom: "28px", left: 0, zIndex: 1000, display: "flex", flexDirection: "column", background: "var(--app-bg)", color: "var(--app-text)" }}>
          <Suspense fallback={<div className="lazy-loading">Loading Personas…</div>}>
            <AIPersonasManager
              onBack={() => setPersonasPageOpen(false)}
            />
          </Suspense>
        </div>
      )}

      {healthPageOpen && (
        <div style={{ position: "fixed", top: "32px", right: 0, bottom: "28px", left: 0, zIndex: 1000, display: "flex", flexDirection: "column", background: "var(--app-bg)", color: "var(--app-text)" }}>
          <Suspense fallback={<div className="lazy-loading">Loading Health & Diagnostics…</div>}>
            <AIHealthPage
              onBack={() => setHealthPageOpen(false)}
            />
          </Suspense>
        </div>
      )}

      {appLogsOpen && (
        <div style={{ position: "fixed", top: "32px", right: 0, bottom: "28px", left: 0, zIndex: 1000, display: "flex", flexDirection: "column", background: "var(--app-bg)", color: "var(--app-text)" }}>
          <Suspense fallback={<div className="lazy-loading">Loading System & Application Logs…</div>}>
            <AppLogsPage
              onBack={() => setAppLogsOpen(false)}
            />
          </Suspense>
        </div>
      )}


      </div>
      <NotePreviewModal
        open={globalNotePreviewTarget.open}
        filePath={globalNotePreviewTarget.filePath}
        lineNum={globalNotePreviewTarget.lineNum}
        onClose={() => setGlobalNotePreviewTarget({ open: false, filePath: null, lineNum: null })}
        onOpenDocument={(path, line) => {
          handleOpenReferencedDocumentFromUI(path, line);
          setGlobalNotePreviewTarget({ open: false, filePath: null, lineNum: null });
        }}
      />
      <GlobalTooltip />
    </div>
  );
}
