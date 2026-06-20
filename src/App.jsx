import { useEffect, useState } from "react";
import mermaid from "mermaid";
import { FolderOpen, FolderPlus, Globe, LayoutGrid, NotebookPen, Rows3, X } from "lucide-react";
import { DocumentList } from "./components/DocumentList";
import { DocumentDetail } from "./components/DocumentDetail";
import {
  createProject,
  createDocument,
  getNotesRootSetting,
  listProjects,
  listDocuments,
  onMenuAction,
  pickFolder,
  openInEditor,
  openWebView,
  readDocument,
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

  const [documents, setDocuments] = useState([]);
  const [current, setCurrent] = useState(null);
  const [savedHash, setSavedHash] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("raw");
  const [mode, setMode] = useState("edit");
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProjectState] = useState(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [creatingNote, setCreatingNote] = useState(false);
  const [notesViewMode, setNotesViewMode] = useState(initialViewMode);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [notesFolderDialogOpen, setNotesFolderDialogOpen] = useState(false);
  const [notesFolderPath, setNotesFolderPath] = useState("");
  const [savingNotesFolder, setSavingNotesFolder] = useState(false);

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

  async function openDocument(filePath) {
    setError("");
    const doc = await readDocument(filePath);
    setCurrent(doc);
    setSavedHash(
      JSON.stringify({
        header: doc.header,
        rawNotes: doc.rawNotes,
        cleansed: doc.cleansed,
      })
    );
    setActiveTab("raw");
    setHistory(await getHistory(filePath));
  }

  async function saveDocument() {
    if (!current) return;
    setSaving(true);
    setError("");

    try {
      const saved = await saveDocumentApi({
        filePath: current.filePath,
        header: current.header,
        rawNotes: current.rawNotes,
        cleansed: current.cleansed,
        reason: "manual-save",
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
      notify("Document saved.", "success");
    } catch (err) {
      setError(err?.message || "Unable to save document.");
      notify(err?.message || "Unable to save document.", "error");
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
    if (activeProject?.isRoot) {
      notify("Cannot create notes in root. Open a project folder first.", "warning");
      return;
    }

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

  async function handleCreateFolder() {
    if (!activeProject?.isRoot) {
      notify("New folders can be created only in root.", "warning");
      return;
    }

    const name = window.prompt("Enter new folder name");
    if (name == null) return;

    const trimmed = name.trim();
    if (!trimmed) {
      notify("Folder name is required.", "warning");
      return;
    }

    setCreatingFolder(true);
    setError("");
    try {
      const result = await createProject(trimmed);
      applyProjectState(result);
      setDocuments(await listDocuments());
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
      if (!confirmed) return;
    }

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
    updateMenuContext({
      screen: current ? "document" : "landing",
      viewMode: notesViewMode,
      dirty,
      canCreateFolder: !current && Boolean(activeProject?.isRoot),
    });
  }, [current, notesViewMode, dirty, activeProject]);

  useEffect(() => {
    return onMenuAction((action) => {
      if (action === "new-note") {
        if (activeProject?.isRoot) {
          notify("Cannot create notes in root. Open a project folder first.", "warning");
          return;
        }
        setNoteDialogOpen(true);
        return;
      }

      if (action === "view-tile") {
        setNotesViewMode("tile");
        return;
      }

      if (action === "new-project") {
        handleCreateFolder();
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
      }
    });
  }, [current, dirty, activeProject]);

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
      {!current ? (
        <>
          <section className="project-toolbar">
            <div className="project-toolbar-left">
              <span className="project-toolbar-label">Folder</span>
              <select
                className="project-select"
                value={activeProject?.slug || ""}
                onChange={(event) => handleSwitchProject(event.target.value)}
              >
                {(projects || []).map((project) => (
                  <option key={project.slug} value={project.slug}>
                    {project.isRoot ? "Root" : project.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="project-toolbar-right">
              <button
                className="small-button"
                onClick={() => setNotesFolderDialogOpen(true)}
                disabled={savingNotesFolder}
              >
                <FolderOpen size={14} />
                Notes Folder
              </button>
              <button className="small-button" onClick={handleOpenWebsiteFromLanding} type="button">
                <Globe size={14} />
                Website
              </button>
              <button
                className="small-button"
                onClick={handleCreateFolder}
                disabled={creatingFolder || !activeProject?.isRoot}
              >
                <FolderPlus size={14} />
                New Folder
              </button>
              <button
                className="small-button"
                onClick={() => {
                  setNoteDialogOpen(true);
                }}
                disabled={creatingNote || activeProject?.isRoot}
              >
                <NotebookPen size={14} />
                New Note
              </button>
            </div>
          </section>
          <header className="landing-header">
            <div>
              <p>{activeProject?.isRoot ? "Root" : activeProject?.name || "Folder"}</p>
              <h1>{activeProject?.isRoot ? "Root Notes Browser" : `${activeProject?.name || "Folder"} Notes`}</h1>
            </div>
            <div className="landing-header-actions">
              <span>
                Markdown source files with quick notes, formal notes, Mermaid diagrams, and local
                versions.
              </span>
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
          onHome={handleGoHome}
          onNotify={notify}
        />
      )}

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
