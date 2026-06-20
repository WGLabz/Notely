import { useEffect, useState } from "react";
import mermaid from "mermaid";
import { FolderOpen, LayoutGrid, NotebookPen, Rows3, X } from "lucide-react";
import { DocumentList } from "./components/DocumentList";
import { DocumentDetail } from "./components/DocumentDetail";
import { EmbeddedTerminal } from "./components/EmbeddedTerminal";
import {
  createDocument,
  deleteDocument as deleteDocumentApi,
  getNotesRootSetting,
  listProjects,
  listDocuments,
  onMenuAction,
  pickFolder,
  openInEditor,
  openWebView,
  readDocument,
  renameDocument as renameDocumentApi,
  saveDocument as saveDocumentApi,
  setNotesRootSetting,
  setActiveProject,
  getHistory,
  updateMenuContext,
} from "./services/electronService";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  themeVariables: {
    primaryColor: "#f4f1ea",
    primaryBorderColor: "#2f5d62",
    primaryTextColor: "#172326",
    lineColor: "#506b70",
    secondaryColor: "#dce8e3",
    tertiaryColor: "#ffffff",
  },
});

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

  const [documents, setDocuments] = useState([]);
  const [current, setCurrent] = useState(null);
  const [savedHash, setSavedHash] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("raw");
  const [mode, setMode] = useState(initialEditorMode);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProjectState] = useState(null);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [creatingNote, setCreatingNote] = useState(false);
  const [notesViewMode, setNotesViewMode] = useState(initialViewMode);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [notesFolderDialogOpen, setNotesFolderDialogOpen] = useState(false);
  const [notesFolderPath, setNotesFolderPath] = useState("");
  const [savingNotesFolder, setSavingNotesFolder] = useState(false);
  const [documentMenuAction, setDocumentMenuAction] = useState(null);
  const [showTerminal, setShowTerminal] = useState(false);

  const terminalCwd = current?.filePath
    ? current.filePath.replace(/[\\/][^\\/]+$/, "")
    : (activeProject?.rootPath || notesFolderPath);

  const notify = (message, type = "info") => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((currentToasts) => [...currentToasts, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const dirty =
    current
      ? savedHash !==
        JSON.stringify({
          header: current.header,
          rawNotes: current.rawNotes,
          cleansed: current.cleansed,
        })
      : false;

  function applyProjectState(result) {
    setProjects(result?.projects || []);
    setActiveProjectState(result?.activeProject || null);
  }

  async function loadDocumentsData() {
    setLoading(true);
    setError("");
    try {
      const projectState = await listProjects();
      applyProjectState(projectState);
      setDocuments(await listDocuments());
      const notesSetting = await getNotesRootSetting();
      setNotesFolderPath(notesSetting?.notesRoot || "");
    } catch (err) {
      setError(err?.message || "Unable to load documents.");
    } finally {
      setLoading(false);
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
        ? `Move \"${current.title}\" to the removed folder and discard unsaved changes?`
        : `Move \"${current.title}\" to the removed folder?`
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
        notify("Document saved.", "success");
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

  async function handleSwitchProject(slug) {
    if (!slug) return;
    if (activeProject?.slug === slug) return;

    if (current && dirty) {
      const confirmed = window.confirm("You have unsaved changes. Switch project and discard unsaved changes?");
      if (!confirmed) return;
    }

    setError("");
    setLoading(true);
    try {
      const result = await setActiveProject(slug);
      applyProjectState(result);
      setCurrent(null);
      setHistory([]);
      setDocuments(await listDocuments());
      notify("Project switched.", "success");
    } catch (err) {
      setError(err?.message || "Unable to switch project.");
      notify(err?.message || "Unable to switch project.", "error");
    } finally {
      setLoading(false);
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
      const created = await createDocument(title);
      setNewNoteTitle("");
      setDocuments(await listDocuments());
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
      if (!confirmed) return;
    }

    setDocumentMenuAction(null);
    setCurrent(null);
    setHistory([]);
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

    const content = activeTab === "cleansed" ? current.cleansed : current.rawNotes;

    try {
      const result = await openWebView(current.filePath, content);
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
      await handleSwitchProject(item.slug);
      return;
    }
    if (item.entryType === "file") {
      await openDocument(item.filePath);
    }
  }

  useEffect(() => {
    loadDocumentsData();
  }, []);

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
    updateMenuContext({
      screen: current ? "document" : "landing",
      viewMode: notesViewMode,
      dirty,
    });
  }, [current, notesViewMode, dirty]);

  useEffect(() => {
    return onMenuAction((action) => {
      if (action === "new-note") {
        setNoteDialogOpen(true);
        return;
      }

      if (action === "open-notes-folder-settings") {
        setNotesFolderDialogOpen(true);
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
      }
    });
  }, [current, dirty, activeProject, activeTab]);

  return (
    <div className="app-shell">
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div className={`toast-item ${toast.type}`} key={toast.id}>
            {toast.message}
          </div>
        ))}
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!showTerminal ? (
        <button
          className="terminal-toggle-fab"
          type="button"
          onClick={() => setShowTerminal(true)}
        >
          Terminal
        </button>
      ) : null}
      {!current ? (
        <>
          <header className="landing-header">
            <div>
              <h1>{activeProject?.isRoot ? "All Notes" : `${activeProject?.name || "Folder"} Notes`}</h1>
              <div className="landing-path" title={activeProject?.rootPath || notesFolderPath || "Path unavailable"}>
                {activeProject?.rootPath || notesFolderPath || "Path unavailable"}
              </div>
            </div>
            <div className="landing-header-actions">
              <div className="document-view-toggle" role="group" aria-label="Landing notes view mode">
                <button
                  className={notesViewMode === "tile" ? "active" : ""}
                  onClick={() => setNotesViewMode("tile")}
                  type="button"
                >
                  <LayoutGrid size={14} />
                  Tile
                </button>
                <button
                  className={notesViewMode === "table" ? "active" : ""}
                  onClick={() => setNotesViewMode("table")}
                  type="button"
                >
                  <Rows3 size={14} />
                  Table
                </button>
              </div>
            </div>
          </header>
          <DocumentList
            documents={documents}
            onOpen={handleOpenListItem}
            loading={loading}
            viewMode={notesViewMode}
          />
        </>
      ) : (
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
        />
      )}

      {showTerminal ? (
        <div className="terminal-dock open">
          <EmbeddedTerminal cwd={terminalCwd} onClose={() => setShowTerminal(false)} />
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
    </div>
  );
}
