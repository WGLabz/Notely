import { useRef, useState, useEffect, useMemo } from "react";
import {
  Home,
  Save,
  RotateCcw,
  ChevronRight,
  FolderOpen,
  FileText,
  FilePenLine,
  FileDown,
  PenLine,
  SplitSquareHorizontal,
  Eye,
  Globe,
  Clock,
  MapPin,
  User,
  Images,
  GitCompare,
  Trash2,
  X,
  Filter,
  Sparkles,
  Search,
  ListTree,
} from "lucide-react";
import { EditorPane } from "./EditorPane";
import { MediaTab } from "./MediaTab";
import { formatDate } from "../utils/dateUtils";
import { openInEditor } from "../services/electronService";
import { openWebView } from "../services/electronService";
import { downloadPdf } from "../services/electronService";
import { deleteVersion, readVersion } from "../services/electronService";

function buildDiffRows(latest, previous, options = {}) {
  const { ignoreWhitespace = false } = options;
  const latestLines = (latest || "").replace(/\r\n/g, "\n").split("\n");
  const previousLines = (previous || "").replace(/\r\n/g, "\n").split("\n");
  const max = Math.max(latestLines.length, previousLines.length);
  const rows = [];

  for (let index = 0; index < max; index += 1) {
    const latestLine = latestLines[index] ?? "";
    const previousLine = previousLines[index] ?? "";
    const normalizedLatest = ignoreWhitespace ? latestLine.replace(/\s+/g, " ").trim() : latestLine;
    const normalizedPrevious = ignoreWhitespace ? previousLine.replace(/\s+/g, " ").trim() : previousLine;
    let status = "same";
    if (index >= previousLines.length) status = "added";
    else if (index >= latestLines.length) status = "removed";
    else if (normalizedLatest !== normalizedPrevious) status = "changed";

    rows.push({ line: index + 1, latestLine, previousLine, status });
  }

  return rows;
}

function buildVisibleRows(rows, options = {}) {
  const { showOnlyChanges = false, smartMode = false, contextLines = 2 } = options;

  if (showOnlyChanges) {
    return rows.filter((row) => row.status !== "same");
  }

  if (!smartMode) {
    return rows;
  }

  const changeIndexes = rows
    .map((row, index) => (row.status === "same" ? -1 : index))
    .filter((index) => index >= 0);

  if (!changeIndexes.length) {
    return rows;
  }

  const ranges = [];
  for (const index of changeIndexes) {
    const start = Math.max(0, index - contextLines);
    const end = Math.min(rows.length - 1, index + contextLines);

    const last = ranges[ranges.length - 1];
    if (!last || start > last.end + 1) {
      ranges.push({ start, end });
    } else {
      last.end = Math.max(last.end, end);
    }
  }

  const output = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      output.push({
        kind: "separator",
        id: `sep-${cursor}-${range.start}`,
        omitted: range.start - cursor,
      });
    }

    for (let i = range.start; i <= range.end; i += 1) {
      output.push(rows[i]);
    }
    cursor = range.end + 1;
  }

  if (cursor < rows.length) {
    output.push({
      kind: "separator",
      id: `sep-${cursor}-${rows.length}`,
      omitted: rows.length - cursor,
    });
  }

  return output;
}

const AUTOSAVE_PREF_KEY = "notely:autosave-enabled";
const AUTOSAVE_DELAY_MS = 1200;
const DRAFT_SAVE_DELAY_MS = 450;
const DRAFT_NAMESPACE = "notely:draft:";

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDraftStorageKey(filePath) {
  return `${DRAFT_NAMESPACE}${encodeURIComponent(filePath || "")}`;
}

function readDraftSnapshot(filePath) {
  if (!filePath || typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(filePath));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDraftSnapshot(filePath, snapshot) {
  if (!filePath || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getDraftStorageKey(filePath), JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota and serialization failures.
  }
}

function clearDraftSnapshot(filePath) {
  if (!filePath || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getDraftStorageKey(filePath));
  } catch {
    // Ignore storage failures.
  }
}

function collectMatches(text, query, caseSensitive) {
  const source = String(text || "");
  const needle = String(query || "");
  if (!needle) return [];

  const haystack = caseSensitive ? source : source.toLowerCase();
  const searchNeedle = caseSensitive ? needle : needle.toLowerCase();
  const output = [];
  let fromIndex = 0;

  while (fromIndex <= haystack.length) {
    const at = haystack.indexOf(searchNeedle, fromIndex);
    if (at === -1) break;
    output.push({ start: at, end: at + needle.length });
    fromIndex = at + Math.max(searchNeedle.length, 1);
  }

  return output;
}

