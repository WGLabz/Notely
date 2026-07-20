import React, { createContext, useContext, useState } from "react";

const UIStateContext = createContext(null);

export function UIStateProvider({ children }) {
  // Dialog / Modal Visibility States
  const [landingAssetsOpen, setLandingAssetsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [markdownGuideOpen, setMarkdownGuideOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [helpConfirmationOpen, setHelpConfirmationOpen] = useState(false);
  const [gitVCOpen, setGitVCOpen] = useState(false);
  const [gitVCInitialTab, setGitVCInitialTab] = useState("status");
  const [graphPanelOpen, setGraphPanelOpen] = useState(false);
  const [embeddingsPageOpen, setEmbeddingsPageOpen] = useState(false);
  const [personasPageOpen, setPersonasPageOpen] = useState(false);
  const [healthPageOpen, setHealthPageOpen] = useState(false);
  const [globalCommitDialogOpen, setGlobalCommitDialogOpen] = useState(false);
  const [tasksPanelOpen, setTasksPanelOpen] = useState(false);
  const [allTasksPanelOpen, setAllTasksPanelOpen] = useState(false);
  const [recentNotesPanelOpen, setRecentNotesPanelOpen] = useState(false);
  const [favoritesPanelOpen, setFavoritesPanelOpen] = useState(false);
  const [trashDialogOpen, setTrashDialogOpen] = useState(false);

  // App Sizing / Info / Onboarding
  const [workspaceExportOpen, setWorkspaceExportOpen] = useState(false);
  const [workspaceExportBusy, setWorkspaceExportBusy] = useState(false);
  const [workspaceExportProgress, setWorkspaceExportProgress] = useState({ phase: "", percent: 0 });
  const [workspaceExportOptions, setWorkspaceExportOptions] = useState(null);
  const [onboardingComplete, setOnboardingCompleteState] = useState(true);
  const [defaultNotesPath, setDefaultNotesPath] = useState("");
  const [themePreference, setThemePreferenceState] = useState("auto");
  const [effectiveTheme, setEffectiveTheme] = useState("light");
  const [zoomFactor, setZoomFactorState] = useState(1);

  const value = {
    // Dialogs
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
    globalCommitDialogOpen, setGlobalCommitDialogOpen,
    tasksPanelOpen, setTasksPanelOpen,
    allTasksPanelOpen, setAllTasksPanelOpen,
    recentNotesPanelOpen, setRecentNotesPanelOpen,
    favoritesPanelOpen, setFavoritesPanelOpen,
    trashDialogOpen, setTrashDialogOpen,

    // Export & System states
    workspaceExportOpen, setWorkspaceExportOpen,
    workspaceExportBusy, setWorkspaceExportBusy,
    workspaceExportProgress, setWorkspaceExportProgress,
    workspaceExportOptions, setWorkspaceExportOptions,
    onboardingComplete, setOnboardingCompleteState,
    defaultNotesPath, setDefaultNotesPath,
    themePreference, setThemePreferenceState,
    effectiveTheme, setEffectiveTheme,
    zoomFactor, setZoomFactorState,
  };

  return <UIStateContext.Provider value={value}>{children}</UIStateContext.Provider>;
}

export function useUIState() {
  const context = useContext(UIStateContext);
  if (!context) {
    throw new Error("useUIState must be used within a UIStateProvider");
  }
  return context;
}
