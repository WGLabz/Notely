import { useState, useEffect, useMemo, useRef } from "react";
import OverlayDialog from "./OverlayDialog";
import AppButton from "./AppButton";
import useConfirm from "../hooks/useConfirm";
import { executeCodeBlock } from "../services/electronService";
import { Check, X, ChevronDown, Search, Copy, Wand2, Play } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { editorTheme } from "../utils/editorTheme";
import { langs } from "@uiw/codemirror-extensions-langs";
import { formatCode } from "../utils/codeFormatter";
import "./CodeBlockModal.css";

const LANGUAGES = [
  { value: "", label: "Auto / Plain Text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash / Shell" },
  { value: "markdown", label: "Markdown" },
];

function normalizeLanguage(lang) {
  if (!lang) return "";
  const l = lang.toLowerCase();
  if (l === 'js' || l === 'jsx') return 'javascript';
  if (l === 'ts' || l === 'tsx') return 'typescript';
  if (l === 'py') return 'python';
  if (l === 'rb') return 'ruby';
  if (l === 'rs') return 'rust';
  if (l === 'sh') return 'bash';
  if (l === 'c++') return 'cpp';
  if (l === 'c#') return 'csharp';
  return l;
}

function SearchableLanguageSelect({ value, onChange }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selectedLabel = LANGUAGES.find(l => l.value === value)?.label || "Auto / Plain Text";

  const filtered = LANGUAGES.filter(l => 
    l.label.toLowerCase().includes(search.toLowerCase()) || 
    l.value.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  return (
    <div className="app-select-root" style={{ width: "220px", position: "relative" }} ref={rootRef}>
      <button
        type="button"
        className={`app-select-trigger ${open ? "open" : ""}`}
        onClick={() => { setOpen(!open); setSearch(""); }}
      >
        <span className="app-select-trigger-text">{selectedLabel}</span>
        <ChevronDown size={16} className="app-select-trigger-icon" />
      </button>

      {open && (
        <div className="app-select-panel" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, marginTop: "4px" }}>
          <div style={{ padding: "8px", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "center", gap: "6px", background: "var(--surface-bg)" }}>
             <Search size={14} color="var(--text-muted)" />
             <input 
               autoFocus
               placeholder="Search..."
               value={search}
               onChange={e => setSearch(e.target.value)}
               style={{ width: "100%", padding: "4px 0", background: "transparent", border: "none", color: "var(--app-text)", fontSize: "13px", outline: "none" }}
             />
          </div>
          <div className="app-select-group" style={{ maxHeight: "200px", overflowY: "auto" }}>
            {filtered.map(lang => (
              <button
                key={lang.value}
                type="button"
                className={`app-select-option ${lang.value === value ? "selected" : ""}`}
                onClick={() => { onChange(lang.value); setOpen(false); }}
              >
                <span className="app-select-option-label">{lang.label}</span>
                {lang.value === value && <Check size={14} className="app-select-option-check" />}
              </button>
            ))}
            {filtered.length === 0 && (
               <div style={{ padding: "8px", fontSize: "13px", color: "var(--text-muted)", textAlign: "center" }}>No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CodeBlockModal({ open, onClose, onSave, initialLanguage = "", initialCode = "" }) {
  const [langSearch, setLangSearch] = useState(() => normalizeLanguage(initialLanguage));
  const [code, setCode] = useState(initialCode);
  const [isDark, setIsDark] = useState(false);
  const [userSelectedLang, setUserSelectedLang] = useState(!!initialLanguage);
  const [isFormatting, setIsFormatting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState(null);
  const { confirm } = useConfirm();

  useEffect(() => {
    if (open) {
      setLangSearch(normalizeLanguage(initialLanguage));
      setCode(initialCode);
      setUserSelectedLang(!!initialLanguage);
      setIsFormatting(false);
      setCopying(false);
      setExecuting(false);
      setExecResult(null);
      
      const updateTheme = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
      updateTheme();
      
      const observer = new MutationObserver(updateTheme);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => observer.disconnect();
    }
  }, [open, initialLanguage, initialCode]);

  useEffect(() => {
    if (!open || userSelectedLang || code.trim().length < 15) return;
    
    const timer = setTimeout(async () => {
      try {
        const hljs = await import("highlight.js");
        const subset = LANGUAGES.map(l => l.value).filter(Boolean);
        const result = hljs.default.highlightAuto(code, subset);
        if (result.language && result.language !== langSearch) {
          setLangSearch(result.language);
        }
      } catch (err) {
        console.warn("Failed to auto-detect language", err);
      }
    }, 800);
    
    return () => clearTimeout(timer);
  }, [code, userSelectedLang, open, langSearch]);

  const handleLangSelect = (val) => {
    setLangSearch(val);
    setUserSelectedLang(true);
  };

  const handleFormat = async () => {
    if (!langSearch) return;
    setIsFormatting(true);
    const formatted = await formatCode(code, langSearch);
    setCode(formatted);
    setIsFormatting(false);
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    } catch (err) {
      console.warn("Failed to copy", err);
    }
  };

  const handleExecute = async () => {
    const l = String(langSearch || "").toLowerCase();
    const runnableLangs = ["javascript", "js", "python", "py", "bash", "sh", "powershell", "ps1", "html"];
    const canRun = runnableLangs.includes(l);
    if (!canRun || !code) return;

    setExecuting(true);
    setExecResult(null);
    try {
      const res = await executeCodeBlock(l, code);
      setExecResult(res);
    } catch (err) {
      setExecResult({
        success: false,
        stdout: "",
        stderr: err.message || "Failed to execute script.",
        exitCode: -1
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleSave = () => {
    onSave({ language: langSearch, code });
    onClose();
  };

  const extensions = useMemo(() => {
    const exts = [editorTheme];
    if (!langSearch) return exts;
    const l = langSearch.toLowerCase();
    
    let extFunc = null;
    if (l === 'javascript' || l === 'js' || l === 'jsx') extFunc = langs.js;
    else if (l === 'typescript' || l === 'ts' || l === 'tsx') extFunc = langs.ts;
    else if (l === 'csharp' || l === 'cs' || l === 'c#') extFunc = langs.cs;
    else if (l === 'c++' || l === 'cpp') extFunc = langs.cpp;
    else if (l === 'python' || l === 'py') extFunc = langs.python;
    else if (l === 'rust' || l === 'rs') extFunc = langs.rust;
    else if (l === 'ruby' || l === 'rb') extFunc = langs.ruby;
    else if (l === 'bash' || l === 'sh') extFunc = langs.bash;
    else extFunc = langs[l];

    if (extFunc) {
      exts.push(extFunc());
    }
    return exts;
  }, [langSearch]);

  const lowerLang = String(langSearch || "").toLowerCase();
  const runnableLangs = ["javascript", "js", "python", "py", "bash", "sh", "powershell", "ps1", "html"];
  const canRun = runnableLangs.includes(lowerLang);

  const hasChanges = code !== initialCode || langSearch !== normalizeLanguage(initialLanguage);

  const handleCloseAttempt = async () => {
    if (hasChanges) {
      const confirmed = await confirm({
        title: "Unsaved Changes",
        message: "You have unsaved changes. Are you sure you want to close?",
        confirmLabel: "Close",
        cancelLabel: "Cancel",
        variant: "danger"
      });
      if (!confirmed) return;
    }
    onClose();
  };

  return (
    <OverlayDialog 
      open={open} 
      onClose={handleCloseAttempt} 
      closeOnClickOutside={false}
      ariaLabel="Code Block Editor" 
      cardClassName="code-block-modal-card"
    >
      <div className="overlay-dialog-header">
        <h2>Edit Code Block</h2>
        <button className="icon-button" onClick={handleCloseAttempt} aria-label="Close code editor">
          <X size={16} />
        </button>
      </div>

      <div style={{ marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>Language</span>
          <SearchableLanguageSelect value={langSearch} onChange={handleLangSelect} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <AppButton 
            variant="small" 
            onClick={handleExecute} 
            disabled={executing || !code}
            title={canRun ? "Execute code block" : "Unsupported language for local execution"}
            style={{ opacity: canRun ? 1 : 0.4, cursor: canRun ? "pointer" : "not-allowed" }}
          >
            {executing ? (
              <span className="spinner" style={{ display: "inline-block", width: "12px", height: "12px", border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", marginRight: "4px", animation: "spin 1s linear infinite" }} />
            ) : (
              <Play size={14} style={{ marginRight: "4px" }} />
            )}
            <span>{executing ? "Running..." : "Execute"}</span>
          </AppButton>
          <AppButton variant="small" onClick={handleFormat} disabled={isFormatting || !langSearch}>
            <Wand2 size={14} />
            <span>{isFormatting ? "Formatting..." : "Format"}</span>
          </AppButton>
          <AppButton variant="small" onClick={handleCopy} disabled={!code}>
            {copying ? <Check size={14} /> : <Copy size={14} />}
            <span>{copying ? "Copied!" : "Copy"}</span>
          </AppButton>
        </div>
      </div>

      <div className="code-block-editor-container" style={{ marginTop: "12px" }}>
        <CodeMirror
          value={code}
          onChange={(val) => setCode(val)}
          theme={isDark ? "dark" : "light"}
          height="100%"
          extensions={extensions}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            foldGutter: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            defaultKeymap: true,
            searchKeymap: true,
            historyKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
        />
      </div>

      {executing && (
        <div style={{
          marginTop: "12px",
          padding: "8px 12px",
          background: "#181a1f",
          border: "1px solid #282c34",
          borderRadius: "4px",
          fontFamily: "Consolas, Monaco, monospace",
          fontSize: "12px",
          color: "#61afef"
        }}>
          Executing code block...
        </div>
      )}

      {execResult && (
        <div style={{
          marginTop: "12px",
          padding: "8px 12px",
          background: "#181a1f",
          border: "1px solid #282c34",
          borderRadius: "4px",
          maxHeight: execResult.isHtml ? "270px" : "150px",
          overflowY: "auto",
          fontFamily: "Consolas, Monaco, monospace",
          fontSize: "12px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", borderBottom: "1px solid #282c34", paddingBottom: "4px" }}>
            <span style={{ fontSize: "11px", fontWeight: "bold", color: execResult.success ? "#98c379" : "#e06c75" }}>
              {execResult.isHtml ? "HTML PREVIEW" : (execResult.success ? `SUCCESS (exit code ${execResult.exitCode})` : `FAILED (exit code ${execResult.exitCode})`)}
            </span>
            <button
              onClick={() => setExecResult(null)}
              style={{ background: "none", border: "none", color: "#5c6370", cursor: "pointer", fontSize: "11px" }}
            >
              Clear
            </button>
          </div>
          {execResult.isHtml ? (
            <iframe
              srcDoc={execResult.htmlContent}
              sandbox="allow-scripts"
              style={{
                width: "100%",
                height: "200px",
                border: "none",
                background: "#ffffff",
                borderRadius: "4px",
                marginTop: "4px"
              }}
            />
          ) : (
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", color: execResult.success ? "#abb2bf" : "#e06c75" }}>
              {execResult.stderr || execResult.stdout || "(No output)"}
            </pre>
          )}
        </div>
      )}

      <div className="overlay-dialog-actions">
        <AppButton variant="small" onClick={handleCloseAttempt}>
          <X size={14} />
          <span>Cancel</span>
        </AppButton>
        <AppButton variant="primary" onClick={handleSave} disabled={!langSearch}>
          <Check size={14} />
          <span>Save Code Block</span>
        </AppButton>
      </div>
    </OverlayDialog>
  );
}

export default CodeBlockModal;
