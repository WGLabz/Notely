import { useEffect, useRef, useState } from "react";
import {
  createFolder,
  createDocument,
  deleteDocument as deleteDocumentApi,
  getNotesRootSetting,
  listProjects,
  listDocuments,
  pickFolder,
  openInEditor,
  openWebView,
  readDocument,
  renameDocument as renameDocumentApi,
  saveDocument as saveDocumentApi,
  setNotesRootSetting,
  getHistory,
} from "../services/electronService";

export function useDocumentManager({ notify }) {
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
  const [notesFolderDialogOpen, setNotesFolderDialogOpen] = useState(false);
  const [notesFolderPath, setNotesFolderPath] = useState("");
  const [savingNotesFolder, setSavingNotesFolder] = useState(false);
  const [documentMenuAction, setDocumentMenuAction] = useState(null);
  const [landingFolderPath, setLandingFolderPath] = useState("");

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

  const normalizedProjectRoot = String(activeProject?.rootPath || "")
    .replace(/[\\/]+$/, "")
    .toLowerCase();
  const normalizedLandingFolder = String(landingFolderPath || activeProject?.rootPath || "")
    .replace(/[\\/]+$/, "")
    .toLowerCase();
  const canNavigateUp = Boolean(
    normalizedProjectRoot &&
    normalizedLandingFolder &&
    normalizedLandingFolder !== normalizedProjectRoot
  );

  function applyProjectState(result) {
    setProjects(result?.projects || []);
    setActiveProjectState(result?.activeProject || null);
  }

  async function loadDocumentsData() {
    const requestId = ++loadDocumentsRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const projectState = await listProjects();
      if (loadDocumentsRequestRef.current !== requestId) return;
      applyProjectState(projectState);
      const baseFolder = projectState?.activeProject?.rootPath || "";
      setLandingFolderPath(baseFolder);
      const docs = await listDocuments(baseFolder);
      if (loadDocumentsRequestRef.current !== requestId) return;
      setDocuments(docs);
      const notesSetting = await getNotesRootSetting();
      if (loadDocumentsRequestRef.current !== requestId) return;
      setNotesFolderPath(notesSetting?.notesRoot || "");
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
    const doc = await readDocument(filePath);
    setCurrent(doc);
    setSavedHash(
      JSON.stringify({
        header: doc.header,
        rawNotes: doc.rawNotes,
        cleansed: doc.cleansed,
      })
    );
    if (!options.preserveActiveTab) {
      setActiveTab("raw");
    }
    setHistory(await getHistory(filePath));
  }

  async function saveDocument(options = {}) {
    if (!current) return;
    const reason = options?.reason || "manual-save";
    const silent = Boolean(options?.silent);
    setSaving(true);
    setError("");

    try {
      const saved = await saveDocumentApi({
        filePath: current.filePath,
        header: current.header,
        rawNotes: current.rawNotes,
        cleansed: current.cleansed,
        reason,
      });
      setCurrent(saved);
      setSavedHash(
        JSON.stringify({
          header: saved.header,
          rawNotes: saved.rawNotes,
          cleansed: saved.cleansed,
        })
      );
      setHistory(await getHistory(saved.filePath));
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
      const confirmed = window.confirm(
        "Reload this note from disk and discard unsaved changes?"
      );
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

    try {
      if (dirty) {
        await saveDocument({ reason: "rename-save", silent: true });
      }

      const renamed = await renameDocumentApi(current.filePath, nextTitle);
      setCurrent(renamed);
      setSavedHash(
        JSON.stringify({
          header: renamed.header,
          rawNotes: renamed.rawNotes,
          cleansed: renamed.cleansed,
        })
      );
      setHistory(await getHistory(renamed.filePath));
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

    const confirmed = window.confirm(
      dirty
        ? `Move "${current.title}" to the removed folder and discard unsaved changes?`
        : `Move "${current.title}" to the removed folder?`
    );
    if (!confirmed) return false;

    try {
      await deleteDocumentApi(current.filePath);
      setCurrent(null);
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

  async function handleCreateNote() {
    const title = newNoteTitle.trim();
    if (!title) {
      notify("Enter a note title first.", "warning");
      return;
    }

    if (current && dirty) {
      const confirmed = window.confirm("You have unsaved changes. Create and open a new note anyway?");
      if (!confirmed) return;
    }

    setCreatingNote(true);
    setError("");
    try {
      const basePath = landingFolderPath || activeProject?.rootPath;
      const created = await createDocument(title, basePath);
      setNewNoteTitle("");
      setDocuments(await listDocuments(basePath));
      setCurrent(created);
      setSavedHash(
        JSON.stringify({
          header: created.header,
          rawNotes: created.rawNotes,
          cleansed: created.cleansed,
        })
      );
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
      const basePath = landingFolderPath || activeProject?.rootPath;
      await createFolder(name, basePath);
      setNewFolderName("");
      setFolderDialogOpen(false);
      setDocuments(await listDocuments(basePath));
      notify("Folder created.", "success");
    } catch (err) {
      setError(err?.message || "Unable to create folder.");
      notify(err?.message || "Unable to create folder.", "error");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handlePickNotesFolder() {
    try {
      const selectedPath = await pickFolder();
      if (!selectedPath) return;
      setNotesFolderPath(selectedPath);
    } catch (err) {
      notify(err?.message || "Unable to open folder picker.", "error");
    }
  }

  async function handleSaveNotesFolder() {
    const nextPath = notesFolderPath.trim();
    if (!nextPath) {
      notify("Please provide a notes folder path.", "warning");
      return;
    }

    setSavingNotesFolder(true);
    try {
      const result = await setNotesRootSetting(nextPath);
      if (result?.ignoredByEnv) {
        notify("Path saved, but NOTES_ROOT env override is active. Remove it to use this path.", "warning");
      } else {
        await loadDocumentsData();
        setCurrent(null);
        setHistory([]);
        notify("Notes folder saved and loaded.", "success");
      }
      setNotesFolderDialogOpen(false);
    } catch (err) {
      notify(err?.message || "Unable to save notes folder.", "error");
    } finally {
      setSavingNotesFolder(false);
    }
  }

  function handleGoHome() {
    if (current && dirty) {
      const confirmed = window.confirm("You have unsaved changes. Go back to notes and discard unsaved changes?");
      if (!confirmed) return false;
    }

    setDocumentMenuAction(null);
    setCurrent(null);
    setHistory([]);
    return true;
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
        setLandingFolderPath(item.filePath);
        setDocuments(await listDocuments(item.filePath));
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

  async function handleOpenReferencedDocument(filePath) {
    if (!filePath) return;
    if (current && dirty && current.filePath !== filePath) {
      const confirmed = window.confirm("You have unsaved changes. Open the referenced note and discard unsaved changes?");
      if (!confirmed) return;
    }
    await openDocument(filePath);
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

    const activeRoot = String(activeProject?.rootPath || "").trim();
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
    notesFolderDialogOpen,
    setNotesFolderDialogOpen,
    notesFolderPath,
    setNotesFolderPath,
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
    handleLandingNavigateUp,
    handleLandingNavigateTo,
  };
}
