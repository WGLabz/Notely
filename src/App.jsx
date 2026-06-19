import { useEffect, useState } from "react";
import mermaid from "mermaid";
import { DocumentList } from "./components/DocumentList";
import { DocumentDetail } from "./components/DocumentDetail";
import {
  listDocuments,
  readDocument,
  saveDocument as saveDocumentApi,
  getHistory,
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
  const [documents, setDocuments] = useState([]);
  const [current, setCurrent] = useState(null);
  const [savedHash, setSavedHash] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("raw");
  const [mode, setMode] = useState("edit");
  const [error, setError] = useState("");

  const dirty =
    current
      ? savedHash !==
        JSON.stringify({
          header: current.header,
          rawNotes: current.rawNotes,
          cleansed: current.cleansed,
        })
      : false;

  async function loadDocumentsData() {
    setLoading(true);
    setError("");
    try {
      setDocuments(await listDocuments());
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
    } catch (err) {
      setError(err?.message || "Unable to save document.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadDocumentsData();
  }, []);

  return (
    <div className="app-shell">
      {error && <div className="error-banner">{error}</div>}
      {!current ? (
        <>
          <header className="landing-header">
            <div>
              <p>TCL Mithapur</p>
              <h1>Meeting Notes</h1>
            </div>
            <span>
              Markdown source files with quick notes, formal notes, Mermaid diagrams, and local
              versions.
            </span>
          </header>
          <DocumentList documents={documents} onOpen={openDocument} loading={loading} />
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
          onHome={() => setCurrent(null)}
        />
      )}
    </div>
  );
}