export function DocumentDetail({
  document,
  history,
  activeTab,
  setActiveTab,
  mode,
  setMode,
  onChange,
  onRenameDocument,
  onSave,
  onReloadFromDisk,
  onRefreshHistory,
  saving,
  dirty,
  onHome,
  onNotify,
}) {
  const MAX_EDITOR_HISTORY = 200;
  const textareaRef = useRef(null);
  const pdfPopoverRef = useRef(null);
  const historyPopoverRef = useRef(null);
  const renamePopoverRef = useRef(null);
  const historyStateRef = useRef({
    raw: { undo: [], redo: [] },
    cleansed: { undo: [], redo: [] },
  });
  const applyingHistoryRef = useRef(false);
  const [showHistoryPopover, setShowHistoryPopover] = useState(false);
  const [showRenamePopover, setShowRenamePopover] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareMeta, setCompareMeta] = useState(null);
  const [diffRows, setDiffRows] = useState([]);
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [smartMode, setSmartMode] = useState(true);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfOptionsOpen, setPdfOptionsOpen] = useState(false);
  const [pdfExportMode, setPdfExportMode] = useState("formal");
  const [autosaveEnabled, setAutosaveEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(AUTOSAVE_PREF_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState(0);
  const [recoverableDraft, setRecoverableDraft] = useState(null);
  const [draftChecked, setDraftChecked] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findMatchIndex, setFindMatchIndex] = useState(-1);
  const [findMatchTotal, setFindMatchTotal] = useState(0);
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);
  const [renameTitle, setRenameTitle] = useState(document.title || "");
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!pdfOptionsOpen || typeof globalThis?.document === "undefined") return;

    const handleClickOutside = (event) => {
      if (pdfPopoverRef.current && !pdfPopoverRef.current.contains(event.target)) {
        setPdfOptionsOpen(false);
      }
    };

    globalThis.document.addEventListener("mousedown", handleClickOutside);
    return () => {
      if (typeof globalThis?.document !== "undefined") {
        globalThis.document.removeEventListener("mousedown", handleClickOutside);
      }
    };
  }, [pdfOptionsOpen]);

  useEffect(() => {
    if (!showHistoryPopover || typeof globalThis?.document === "undefined") return;

    const handleClickOutside = (event) => {
      if (historyPopoverRef.current && !historyPopoverRef.current.contains(event.target)) {
        setShowHistoryPopover(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowHistoryPopover(false);
      }
    };

    globalThis.document.addEventListener("mousedown", handleClickOutside);
    globalThis.document.addEventListener("keydown", handleEscape);
    return () => {
      if (typeof globalThis?.document !== "undefined") {
        globalThis.document.removeEventListener("mousedown", handleClickOutside);
        globalThis.document.removeEventListener("keydown", handleEscape);
      }
    };
  }, [showHistoryPopover]);

  useEffect(() => {
    if (!showRenamePopover || typeof globalThis?.document === "undefined") return;

    const handleClickOutside = (event) => {
      if (renamePopoverRef.current && !renamePopoverRef.current.contains(event.target)) {
        setShowRenamePopover(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowRenamePopover(false);
      }
    };

    globalThis.document.addEventListener("mousedown", handleClickOutside);
    globalThis.document.addEventListener("keydown", handleEscape);
    return () => {
      if (typeof globalThis?.document !== "undefined") {
        globalThis.document.removeEventListener("mousedown", handleClickOutside);
        globalThis.document.removeEventListener("keydown", handleEscape);
      }
    };
  }, [showRenamePopover]);

  useEffect(() => {
    setRenameTitle(document.title || "");
    setShowRenamePopover(false);
  }, [document.filePath, document.title]);
  const content = activeTab === "raw" ? document.rawNotes : document.cleansed;
  const mediaContent = `${document.rawNotes || ""}\n\n${document.cleansed || ""}`.trim();

  const activeEditorField = activeTab === "raw" ? "rawNotes" : "cleansed";
  const activeHistoryKey = activeTab === "raw" ? "raw" : "cleansed";
  const outlineHeadings = useMemo(() => {
    if (activeTab === "media") return [];
    const lines = String(content || "").split(/\r?\n/);
    const headings = [];
    lines.forEach((lineText, index) => {
      const match = lineText.match(/^(#{1,6})\s+(.+)$/);
      if (!match) return;
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: index + 1,
      });
    });
    return headings;
  }, [activeTab, content]);

  useEffect(() => {
    historyStateRef.current = {
      raw: { undo: [], redo: [] },
      cleansed: { undo: [], redo: [] },
    };
  }, [document.filePath]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(AUTOSAVE_PREF_KEY, autosaveEnabled ? "true" : "false");
    } catch {
      // Ignore preference persistence failures.
    }
  }, [autosaveEnabled]);

  useEffect(() => {
    const snapshot = readDraftSnapshot(document.filePath);
    const isChanged = Boolean(snapshot) && (
      snapshot.header !== (document.header || "")
      || snapshot.rawNotes !== (document.rawNotes || "")
      || snapshot.cleansed !== (document.cleansed || "")
    );
    setRecoverableDraft(isChanged ? snapshot : null);
    setDraftChecked(true);
  }, [document.filePath]);

  useEffect(() => {
    if (!draftChecked) return undefined;
    if (!dirty) return undefined;

    const timer = window.setTimeout(() => {
      writeDraftSnapshot(document.filePath, {
        header: document.header || "",
        rawNotes: document.rawNotes || "",
        cleansed: document.cleansed || "",
        updatedAt: new Date().toISOString(),
      });
    }, DRAFT_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [draftChecked, dirty, document.filePath, document.header, document.rawNotes, document.cleansed]);

  useEffect(() => {
    if (!draftChecked) return;
    if (dirty || recoverableDraft) return;
    clearDraftSnapshot(document.filePath);
  }, [draftChecked, dirty, recoverableDraft, document.filePath]);

  useEffect(() => {
    if (!autosaveEnabled || !dirty || saving || activeTab === "media") return undefined;

    const timer = window.setTimeout(async () => {
      await onSave({ reason: "autosave", silent: true });
      setLastAutoSaveAt(Date.now());
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, dirty, saving, activeTab, onSave, document.filePath, document.header, document.rawNotes, document.cleansed]);

  useEffect(() => {
    const total = collectMatches(content, findQuery, findCaseSensitive).length;
    setFindMatchTotal(total);
    if (!total) {
      setFindMatchIndex(-1);
    } else if (findMatchIndex >= total) {
      setFindMatchIndex(total - 1);
    }
  }, [content, findQuery, findCaseSensitive, findMatchIndex]);

  const updateContent = (value) => {
    if (value === content) return;

    if (!applyingHistoryRef.current) {
      const currentHistory = historyStateRef.current[activeHistoryKey];
      currentHistory.undo.push(content);
      if (currentHistory.undo.length > MAX_EDITOR_HISTORY) {
        currentHistory.undo.shift();
      }
      currentHistory.redo = [];
    }

    onChange({
      ...document,
      [activeEditorField]: value,
    });
  };

  const canUndo = activeTab !== "media" && historyStateRef.current[activeHistoryKey].undo.length > 0;
  const canRedo = activeTab !== "media" && historyStateRef.current[activeHistoryKey].redo.length > 0;

  const jumpToLine = (line) => {
    const safeLine = Math.max(Number(line) || 1, 1);
    if (mode !== "edit" && mode !== "split") {
      setMode("edit");
      requestAnimationFrame(() => jumpToLine(safeLine));
      return;
    }

    const editor = textareaRef?.current;
    if (!editor) return;

    const lines = (content || "").split(/\r?\n/);
    let startIndex = 0;
    for (let index = 0; index < Math.min(safeLine - 1, lines.length); index += 1) {
      startIndex += lines[index].length + 1;
    }

    editor.focus();
    editor.selectionStart = startIndex;
    editor.selectionEnd = startIndex;

    const lineHeight = parseFloat(window.getComputedStyle(editor).lineHeight) || 20;
    editor.scrollTop = Math.max(0, (safeLine - 1) * lineHeight - lineHeight * 3);
  };

  const openFindReplacePanel = () => {
    setShowFindReplace(true);
    const selectedText = textareaRef.current
      ? textareaRef.current.value.slice(textareaRef.current.selectionStart, textareaRef.current.selectionEnd)
      : "";
    if (selectedText && !selectedText.includes("\n")) {
      setFindQuery(selectedText);
    }
  };

  const goToMatch = (nextIndex) => {
    const editor = textareaRef.current;
    if (!editor) return;

    const matches = collectMatches(content, findQuery, findCaseSensitive);
    if (!matches.length) {
      setFindMatchIndex(-1);
      return;
    }

    const safeIndex = ((nextIndex % matches.length) + matches.length) % matches.length;
    const match = matches[safeIndex];

    if (mode !== "edit" && mode !== "split") {
      setMode("edit");
    }

    editor.focus();
    editor.selectionStart = match.start;
    editor.selectionEnd = match.end;
    editor.scrollTop = Math.max(0, editor.scrollTop - 1);
    setFindMatchIndex(safeIndex);
    setFindMatchTotal(matches.length);
  };

  const handleFindNext = () => {
    const editor = textareaRef.current;
    const matches = collectMatches(content, findQuery, findCaseSensitive);
    if (!editor || !matches.length) return;

    const cursor = editor.selectionEnd;
    const next = matches.findIndex((entry) => entry.start > cursor);
    goToMatch(next === -1 ? 0 : next);
  };

  const handleFindPrevious = () => {
    const editor = textareaRef.current;
    const matches = collectMatches(content, findQuery, findCaseSensitive);
    if (!editor || !matches.length) return;

    const cursor = editor.selectionStart;
    let previous = -1;
    for (let index = 0; index < matches.length; index += 1) {
      if (matches[index].start < cursor) previous = index;
      else break;
    }
    goToMatch(previous === -1 ? matches.length - 1 : previous);
  };

  const replaceCurrentMatch = () => {
    if (!findQuery) return;
    const editor = textareaRef.current;
    if (!editor) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = content.slice(start, end);
    const expected = findCaseSensitive ? findQuery : findQuery.toLowerCase();
    const actual = findCaseSensitive ? selected : selected.toLowerCase();

    if (actual !== expected) {
      handleFindNext();
      return;
    }

    const nextValue = `${content.slice(0, start)}${replaceValue}${content.slice(end)}`;
    updateContent(nextValue);

    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const nextCursor = start + replaceValue.length;
      textareaRef.current.focus();
      textareaRef.current.selectionStart = nextCursor;
      textareaRef.current.selectionEnd = nextCursor;
      handleFindNext();
    });
  };

  const replaceAllMatches = () => {
    if (!findQuery) return;
    const matches = collectMatches(content, findQuery, findCaseSensitive);
    if (!matches.length) return;

    const nextValue = findCaseSensitive
      ? content.split(findQuery).join(replaceValue)
      : content.replace(new RegExp(escapeRegExp(findQuery), "gi"), replaceValue);

    updateContent(nextValue);
    onNotify?.(`Replaced ${matches.length} match${matches.length > 1 ? "es" : ""}.`, "success");
  };

  const restoreDraftSnapshot = () => {
    if (!recoverableDraft) return;
    onChange({
      ...document,
      header: recoverableDraft.header || "",
      rawNotes: recoverableDraft.rawNotes || "",
      cleansed: recoverableDraft.cleansed || "",
    });
    setRecoverableDraft(null);
    onNotify?.("Recovered unsaved draft changes.", "success");
  };

  const discardDraftSnapshot = () => {
    clearDraftSnapshot(document.filePath);
    setRecoverableDraft(null);
    onNotify?.("Discarded recovered draft.", "info");
  };

  const handleUndo = () => {
    if (activeTab === "media") return;
    const currentHistory = historyStateRef.current[activeHistoryKey];
    if (!currentHistory.undo.length) return;

    const previousValue = currentHistory.undo.pop();
    currentHistory.redo.push(content);

    applyingHistoryRef.current = true;
    onChange({
      ...document,
      [activeEditorField]: previousValue,
    });
    applyingHistoryRef.current = false;
  };

  const handleRedo = () => {
    if (activeTab === "media") return;
    const currentHistory = historyStateRef.current[activeHistoryKey];
    if (!currentHistory.redo.length) return;

    const nextValue = currentHistory.redo.pop();
    currentHistory.undo.push(content);

    applyingHistoryRef.current = true;
    onChange({
      ...document,
      [activeEditorField]: nextValue,
    });
    applyingHistoryRef.current = false;
  };

  const handleOpenLatestFile = async () => {
    try {
      const result = await openInEditor(document.filePath);
      if (result?.openedWith === "default") {
        onNotify?.("VS Code not available. Opened with system default app.", "info");
      } else {
        onNotify?.("Opened latest note file in VS Code.", "success");
      }
    } catch (error) {
      onNotify?.(error?.message || "Unable to open file in editor.", "error");
    }
  };

  const handleOpenWebsite = async () => {
    try {
      const result = await openWebView(document.filePath, content);
      if (result?.openedWith === "chrome") {
        onNotify?.("Opened website view in Chrome.", "success");
      } else {
        onNotify?.("Chrome not found. Opened in your default browser.", "info");
      }
    } catch (error) {
      onNotify?.(error?.message || "Unable to open website view.", "error");
    }
  };

  const handleDownloadPdf = async () => {
    setPdfOptionsOpen(true);
  };

  const handleRenameSubmit = async () => {
    const nextTitle = renameTitle.trim();
    if (!nextTitle) {
      onNotify?.("Enter a note title first.", "warning");
      return;
    }

    setRenaming(true);
    try {
      const renamed = await onRenameDocument?.(nextTitle);
      if (renamed !== false) {
        setShowRenamePopover(false);
      }
    } finally {
      setRenaming(false);
    }
  };

  const handleConfirmPdfExport = async () => {
    const includeRawNotes = pdfExportMode === "raw" || pdfExportMode === "both";
    const includeCleansed = pdfExportMode === "formal" || pdfExportMode === "both";

    setPdfExporting(true);

    try {
      const result = await downloadPdf({
        filePath: document.filePath,
        title: document.title,
        rawNotes: document.rawNotes,
        cleansed: document.cleansed,
        includeRawNotes,
        includeCleansed,
      });
      if (!result?.canceled) {
        onNotify?.("PDF downloaded.", "success");
        setPdfOptionsOpen(false);
      }
    } catch (error) {
      onNotify?.(error?.message || "Unable to download PDF.", "error");
    } finally {
      setPdfExporting(false);
    }
  };

  const handleCompareVersion = async (entry) => {
    setCompareLoading(true);
    setCompareModalOpen(true);
    setShowOnlyChanges(false);
    setSmartMode(true);
    setCompareMeta(entry);
    setDiffRows([]);

    try {
      const latest = [
        (document.header || "").trim(),
        "# RawNotes",
        (document.rawNotes || "").trim(),
        "",
        "# Cleansed",
        (document.cleansed || "").trim(),
      ].join("\n");

      const previous = await readVersion(document.filePath, entry.versionPath);
      const rows = buildDiffRows(latest, previous, { ignoreWhitespace: smartMode });
      setDiffRows(rows);
    } catch (error) {
      onNotify?.(error?.message || "Unable to load version diff.", "error");
      setCompareModalOpen(false);
    } finally {
      setCompareLoading(false);
    }
  };

  const handleDeleteVersion = async (entry) => {
    const confirmed = window.confirm("Delete this older version? This cannot be undone.");
    if (!confirmed) return;

    try {
      await deleteVersion(document.filePath, entry.versionPath);
      await onRefreshHistory();
      onNotify?.("Older version deleted.", "success");
    } catch (error) {
      onNotify?.(error?.message || "Unable to delete version.", "error");
    }
  };

  const diffSummary = diffRows.reduce(
    (acc, row) => {
      if (row.status === "added") acc.added += 1;
      if (row.status === "removed") acc.removed += 1;
      if (row.status === "changed") acc.changed += 1;
      return acc;
    },
    { added: 0, removed: 0, changed: 0 }
  );

  const visibleRows = buildVisibleRows(diffRows, {
    showOnlyChanges,
    smartMode,
    contextLines: 2,
  });

  const hasSeparators = visibleRows.some((row) => row?.kind === "separator");

  return (
    <div className="detail-shell">
      <div className="detail-topbar">
        <button className="back-button" onClick={onHome} title="Back to home">
          <Home size={18} />
        </button>
        <div className="crumb">Notes / {document.title}</div>
        <div className="save-status">{dirty ? "Unsaved changes" : "Saved"}</div>
        <button
          className={`text-button ${autosaveEnabled ? "active" : ""}`}
          onClick={() => setAutosaveEnabled((value) => !value)}
          title="Toggle autosave"
          type="button"
        >
          <Save size={18} />
          {autosaveEnabled ? "Autosave On" : "Autosave Off"}
        </button>
        <button className="text-button" onClick={handleOpenLatestFile} title="Open latest file">
          <FolderOpen size={18} />
          Open
        </button>
        <div className="topbar-action-wrap" ref={renamePopoverRef}>
          <button
            className={`text-button ${showRenamePopover ? "active" : ""}`}
            onClick={() => setShowRenamePopover((value) => !value)}
            title="Rename note file"
            type="button"
          >
            <PenLine size={18} />
            Rename
          </button>
          {showRenamePopover ? (
            <div className="topbar-popover" role="dialog" aria-label="Rename note">
              <div className="topbar-popover-header">
                <strong>Rename Note</strong>
                <button className="small-button" onClick={() => setShowRenamePopover(false)} type="button" title="Close rename">
                  <X size={16} />
                </button>
              </div>
              <label className="topbar-popover-field">
                <span>File name</span>
                <input
                  type="text"
                  value={renameTitle}
                  onChange={(event) => setRenameTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleRenameSubmit();
                    }
                  }}
                  autoFocus
                />
              </label>
              <div className="topbar-popover-actions">
                <button className="primary-button" onClick={handleRenameSubmit} disabled={renaming} type="button">
                  {renaming ? "Renaming..." : "Rename"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <button className="text-button" onClick={handleOpenWebsite} title="Open website in browser">
          <Globe size={18} />
          Website
        </button>
        <button className="text-button" onClick={onReloadFromDisk} title="Reload file from disk" type="button">
          <RotateCcw size={18} />
          Reload
        </button>
        <div className="topbar-action-wrap">
          <button
            className="text-button"
            onClick={handleDownloadPdf}
            disabled={pdfExporting}
            title="Export note as PDF"
          >
            <FileDown size={18} />
            {pdfExporting ? "Exporting..." : "Export PDF"}
          </button>
          {pdfOptionsOpen ? (
            <div ref={pdfPopoverRef} className="topbar-popover topbar-popover-right" role="dialog" aria-label="Export PDF">
              <div className="topbar-popover-header">
                <strong>Export PDF</strong>
                <button className="small-button" onClick={() => setPdfOptionsOpen(false)} type="button" title="Close export options">
                  <X size={16} />
                </button>
              </div>
              <div className="topbar-popover-field">
                <span>Content</span>
                <select
                  value={pdfExportMode}
                  onChange={(event) => setPdfExportMode(event.target.value)}
                  className="topbar-popover-select"
                >
                  <option value="formal">Formal Notes</option>
                  <option value="raw">Raw Notes</option>
                  <option value="both">Both Raw and Formal</option>
                </select>
              </div>
              <div className="topbar-popover-actions">
                <button
                  className="primary-button"
                  onClick={handleConfirmPdfExport}
                  disabled={pdfExporting}
                  type="button"
                >
                  <FileDown size={14} />
                  {pdfExporting ? "Exporting..." : "Export"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <button
          className="primary-button"
          onClick={onSave}
          disabled={saving || !dirty}
          title="Save document"
        >
          <Save size={18} />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {autosaveEnabled && lastAutoSaveAt ? (
        <div className="autosave-status">Last autosave {new Date(lastAutoSaveAt).toLocaleTimeString()}</div>
      ) : null}

      {recoverableDraft ? (
        <div className="draft-recovery-banner" role="status" aria-live="polite">
          <span>
            Unsaved draft found{recoverableDraft.updatedAt ? ` from ${new Date(recoverableDraft.updatedAt).toLocaleString()}` : ""}.
          </span>
          <div className="draft-recovery-actions">
            <button className="small-button" type="button" onClick={restoreDraftSnapshot}>Restore Draft</button>
            <button className="small-button" type="button" onClick={discardDraftSnapshot}>Discard</button>
          </div>
        </div>
      ) : null}

      <header className="doc-header">
        <div>
          <h1>{document.title}</h1>
          <p>{document.fileName}</p>
        </div>
        <div className="metadata-grid">
          <div>
            <User size={16} />
            <span>Name</span>
            <strong>{document.metadata?.name || "Not captured"}</strong>
          </div>
          <div>
            <Clock size={16} />
            <span>Time</span>
            <strong>{document.metadata?.time || "Not captured"}</strong>
          </div>
          <div>
            <MapPin size={16} />
            <span>Location</span>
            <strong>{document.metadata?.location || "Not captured"}</strong>
          </div>
        </div>
      </header>

      <div className={`workspace ${isOutlineCollapsed ? "outline-panel-collapsed" : ""}`}>
        <main className="editor-panel">
          <div className="tab-row">
            <div className="tabs">
              <button
                className={activeTab === "raw" ? "active" : ""}
                onClick={() => setActiveTab("raw")}
                title="Quick notes"
              >
                <FilePenLine size={16} />
                <span>Quick Notes</span>
              </button>
              <button
                className={activeTab === "cleansed" ? "active" : ""}
                onClick={() => setActiveTab("cleansed")}
                title="Formal notes"
              >
                <FileText size={16} />
                <span>Formal Notes</span>
              </button>
              <button
                className={activeTab === "media" ? "active" : ""}
                onClick={() => setActiveTab("media")}
                title="Media and images"
              >
                <Images size={16} />
                <span>Media</span>
              </button>
            </div>
            <div className="mode-switch">
              <div className="versions-popover-wrap" ref={historyPopoverRef}>
                <button
                  className={showHistoryPopover ? "active" : ""}
                  type="button"
                  title="Toggle versions"
                  onClick={() => setShowHistoryPopover((value) => !value)}
                  aria-expanded={showHistoryPopover}
                >
                  <Clock size={16} />
                  <span>Versions</span>
                </button>
                {showHistoryPopover ? (
                  <div className="versions-popover topbar-popover" role="dialog" aria-label="Versions">
                    <div className="panel-title-row versions-popover-header">
                      <h2>Versions</h2>
                      <div className="panel-actions">
                        <button className="small-button" onClick={onRefreshHistory} title="Refresh history" type="button">
                          <RotateCcw size={16} />
                        </button>
                        <button
                          className="small-button"
                          onClick={() => setShowHistoryPopover(false)}
                          title="Close versions"
                          type="button"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                    {history.length ? (
                      <div className="history-list">
                        {history.map((entry) => (
                          <div className="history-item" key={entry.versionPath}>
                            <strong>{formatDate(entry.createdAt)}</strong>
                            <span>{entry.reason}</span>
                            <div className="history-item-actions">
                              <button
                                className="small-button"
                                onClick={() => handleCompareVersion(entry)}
                                title="Compare with latest"
                                type="button"
                              >
                                <GitCompare size={14} />
                                Compare
                              </button>
                              <button
                                className="small-button"
                                onClick={() => handleDeleteVersion(entry)}
                                title="Delete this version"
                                type="button"
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">Versions appear after the first save.</p>
                    )}
                  </div>
                ) : null}
              </div>
              <button
                className={showFindReplace ? "active" : ""}
                type="button"
                title="Find and replace"
                onClick={() => setShowFindReplace((value) => !value)}
              >
                <Search size={16} />
                <span>Find</span>
              </button>
              <button
                className={isOutlineCollapsed ? "" : "active"}
                type="button"
                title="Toggle outline"
                onClick={() => setIsOutlineCollapsed((value) => !value)}
              >
                <ListTree size={16} />
                <span>Outline</span>
              </button>
              {[
                { key: "edit", label: "Edit", icon: PenLine },
                { key: "split", label: "Split", icon: SplitSquareHorizontal },
                { key: "preview", label: "Preview", icon: Eye },
              ].map((item) => (
                <button
                  className={mode === item.key ? "active" : ""}
                  key={item.key}
                  onClick={() => setMode(item.key)}
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {showFindReplace ? (
            <div className="find-replace-panel" role="region" aria-label="Find and replace">
              <input
                value={findQuery}
                onChange={(event) => setFindQuery(event.target.value)}
                placeholder="Find"
              />
              <input
                value={replaceValue}
                onChange={(event) => setReplaceValue(event.target.value)}
                placeholder="Replace"
              />
              <label className="find-toggle">
                <input
                  type="checkbox"
                  checked={findCaseSensitive}
                  onChange={(event) => setFindCaseSensitive(event.target.checked)}
                />
                Case
              </label>
              <button className="small-button" type="button" onClick={handleFindPrevious}>Prev</button>
              <button className="small-button" type="button" onClick={handleFindNext}>Next</button>
              <button className="small-button" type="button" onClick={replaceCurrentMatch}>Replace</button>
              <button className="small-button" type="button" onClick={replaceAllMatches}>Replace All</button>
              <span className="find-count">{findMatchTotal ? `${Math.max(findMatchIndex + 1, 1)}/${findMatchTotal}` : "0/0"}</span>
            </div>
          ) : null}

          {activeTab === "media" ? (
            <MediaTab content={mediaContent} basePath={document.filePath} onNotify={onNotify} />
          ) : (
            <EditorPane
              value={content}
              onChange={updateContent}
              mode={mode}
              textareaRef={textareaRef}
              basePath={document.filePath}
              showToolbar={activeTab !== "media"}
              onNotify={onNotify}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={canUndo}
              canRedo={canRedo}
              onOpenFind={openFindReplacePanel}
            />
          )}
        </main>

        <aside className={`outline-panel ${isOutlineCollapsed ? "collapsed" : ""}`}>
          {isOutlineCollapsed ? (
            <div className="outline-collapsed-actions">
              <button
                className="small-button"
                onClick={() => setIsOutlineCollapsed(false)}
                title="Open outline panel"
                aria-expanded="false"
              >
                <ListTree size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="panel-title-row">
                <h2>Outline</h2>
                <div className="panel-actions">
                  <button
                    className="small-button"
                    onClick={() => setIsOutlineCollapsed(true)}
                    title="Close outline panel"
                    aria-expanded="true"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              {outlineHeadings.length ? (
                <div className="outline-list">
                  {outlineHeadings.map((entry) => (
                    <button
                      key={`${entry.line}-${entry.text}`}
                      type="button"
                      className={`outline-item level-${entry.level}`}
                      onClick={() => jumpToLine(entry.line)}
                      title={`Go to line ${entry.line}`}
                    >
                      <span>{entry.text}</span>
                      <em>L{entry.line}</em>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">No headings in this section yet.</p>
              )}
            </>
          )}
        </aside>
      </div>

      {compareModalOpen ? (
        <div className="diff-modal-overlay" role="dialog" aria-label="Version diff">
          <div className="diff-modal">
            <div className="diff-modal-header">
              <strong>
                Compare Latest with {compareMeta?.createdAt ? formatDate(compareMeta.createdAt) : "Version"}
              </strong>
              <div className="diff-modal-controls">
                <button
                  className={`small-button ${smartMode ? "active" : ""}`}
                  onClick={() => setSmartMode((value) => !value)}
                  title="Ignore whitespace and collapse unchanged blocks"
                >
                  <Sparkles size={14} />
                  Smart
                </button>
                <button
                  className={`small-button ${showOnlyChanges ? "active" : ""}`}
                  onClick={() => setShowOnlyChanges((value) => !value)}
                  title="Toggle changed lines only"
                >
                  <Filter size={14} />
                  {showOnlyChanges ? "All lines" : "Changes only"}
                </button>
                <button className="small-button" onClick={() => setCompareModalOpen(false)} title="Close diff">
                  <X size={14} />
                </button>
              </div>
            </div>

            {compareLoading ? (
              <p className="muted">Loading diff...</p>
            ) : (
              <div className="diff-table">
                <div className="diff-summary">
                  <span className="summary-pill added">+ {diffSummary.added} added</span>
                  <span className="summary-pill removed">- {diffSummary.removed} removed</span>
                  <span className="summary-pill changed">~ {diffSummary.changed} changed</span>
                  <span className="summary-pill neutral">{visibleRows.length} rows shown</span>
                  {smartMode ? <span className="summary-pill smart">Smart on</span> : null}
                  {hasSeparators ? <span className="summary-pill neutral">Context collapsed</span> : null}
                </div>
                <div className="diff-table-head">
                  <span>Line</span>
                  <span>Latest</span>
                  <span>Selected Version</span>
                </div>
                <div className="diff-table-body">
                  {visibleRows.map((row) => {
                    if (row?.kind === "separator") {
                      return (
                        <div className="diff-separator" key={row.id}>
                          ... {row.omitted} unchanged lines hidden ...
                        </div>
                      );
                    }

                    return (
                      <div className={`diff-row ${row.status}`} key={`diff-${row.line}`}>
                        <span>{row.line}</span>
                        <pre className="diff-cell latest" data-prefix={row.status === "added" ? "+" : row.status === "changed" ? "~" : ""}>
                          {row.latestLine || " "}
                        </pre>
                        <pre className="diff-cell previous" data-prefix={row.status === "removed" ? "-" : row.status === "changed" ? "~" : ""}>
                          {row.previousLine || " "}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

    </div>
  );
}
