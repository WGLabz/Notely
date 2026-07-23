import { useEffect, useRef, useState, useMemo } from "react";
import useConfirm from "./useConfirm";
import { useWorkspaceScopedStorage } from "./useWorkspaceScopedStorage";
import {
  createFolder,
  createDocument,
  deleteFolder as deleteFolderApi,
  deleteDocument as deleteDocumentApi,
  getNotesRootSetting,
  listProjects,
  listDocuments,
  pickFolder,
  openInEditor,
  openWebView,
  markDocumentOpened,
  readDocument,
  renameDocument as renameDocumentApi,
  saveDocument as saveDocumentApi,
  setNotesRootSetting,
  revealWorkspaceInExplorer,
} from "../services/electronService";

function normalizePathValue(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    for (const key of ["filePath", "rootPath", "path", "label", "name"]) {
      if (typeof value[key] === "string" && value[key].trim()) {
        return value[key].trim();
      }
    }
  }

  return "";
}

function normalizeWorkspacePathList(entries) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const normalized = [];

  for (const entry of entries) {
    const value = normalizePathValue(entry);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

export function useDocumentManager({ notify }) {
  const { confirm } = useConfirm();
  const [documents, setDocuments] = useState([]);
  const [current, setCurrent] = useState(null);
  const [savedHash, setSavedHash] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("raw");
  const [error, setError] = useState("");
  const [_projects, setProjects] = useState([]);
  const [activeProject, setActiveProjectState] = useState(null);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [creatingNote, setCreatingNote] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [workspaceFolders, setWorkspaceFolders] = useState([]);
  const [selectedParentFolder, setSelectedParentFolder] = useState("");
  const [recentWorkspacesDialogOpen, setRecentWorkspacesDialogOpen] = useState(false);
  const [notesFolderPath, setNotesFolderPath] = useState("");
  const [recentWorkspacePaths, setRecentWorkspacePaths] = useState([]);
  const [savingNotesFolder, setSavingNotesFolder] = useState(false);
  const [documentMenuAction, setDocumentMenuAction] = useState(null);
  const [landingFolderPath, setLandingFolderPath] = useState("");
  const [initialLine, setInitialLine] = useState(null);

  const workspaceStorageScope = useMemo(() => {
    const rawWorkspaceId = activeProject?.slug || activeProject?.rootPath || notesFolderPath || "default";
    return encodeURIComponent(String(rawWorkspaceId));
  }, [activeProject, notesFolderPath]);

  const [openTabs, setOpenTabs] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:open-tabs",
    defaultValue: [],
  });

  const [activeTabPath, setActiveTabPath] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:active-tab-path",
    defaultValue: null,
  });

  const [tabStates, setTabStates] = useState({});
  const tabStatesRef = useRef(tabStates);
  tabStatesRef.current = tabStates;

  const lastScopeRef = useRef(workspaceStorageScope);
  useEffect(() => {
    if (lastScopeRef.current !== workspaceStorageScope) {
      lastScopeRef.current = workspaceStorageScope;
      setOpenTabs([]);
      setActiveTabPath(null);
      setTabStates({});
      setCurrent(null);
      setHistory([]);
    }
  }, [workspaceStorageScope, setOpenTabs, setActiveTabPath, setCurrent, setHistory]);

  useEffect(() => {
    setActiveTabPath(null);
    setCurrent(null);
  }, [setActiveTabPath, setCurrent]);

  useEffect(() => {
    if (!activeTabPath) {
      setCurrent(null);
      setSavedHash("");
      return;
    }

    const cached = tabStatesRef.current[activeTabPath];
    if (cached) {
      setCurrent(cached.doc);
      setSavedHash(cached.savedHash);
    } else {
      setLoading(true);
      readDocument(activeTabPath)
        .then((doc) => {
          const hash = JSON.stringify({
            header: doc.header || "",
            rawNotes: doc.rawNotes || "",
            cleansed: doc.cleansed || "",
          });
          setTabStates((prev) => ({
            ...prev,
            [activeTabPath]: { doc, savedHash: hash },
          }));
          setCurrent(doc);
          setSavedHash(hash);
        })
        .catch((err) => {
          setError(err?.message || "Unable to read note.");
          setOpenTabs((prev) => prev.filter((p) => p !== activeTabPath));
          setActiveTabPath(null);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [activeTabPath, setActiveTabPath, setOpenTabs]);

  // Pre-load all open tabs in parallel to ensure switching is instantaneous
  useEffect(() => {
    if (!openTabs || openTabs.length === 0) return;

    const unloaded = openTabs.filter((path) => !tabStatesRef.current[path]);
    if (unloaded.length === 0) return;

    Promise.all(
      unloaded.map(async (filePath) => {
        try {
          const doc = await readDocument(filePath);
          const hash = JSON.stringify({
            header: doc.header || "",
            rawNotes: doc.rawNotes || "",
            cleansed: doc.cleansed || "",
          });
          return { filePath, doc, hash };
        } catch {
          return null;
        }
      })
    ).then((results) => {
      const updates = {};
      results.forEach((res) => {
        if (res) {
          updates[res.filePath] = { doc: res.doc, savedHash: res.hash };
        }
      });
      if (Object.keys(updates).length > 0) {
        setTabStates((prev) => ({
          ...prev,
          ...updates,
        }));
      }
    });
  }, [openTabs]);

  // Recursively list all folder paths in the workspace starting from the root
  const listAllFoldersInWorkspace = async (rootPath) => {
    const folders = [{ path: rootPath, name: "Workspace Root (Root)" }];
    const queue = [rootPath];
    const visited = new Set([rootPath]);

    while (queue.length > 0) {
      const currentPath = queue.shift();
      try {
        const entries = await listDocuments(currentPath);
        for (const entry of entries || []) {
          if (entry.entryType === "folder") {
            const key = entry.filePath;
            if (!visited.has(key)) {
              visited.add(key);
              const rel = key.replace(rootPath, "").replace(/^[\\/]/, "");
              folders.push({
                path: key,
                name: rel || entry.title || entry.filePath,
              });
              queue.push(key);
            }
          }
        }
      } catch {
        // ignore errors reading subfolders
      }
    }
    return folders;
  };

  useEffect(() => {
    if (folderDialogOpen) {
      const rootPath = activeProject?.rootPath || notesFolderPath;
      if (rootPath) {
        setSelectedParentFolder(landingFolderPath || rootPath);
        setWorkspaceFolders([{ path: rootPath, name: "Workspace Root (Root)" }]);
        
        listAllFoldersInWorkspace(rootPath).then((list) => {
          setWorkspaceFolders(list);
        });
      }
    }
  }, [folderDialogOpen, activeProject, notesFolderPath, landingFolderPath]);

  useEffect(() => {
    if (current && activeTabPath) {
      setTabStates((prev) => {
        const existing = prev[activeTabPath];
        if (existing && existing.doc === current) return prev;
        return {
          ...prev,
          [activeTabPath]: {
            doc: current,
            savedHash: existing ? existing.savedHash : JSON.stringify({
              header: current.header || "",
              rawNotes: current.rawNotes || "",
              cleansed: current.cleansed || "",
            }),
          },
        };
      });
    }
  }, [current, activeTabPath]);

  const loadDocumentsRequestRef = useRef(0);

  const dirty =
    current
      ? savedHash !==
        JSON.stringify({
          header: current.header,
          rawNotes: current.rawNotes,
          cleansed: current.cleansed,
        })
      : false;

  const normalizedProjectRoot = normalizePathValue(activeProject?.rootPath)
    .replace(/[\\/]+$/, "")
    .toLowerCase();
  const normalizedLandingFolder = normalizePathValue(landingFolderPath || activeProject?.rootPath)
    .replace(/[\\/]+$/, "")
    .toLowerCase();
  const canNavigateUp = Boolean(
    normalizedProjectRoot &&
    normalizedLandingFolder &&
    normalizedLandingFolder !== normalizedProjectRoot
  );

  function applyProjectState(result) {
    setProjects(result?.projects || []);
    if (result?.activeProject && typeof result.activeProject === "object") {
      setActiveProjectState({
        ...result.activeProject,
        rootPath: normalizePathValue(result.activeProject.rootPath),
      });
      return;
    }
    setActiveProjectState(null);
  }

  async function loadDocumentsData() {
    const requestId = ++loadDocumentsRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const projectState = await listProjects();
      if (loadDocumentsRequestRef.current !== requestId) return;
      applyProjectState(projectState);
      const baseFolder = normalizePathValue(projectState?.activeProject?.rootPath);
      setLandingFolderPath(baseFolder);
      const docs = await listDocuments(baseFolder);
      if (loadDocumentsRequestRef.current !== requestId) return;
      setDocuments(docs);
      const notesSetting = await getNotesRootSetting();
      if (loadDocumentsRequestRef.current !== requestId) return;
      setNotesFolderPath(normalizePathValue(notesSetting?.notesRoot));
      setRecentWorkspacePaths(normalizeWorkspacePathList(notesSetting?.recentWorkspaces));
    } catch (err) {
      if (loadDocumentsRequestRef.current !== requestId) return;
      setError(err?.message || "Unable to load documents.");
    } finally {
      if (loadDocumentsRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  async function openDocument(filePath, options = {}) {
    setError("");
    setDocumentMenuAction(null);
    setInitialLine(options.lineNumber || null);

    setOpenTabs((prev) => {
      if (prev.includes(filePath)) return prev;
      return [...prev, filePath];
    });

    const cached = tabStates[filePath];
    if (cached) {
      setActiveTabPath(filePath);
      setCurrent(cached.doc);
      setSavedHash(cached.savedHash);
    } else {
      const doc = await readDocument(filePath);
      await markDocumentOpened(filePath);
      const hash = JSON.stringify({
        header: doc.header || "",
        rawNotes: doc.rawNotes || "",
        cleansed: doc.cleansed || "",
      });
      setTabStates((prev) => ({
        ...prev,
        [filePath]: { doc, savedHash: hash },
      }));
      setActiveTabPath(filePath);
      setCurrent(doc);
      setSavedHash(hash);
    }

    if (!options.preserveActiveTab) {
      setActiveTab("raw");
    }
    setHistory([]);
  }

  async function saveDocument(options = {}) {
    if (!current) return;
    const reason = options?.reason || "manual-save";
    const silent = Boolean(options?.silent);
    const overrideContent = options?.content;
    const targetField = options?.field || (current.hasCleansed && !current.hasRawNotes ? "cleansed" : "rawNotes");
    setSaving(true);
    setError("");

    const rawNotesToSave = (overrideContent !== undefined && targetField === "rawNotes")
      ? overrideContent
      : (current.rawNotes || "");
    const cleansedToSave = (overrideContent !== undefined && targetField === "cleansed")
      ? overrideContent
      : (current.cleansed || "");

    try {
      const saved = await saveDocumentApi({
        filePath: current.filePath,
        header: current.header || "",
        rawNotes: rawNotesToSave,
        cleansed: cleansedToSave,
        reason,
      });
      
      const newHash = JSON.stringify({
        header: saved.header || "",
        rawNotes: saved.rawNotes || "",
        cleansed: saved.cleansed || "",
      });

      setTabStates((prev) => ({
        ...prev,
        [saved.filePath]: { doc: saved, savedHash: newHash },
      }));

      setCurrent(saved);
      setSavedHash(newHash);
      setHistory([]);
      await loadDocumentsData();
      if (!silent) {
        notify("Note saved.", "success");
      }
    } catch (err) {
      setError(err?.message || "Unable to save document.");
      if (!silent) {
        notify(err?.message || "Unable to save document.", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReloadCurrentFromDisk() {
    if (!current?.filePath) return;

    if (dirty) {
      const confirmed = await confirm({
        title: "Discard Changes?",
        message: "Reload this note from disk and discard unsaved changes?",
        confirmLabel: "Reload",
        cancelLabel: "Cancel",
        variant: "danger"
      });
      if (!confirmed) return;
    }

    try {
      await openDocument(current.filePath, { preserveActiveTab: true });
      notify("Reloaded latest file from disk.", "success");
    } catch (err) {
      setError(err?.message || "Unable to reload document.");
      notify(err?.message || "Unable to reload document.", "error");
    }
  }

  async function handleRenameCurrentDocument(title) {
    if (!current?.filePath) return false;

    const nextTitle = String(title || "").trim();
    if (!nextTitle) {
      notify("Enter a note title first.", "warning");
      return false;
    }

    const oldPath = current.filePath;

    try {
      if (dirty) {
        await saveDocument({ reason: "rename-save", silent: true });
      }

      const renamed = await renameDocumentApi(oldPath, nextTitle);
      const newPath = renamed.filePath;

      const hash = JSON.stringify({
        header: renamed.header || "",
        rawNotes: renamed.rawNotes || "",
        cleansed: renamed.cleansed || "",
      });

      setTabStates((prev) => {
        const next = { ...prev };
        delete next[oldPath];
        next[newPath] = { doc: renamed, savedHash: hash };
        return next;
      });

      setOpenTabs((prev) => {
        return prev.map((path) => (path === oldPath ? newPath : path));
      });

      setActiveTabPath(newPath);
      setCurrent(renamed);
      setSavedHash(hash);
      setHistory([]);
      await loadDocumentsData();
      notify("Note renamed.", "success");
      return true;
    } catch (err) {
      setError(err?.message || "Unable to rename note.");
      notify(err?.message || "Unable to rename note.", "error");
      return false;
    }
  }

  async function handleDeleteCurrentDocument() {
    if (!current?.filePath) return false;

    const confirmed = await confirm({
      title: "Remove Note?",
      message: dirty
        ? `Move "${current.title}" to the removed folder and discard unsaved changes?`
        : `Move "${current.title}" to the removed folder?`,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      variant: "danger"
    });
    if (!confirmed) return false;

    const deletedPath = current.filePath;

    try {
      await deleteDocumentApi(deletedPath);

      let nextActivePath = null;
      setOpenTabs((prev) => {
        const filtered = prev.filter((path) => path !== deletedPath);
        if (filtered.length > 0) {
          const index = prev.indexOf(deletedPath);
          const nextIndex = Math.min(index, filtered.length - 1);
          nextActivePath = filtered[nextIndex];
        }
        return filtered;
      });

      setTabStates((prev) => {
        const next = { ...prev };
        delete next[deletedPath];
        return next;
      });

      setActiveTabPath(nextActivePath);
      setHistory([]);
      await loadDocumentsData();
      notify("Note moved to removed folder.", "success");
      return true;
    } catch (err) {
      setError(err?.message || "Unable to delete note.");
      notify(err?.message || "Unable to delete note.", "error");
      return false;
    }
  }

  async function handleDeleteCurrentFolder() {
    const projectRoot = normalizePathValue(activeProject?.rootPath).replace(/[\\/]+$/, "");
    const currentFolder = normalizePathValue(landingFolderPath || projectRoot).replace(/[\\/]+$/, "");
    if (!projectRoot || !currentFolder) return false;
    if (projectRoot.toLowerCase() === currentFolder.toLowerCase()) {
      notify("Project root folder cannot be removed.", "info");
      return false;
    }

    const folderName = currentFolder.replace(/^.*[\\/]/, "") || "current folder";
    const confirmed = await confirm({
      title: "Remove Folder?",
      message: `Move folder "${folderName}" to the removed folder?`,
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      variant: "danger"
    });
    if (!confirmed) return false;

    const parentPath = currentFolder.replace(/[\\/][^\\/]+$/, "") || projectRoot;
    try {
      const result = await deleteFolderApi(currentFolder);
      const nextParentPath = normalizePathValue(result?.parentPath || parentPath || projectRoot);
      setCurrent(null);
      setHistory([]);
      setError("");
      setLoading(true);
      setLandingFolderPath(nextParentPath);
      setDocuments(await listDocuments(nextParentPath));
      notify("Folder moved to removed folder.", "success");
      return true;
    } catch (err) {
      setError(err?.message || "Unable to remove folder.");
      notify(err?.message || "Unable to remove folder.", "error");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveListEntry(entry) {
    if (!entry?.filePath) return false;
    const basePath = landingFolderPath || activeProject?.rootPath;

    if (entry.entryType === "folder") {
      const projectRoot = normalizePathValue(activeProject?.rootPath).replace(/[\\/]+$/, "").toLowerCase();
      const folderPath = normalizePathValue(entry.filePath).replace(/[\\/]+$/, "").toLowerCase();
      if (projectRoot && folderPath && projectRoot === folderPath) {
        notify("Project root folder cannot be removed.", "info");
        return false;
      }

      const confirmed = await confirm({
        title: "Remove Folder?",
        message: `Move folder "${entry.title}" to the removed folder?`,
        confirmLabel: "Remove",
        cancelLabel: "Cancel",
        variant: "danger"
      });
      if (!confirmed) return false;

      try {
        await deleteFolderApi(entry.filePath);
        setError("");
        setDocuments(await listDocuments(basePath));
        notify("Folder moved to removed folder.", "success");
        return true;
      } catch (err) {
        setError(err?.message || "Unable to remove folder.");
        notify(err?.message || "Unable to remove folder.", "error");
        return false;
      }
    }

    if (entry.entryType === "file") {
      const confirmed = await confirm({
        title: "Remove Note?",
        message: `Move note "${entry.title}" to the removed folder?`,
        confirmLabel: "Remove",
        cancelLabel: "Cancel",
        variant: "danger"
      });
      if (!confirmed) return false;

      try {
        await deleteDocumentApi(entry.filePath);

        setOpenTabs((prev) => {
          const filtered = prev.filter((p) => p !== entry.filePath);
          if (activeTabPath === entry.filePath) {
            let nextActivePath = null;
            if (filtered.length > 0) {
              const index = prev.indexOf(entry.filePath);
              const nextIndex = Math.min(index, filtered.length - 1);
              nextActivePath = filtered[nextIndex];
            }
            setActiveTabPath(nextActivePath);
          }
          return filtered;
        });

        setTabStates((prev) => {
          const next = { ...prev };
          delete next[entry.filePath];
          return next;
        });

        setHistory([]);
        setError("");
        setDocuments(await listDocuments(basePath));
        notify("Note moved to removed folder.", "success");
        return true;
      } catch (err) {
        setError(err?.message || "Unable to remove note.");
        notify(err?.message || "Unable to remove note.", "error");
        return false;
      }
    }

    return false;
  }

  async function handleCreateNote() {
    const title = newNoteTitle.trim();
    if (!title) {
      notify("Enter a note title first.", "warning");
      return;
    }

    setCreatingNote(true);
    setError("");
    try {
      const basePath = landingFolderPath || activeProject?.rootPath;
      const created = await createDocument(title, basePath);
      const newPath = created.filePath;
      setNewNoteTitle("");
      setDocuments(await listDocuments(basePath));

      const hash = JSON.stringify({
        header: created.header || "",
        rawNotes: created.rawNotes || "",
        cleansed: created.cleansed || "",
      });

      setTabStates((prev) => ({
        ...prev,
        [newPath]: { doc: created, savedHash: hash },
      }));

      setOpenTabs((prev) => {
        if (prev.includes(newPath)) return prev;
        return [...prev, newPath];
      });

      setActiveTabPath(newPath);
      setCurrent(created);
      setSavedHash(hash);
      setActiveTab("raw");
      setHistory([]);
      setNoteDialogOpen(false);
      notify("Note created.", "success");
    } catch (err) {
      setError(err?.message || "Unable to create note.");
      notify(err?.message || "Unable to create note.", "error");
    } finally {
      setCreatingNote(false);
    }
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) {
      notify("Enter a folder name first.", "warning");
      return;
    }

    setCreatingFolder(true);
    setError("");
    try {
      const basePath = selectedParentFolder || landingFolderPath || activeProject?.rootPath;
      const created = await createFolder(name, basePath);
      setNewFolderName("");
      setFolderDialogOpen(false);
      setDocuments(await listDocuments(landingFolderPath || activeProject?.rootPath));
      if (created?.title && created.title !== name) {
        notify(`Folder name exists. Created "${created.title}" instead.`, "info");
      } else {
        notify("Folder created.", "success");
      }
    } catch (err) {
      setError(err?.message || "Unable to create folder.");
      notify(err?.message || "Unable to create folder.", "error");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleOpenWorkspacePicker() {
    try {
      const selectedPath = await pickFolder();
      if (!selectedPath) return;
      const normalizedSelectedPath = normalizePathValue(selectedPath);
      setNotesFolderPath(normalizedSelectedPath);
      await handleSaveNotesFolder(normalizedSelectedPath);
    } catch (err) {
      notify(err?.message || "Unable to open folder picker.", "error");
    }
  }

  async function handleSaveNotesFolder(nextPathOverride) {
    const nextPath = normalizePathValue(nextPathOverride ?? notesFolderPath);
    if (!nextPath) {
      notify("Please provide a workspace path.", "warning");
      return;
    }

    setSavingNotesFolder(true);
    try {
      const result = await setNotesRootSetting(nextPath);
      setNotesFolderPath(normalizePathValue(result?.notesRoot || nextPath));
      setRecentWorkspacePaths(normalizeWorkspacePathList(result?.recentWorkspaces));
      if (result?.ignoredByEnv) {
        notify("Path saved, but NOTES_ROOT env override is active. Remove it to use this path.", "warning");
      } else {
        await loadDocumentsData();
        setCurrent(null);
        setHistory([]);
        notify("Workspace opened successfully.", "success");
      }
      setRecentWorkspacesDialogOpen(false);
    } catch (err) {
      notify(err?.message || "Unable to open workspace.", "error");
    } finally {
      setSavingNotesFolder(false);
    }
  }

  async function handleOpenRecentWorkspace(workspacePath) {
    const nextPath = normalizePathValue(workspacePath);
    if (!nextPath) return;
    await handleSaveNotesFolder(nextPath);
  }

  async function handleGoHome() {
    setActiveTabPath(null);
    setDocumentMenuAction(null);
    setCurrent(null);
    setHistory([]);
    return true;
  }

  async function handleCloseTab(filePath) {
    const isDirty = (() => {
      const state = tabStates[filePath];
      if (!state) return false;
      const { doc, savedHash } = state;
      if (!doc) return false;
      return savedHash !== JSON.stringify({
        header: doc.header || "",
        rawNotes: doc.rawNotes || "",
        cleansed: doc.cleansed || "",
      });
    })();

    if (isDirty) {
      const docTitle = tabStates[filePath]?.doc?.title || "Note";
      const confirmed = await confirm({
        title: "Discard Changes?",
        message: `"${docTitle}" has unsaved changes. Close anyway and discard changes?`,
        confirmLabel: "Discard",
        cancelLabel: "Cancel",
        variant: "danger",
      });
      if (!confirmed) return;
    }

    let nextActivePath = activeTabPath;
    setOpenTabs((prev) => {
      const filtered = prev.filter((p) => p !== filePath);
      if (activeTabPath === filePath) {
        if (filtered.length > 0) {
          const index = prev.indexOf(filePath);
          const nextIndex = Math.min(index, filtered.length - 1);
          nextActivePath = filtered[nextIndex];
        } else {
          nextActivePath = null;
        }
      }
      return filtered;
    });

    setTabStates((prev) => {
      const next = { ...prev };
      delete next[filePath];
      return next;
    });

    setActiveTabPath(nextActivePath);
  }

  async function handleCloseOthers(filePath) {
    const dirtyPaths = [];
    openTabs.forEach((path) => {
      if (path === filePath) return;
      const state = tabStates[path];
      const isDirty = state && state.savedHash !== JSON.stringify({
        header: state.doc.header || "",
        rawNotes: state.doc.rawNotes || "",
        cleansed: state.doc.cleansed || "",
      });
      if (isDirty) {
        dirtyPaths.push(path);
      }
    });

    if (dirtyPaths.length > 0) {
      const confirmed = await confirm({
        title: "Discard Changes?",
        message: `There are ${dirtyPaths.length} tabs with unsaved changes. Close them and discard changes?`,
        confirmLabel: "Discard All",
        cancelLabel: "Cancel",
        variant: "danger",
      });
      if (!confirmed) return;
    }

    setOpenTabs([filePath]);
    setTabStates((prev) => {
      const next = {};
      if (prev[filePath]) {
        next[filePath] = prev[filePath];
      }
      return next;
    });
    setActiveTabPath(filePath);
  }

  async function handleCloseToRight(filePath) {
    const idx = openTabs.indexOf(filePath);
    if (idx === -1) return;
    const rightTabs = openTabs.slice(idx + 1);
    if (rightTabs.length === 0) return;

    const dirtyPaths = [];
    rightTabs.forEach((path) => {
      const state = tabStates[path];
      const isDirty = state && state.savedHash !== JSON.stringify({
        header: state.doc.header || "",
        rawNotes: state.doc.rawNotes || "",
        cleansed: state.doc.cleansed || "",
      });
      if (isDirty) {
        dirtyPaths.push(path);
      }
    });

    if (dirtyPaths.length > 0) {
      const confirmed = await confirm({
        title: "Discard Changes?",
        message: `There are ${dirtyPaths.length} tabs with unsaved changes. Close them and discard changes?`,
        confirmLabel: "Discard All",
        cancelLabel: "Cancel",
        variant: "danger",
      });
      if (!confirmed) return;
    }

    const nextOpen = openTabs.slice(0, idx + 1);
    setOpenTabs(nextOpen);
    setTabStates((prev) => {
      const next = {};
      nextOpen.forEach((p) => {
        if (prev[p]) next[p] = prev[p];
      });
      return next;
    });

    if (!nextOpen.includes(activeTabPath)) {
      setActiveTabPath(filePath);
    }
  }

  async function handleCloseSaved() {
    const dirtyPaths = [];
    const cleanPaths = [];
    openTabs.forEach((path) => {
      const state = tabStates[path];
      const isDirty = state && state.savedHash !== JSON.stringify({
        header: state.doc.header || "",
        rawNotes: state.doc.rawNotes || "",
        cleansed: state.doc.cleansed || "",
      });
      if (isDirty) {
        dirtyPaths.push(path);
      } else {
        cleanPaths.push(path);
      }
    });

    if (cleanPaths.length === 0) return;

    setOpenTabs(dirtyPaths);
    setTabStates((prev) => {
      const next = {};
      dirtyPaths.forEach((p) => {
        if (prev[p]) next[p] = prev[p];
      });
      return next;
    });

    if (!dirtyPaths.includes(activeTabPath)) {
      setActiveTabPath(dirtyPaths.length > 0 ? dirtyPaths[0] : null);
    }
  }

  async function handleCloseAll() {
    const dirtyPaths = [];
    openTabs.forEach((path) => {
      const state = tabStates[path];
      const isDirty = state && state.savedHash !== JSON.stringify({
        header: state.doc.header || "",
        rawNotes: state.doc.rawNotes || "",
        cleansed: state.doc.cleansed || "",
      });
      if (isDirty) {
        dirtyPaths.push(path);
      }
    });

    if (dirtyPaths.length > 0) {
      const confirmed = await confirm({
        title: "Discard Changes?",
        message: `There are ${dirtyPaths.length} tabs with unsaved changes. Close all and discard changes?`,
        confirmLabel: "Discard All",
        cancelLabel: "Cancel",
        variant: "danger",
      });
      if (!confirmed) return;
    }

    setOpenTabs([]);
    setTabStates({});
    setActiveTabPath(null);
  }

  async function handleOpenInEditor(filePath) {
    if (!filePath) return;
    try {
      const result = await openInEditor(filePath);
      if (result?.openedWith === "default") {
        notify("VS Code not available. Opened with system default app.", "info");
      } else {
        notify("Opened note file in VS Code.", "success");
      }
    } catch (err) {
      notify(err?.message || "Unable to open file in editor.", "error");
    }
  }

  async function handleRevealInExplorer(filePath) {
    if (!filePath) return;
    try {
      await revealWorkspaceInExplorer(filePath);
      notify("Revealed note in File Explorer.", "success");
    } catch (err) {
      notify(err?.message || "Unable to reveal note in File Explorer.", "error");
    }
  }

  async function handleOpenCurrentInEditor() {
    if (!current?.filePath) return;

    try {
      const result = await openInEditor(current.filePath);
      if (result?.openedWith === "default") {
        notify("VS Code not available. Opened with system default app.", "info");
      } else {
        notify("Opened latest note file in VS Code.", "success");
      }
    } catch (err) {
      notify(err?.message || "Unable to open file in editor.", "error");
    }
  }

  async function handleOpenWebsiteFromLanding() {
    try {
      const result = await openWebView();
      if (result?.openedWith === "chrome") {
        notify("Opened project website in Chrome.", "success");
      } else {
        notify("Chrome not found. Opened project website in default browser.", "info");
      }
    } catch (err) {
      notify(err?.message || "Unable to open project website.", "error");
    }
  }

  async function handleOpenWebsiteForCurrent() {
    if (!current?.filePath) return;

    try {
      const result = await openWebView(current.filePath, {
        header: current.header || "",
        rawNotes: current.rawNotes || "",
        cleansed: current.cleansed || "",
      });
      if (result?.openedWith === "chrome") {
        notify("Opened website view in Chrome.", "success");
      } else {
        notify("Chrome not found. Opened in your default browser.", "info");
      }
    } catch (err) {
      notify(err?.message || "Unable to open website view.", "error");
    }
  }

  async function handleRenameFromTopbar() {
    if (!current?.title) return;
    const nextTitle = window.prompt("Rename note", current.title);
    if (nextTitle == null) return;
    await handleRenameCurrentDocument(nextTitle);
  }

  async function handleOpenListItem(item) {
    if (!item) return;
    if (item.entryType === "folder") {
      try {
        setError("");
        setLoading(true);
        const folderPath = normalizePathValue(item.filePath);
        setLandingFolderPath(folderPath);
        setDocuments(await listDocuments(folderPath));
      } catch (err) {
        setError(err?.message || "Unable to open folder.");
        notify(err?.message || "Unable to open folder.", "error");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (item.entryType === "file") {
      await openDocument(item.filePath);
    }
  }

  async function handleOpenReferencedDocument(filePath, lineNumber) {
    if (!filePath) return;
    if (current && dirty && current.filePath !== filePath) {
      const confirmed = await confirm({
        title: "Discard Changes?",
        message: "You have unsaved changes. Open the referenced note and discard unsaved changes?",
        confirmLabel: "Discard",
        cancelLabel: "Cancel",
        variant: "danger"
      });
      if (!confirmed) return;
    }
    await openDocument(filePath, { lineNumber });
  }

  async function handleLandingNavigateUp() {
    const activeRoot = activeProject?.rootPath;
    const currentPath = landingFolderPath || activeRoot;
    if (!activeRoot || !currentPath || !canNavigateUp) return;

    const parentPath = currentPath.replace(/[\\/][^\\/]+[\\/]*$/, "");
    const nextPath = parentPath || activeRoot;
    try {
      setError("");
      setLoading(true);
      setLandingFolderPath(nextPath);
      setDocuments(await listDocuments(nextPath));
    } catch (err) {
      setError(err?.message || "Unable to navigate up.");
      notify(err?.message || "Unable to navigate up.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleLandingNavigateTo(targetPath) {
    const nextPath = String(targetPath || "").trim();
    if (!nextPath) return;

    const activeRoot = normalizePathValue(activeProject?.rootPath);
    const normalizedTarget = nextPath.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    const normalizedRoot = activeRoot.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

    if (normalizedRoot && !(normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`))) {
      return;
    }

    try {
      setError("");
      setLoading(true);
      setLandingFolderPath(nextPath);
      setDocuments(await listDocuments(nextPath));
    } catch (err) {
      setError(err?.message || "Unable to navigate to folder.");
      notify(err?.message || "Unable to navigate to folder.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocumentsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    documents,
    setDocuments,
    current,
    setCurrent,
    savedHash,
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
    setNotesFolderPath,
    recentWorkspacePaths,
    savingNotesFolder,
    documentMenuAction,
    setDocumentMenuAction,
    landingFolderPath,
    setLandingFolderPath,
    canNavigateUp,
    dirty,
    loadDocumentsData,
    openDocument,
    saveDocument,
    handleReloadCurrentFromDisk,
    handleRenameCurrentDocument,
    handleDeleteCurrentDocument,
    handleDeleteCurrentFolder,
    handleRemoveListEntry,
    handleCreateNote,
    handleCreateFolder,
    handleOpenWorkspacePicker,
    handleSaveNotesFolder,
    handleOpenRecentWorkspace,
    handleGoHome,
    handleOpenCurrentInEditor,
    handleOpenWebsiteFromLanding,
    handleOpenWebsiteForCurrent,
    handleRenameFromTopbar,
    handleOpenListItem,
    handleOpenReferencedDocument,
    handleLandingNavigateUp,
    handleLandingNavigateTo,
    openTabs,
    setOpenTabs,
    activeTabPath,
    setActiveTabPath,
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
  };
}
