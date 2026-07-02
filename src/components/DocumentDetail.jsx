import { memo, useRef, useState, useEffect, useMemo } from "react";
import {
  Save,
  RotateCcw,
  ChevronRight,
  FileText,
  FilePenLine,
  FileDown,
  PenLine,
  SplitSquareHorizontal,
  Eye,
  Clock,
  MapPin,
  User,
  Tag,
  Image,
  ImageOff,
  Images,
  GitCompare,
  Trash2,
  X,
  Filter,
  Sparkles,
  ListTree,
} from "lucide-react";
import { EditorPane } from "./EditorPane";
import { MediaTab } from "./MediaTab";
import { formatDate } from "../utils/dateUtils";
import { downloadPdf } from "../services/electronService";
import { deleteVersion, readVersion } from "../services/electronService";
import { useDocumentEditorActions } from "../hooks/useDocumentEditorActions";
import { useWorkspaceScopedStorage } from "../hooks/useWorkspaceScopedStorage";

function getBlockRange(value, anchorIndex) {
  const text = String(value || "");
  const safeAnchor = Math.max(0, Math.min(Number(anchorIndex) || 0, text.length));

  let start = safeAnchor;
  while (start > 0) {
    const previousBreak = text.lastIndexOf("\n\n", start - 1);
    if (previousBreak === -1) {
      start = 0;
      break;
    }

    const candidate = text.slice(previousBreak + 2, safeAnchor).trim();
    if (candidate) {
      start = previousBreak + 2;
      break;
    }

    start = previousBreak;
  }

  let end = safeAnchor;
  while (end < text.length) {
    const nextBreak = text.indexOf("\n\n", end);
    if (nextBreak === -1) {
      end = text.length;
      break;
    }

    const candidate = text.slice(safeAnchor, nextBreak).trim();
    if (candidate) {
      end = nextBreak;
      break;
    }

    end = nextBreak + 2;
  }

  return {
    start,
    end,
    text: text.slice(start, end),
  };
}

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
const EDITOR_MODE_OPTIONS = [
  { key: "edit", label: "Edit", icon: PenLine, announceLabel: "Edit" },
  { key: "split", label: "Split", icon: SplitSquareHorizontal, announceLabel: "Split" },
  { key: "preview", label: "Preview", icon: Eye, announceLabel: "Preview" },
];

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function getHeaderField(header, fieldName) {
  const normalizedField = String(fieldName || "").trim().toLowerCase();
  const line = String(header || "").split(/\r?\n/).find((item) => {
    const match = item.match(/^([^:]+):\s*(.*)$/);
    return match && match[1].trim().toLowerCase() === normalizedField;
  });
  return line?.replace(/^[^:]+:\s*/, "") || "";
}

function setHeaderField(header, fieldName, value) {
  const normalizedField = String(fieldName || "").trim().toLowerCase();
  const label = String(fieldName || "").trim();
  const nextValue = String(value || "").trim();
  const lines = String(header || "").split(/\r?\n/);
  let replaced = false;
  const nextLines = lines.filter((line) => line.trim() || lines.length > 1).map((line) => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match && match[1].trim().toLowerCase() === normalizedField) {
      replaced = true;
      return nextValue ? `${label}: ${nextValue}` : "";
    }
    return line;
  }).filter(Boolean);

  if (!replaced && nextValue) {
    nextLines.push(`${label}: ${nextValue}`);
  }

  return nextLines.join("\n").trim();
}

function normalizeTagInputFromEnter(value) {
  return String(value || "")
    .split(/[\s,#]+/)
    .map((tag) => tag.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .filter((tag, index, tags) => tags.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === index)
    .join(", ");
}

function parseTagList(value) {
  return String(value || "")
    .split(/[\s,#]+/)
    .map((tag) => tag.trim().replace(/^#+/, ""))
    .filter(Boolean);
}

function mergeTagLists(existingTags, incomingTags) {
  const dedup = new Set();
  const output = [];

  for (const item of [...(existingTags || []), ...(incomingTags || [])]) {
    const tag = String(item || "").trim().replace(/^#+/, "");
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (dedup.has(key)) continue;
    dedup.add(key);
    output.push(tag);
  }

  return output;
}

function autocompleteTagInput(value, suggestions, cursorIndex = null) {
  const text = String(value || "");
  if (!text) return null;
  if (!Array.isArray(suggestions) || !suggestions.length) return null;
  const safeCursor = Number.isFinite(cursorIndex) ? Math.max(0, Math.min(Number(cursorIndex), text.length)) : text.length;
  if (safeCursor !== text.length) return null;
  if (/[\s,#]$/.test(text)) return null;

  let tokenStart = text.length - 1;
  while (tokenStart >= 0 && !/[\s,#]/.test(text[tokenStart])) {
    tokenStart -= 1;
  }
  tokenStart += 1;

  const token = text.slice(tokenStart).trim();
  if (!token) return null;

  const lowerToken = token.toLowerCase();
  const match = suggestions.find((item) => {
    const candidate = String(item || "").trim();
    if (!candidate) return false;
    const lowerCandidate = candidate.toLowerCase();
    return lowerCandidate.startsWith(lowerToken) && lowerCandidate !== lowerToken;
  });

  if (!match) return null;
  return `${text.slice(0, tokenStart)}${match}`;
}

function normalizeTagSuggestionList(value) {
  if (!Array.isArray(value)) return [];
  const dedup = new Map();
  for (const item of value) {
    const tag = String(item || "").trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, tag);
  }
  return [...dedup.values()].sort((left, right) => left.localeCompare(right));
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MONTH_INDEX_BY_LABEL = MONTH_LABELS.reduce((map, label, index) => {
  map[label.toLowerCase()] = index;
  return map;
}, {});

function formatDateTimeLocalForHeader(value) {
  const text = String(value || "").trim();
  if (!text || !text.includes("T")) return "";
  const [datePart, timePart] = text.split("T");
  const [year, month, day] = datePart.split("-").map((item) => Number(item));
  if (!year || !month || !day || !timePart) return "";
  const label = MONTH_LABELS[month - 1];
  if (!label) return "";
  return `${timePart}, ${String(day).padStart(2, "0")} ${label} ${year}`;
}

function parseHeaderDateTimeToInput(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):(\d{2}),\s*(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const day = Number(match[3]);
  const month = MONTH_INDEX_BY_LABEL[String(match[4]).slice(0, 3).toLowerCase()];
  const year = Number(match[5]);

  if (!Number.isInteger(month) || hour < 0 || hour > 23 || minute < 0 || minute > 59 || day < 1 || day > 31 || year < 1000) {
    return "";
  }

  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTimeRangeToInputs(value) {
  const text = String(value || "").trim();
  if (!text) {
    return { from: "", to: "" };
  }

  const parts = text.split(/\s+to\s+/i);
  if (parts.length === 2) {
    return {
      from: parseHeaderDateTimeToInput(parts[0]),
      to: parseHeaderDateTimeToInput(parts[1]),
    };
  }

  return {
    from: parseHeaderDateTimeToInput(text),
    to: "",
  };
}

function buildTimeRangeHeaderValue(fromValue, toValue) {
  const fromLabel = formatDateTimeLocalForHeader(fromValue);
  const toLabel = formatDateTimeLocalForHeader(toValue);

  if (fromLabel && toLabel) return `${fromLabel} to ${toLabel}`;
  if (fromLabel) return fromLabel;
  if (toLabel) return toLabel;
  return "";
}

function parseVersionDocumentContent(value, fallbackDocument = {}) {
  const lines = String(value || "").split(/\r?\n/);
  const rawIndex = lines.findIndex((line) => line.trim().toLowerCase() === "# rawnotes");
  const cleansedIndex = lines.findIndex((line) => line.trim().toLowerCase() === "# cleansed");

  if (rawIndex === -1 && cleansedIndex === -1) {
    return {
      header: fallbackDocument.header || "",
      rawNotes: fallbackDocument.rawNotes || "",
      cleansed: String(value || "").trim(),
    };
  }

  const firstSectionIndex = Math.min(
    rawIndex === -1 ? Number.POSITIVE_INFINITY : rawIndex,
    cleansedIndex === -1 ? Number.POSITIVE_INFINITY : cleansedIndex
  );
  const header = lines.slice(0, firstSectionIndex).join("\n").trim();
  const rawEnd = cleansedIndex > rawIndex && rawIndex !== -1 ? cleansedIndex : lines.length;

  return {
    header: header || fallbackDocument.header || "",
    rawNotes: rawIndex === -1 ? fallbackDocument.rawNotes || "" : lines.slice(rawIndex + 1, rawEnd).join("\n").trim(),
    cleansed: cleansedIndex === -1 ? fallbackDocument.cleansed || "" : lines.slice(cleansedIndex + 1).join("\n").trim(),
  };
}

const MetadataPanel = memo(function MetadataPanel({
  showMetadataPanel,
  isFocusMode,
  titleText,
  titleSaving,
  timeRangeWarning,
  nameText,
  timeFromText,
  timeToText,
  locationText,
  tagItems,
  tagInputText,
  onTitleChange,
  onTitleBlur,
  onTitleKeyDown,
  onNameChange,
  onTimeFromChange,
  onTimeToChange,
  onLocationChange,
  onTagRemove,
  onTagsChange,
  onTagsKeyDown,
}) {
  if (!showMetadataPanel || isFocusMode) return null;

  return (
    <div className="metadata-grid">
      <label className="metadata-card metadata-card-input">
        <FileText size={16} />
        <span>Title</span>
        <input
          type="text"
          value={titleText}
          onChange={onTitleChange}
          onBlur={onTitleBlur}
          onKeyDown={onTitleKeyDown}
          placeholder="Add title"
          aria-label="Note title"
          disabled={titleSaving}
        />
      </label>
      <label className="metadata-card metadata-card-input">
        <User size={16} />
        <span>Name</span>
        <input
          type="text"
          value={nameText}
          onChange={onNameChange}
          placeholder="Add name"
          aria-label="Note name"
        />
      </label>
      <div className="metadata-card metadata-card-time-range">
        <Clock size={16} />
        <span>Time</span>
        <div className="metadata-time-range-row">
          <span className="metadata-time-range-label">From</span>
          <input
            type="datetime-local"
            value={timeFromText}
            onChange={onTimeFromChange}
            aria-label="Start time"
          />
          <span className="metadata-time-range-label">To</span>
          <input
            type="datetime-local"
            value={timeToText}
            onChange={onTimeToChange}
            aria-label="End time"
          />
        </div>
        {timeRangeWarning ? <div className="metadata-warning" role="alert">{timeRangeWarning}</div> : null}
      </div>
      <label className="metadata-card metadata-card-input">
        <MapPin size={16} />
        <span>Location</span>
        <input
          type="text"
          value={locationText}
          onChange={onLocationChange}
          placeholder="Add location"
          aria-label="Note location"
        />
      </label>
      <div className="metadata-card metadata-card-tags">
        <Tag size={16} />
        <span>Tags</span>
        <div className="metadata-tag-chip-list" aria-label="Existing tags">
          {tagItems.length ? tagItems.map((tag) => (
            <span className="metadata-tag-chip" key={tag.toLowerCase()}>
              <span className="metadata-tag-chip-text">#{tag}</span>
              <button
                type="button"
                className="metadata-tag-chip-remove"
                aria-label={`Remove tag ${tag}`}
                title={`Remove ${tag}`}
                onClick={() => onTagRemove(tag)}
              >
                <X size={10} />
              </button>
            </span>
          )) : <span className="metadata-tag-empty">No tags yet</span>}
        </div>
        <input
          type="text"
          value={tagInputText}
          onChange={onTagsChange}
          onKeyDown={onTagsKeyDown}
          placeholder="Type tag and press Enter"
          aria-label="Note tags"
        />
      </div>
    </div>
  );
});

const FindReplacePanel = memo(function FindReplacePanel({
  showFindReplace,
  findQuery,
  setFindQuery,
  replaceValue,
  setReplaceValue,
  findCaseSensitive,
  setFindCaseSensitive,
  onFindPrevious,
  onFindNext,
  onReplace,
  onReplaceAll,
  findMatchIndex,
  findMatchTotal,
}) {
  if (!showFindReplace) return null;

  return (
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
      <button className="small-button" type="button" onClick={onFindPrevious}>Prev</button>
      <button className="small-button" type="button" onClick={onFindNext}>Next</button>
      <button className="small-button" type="button" onClick={onReplace}>Replace</button>
      <button className="small-button" type="button" onClick={onReplaceAll}>Replace All</button>
      <span className="find-count">{findMatchTotal ? `${Math.max(findMatchIndex + 1, 1)}/${findMatchTotal}` : "0/0"}</span>
    </div>
  );
});

const OutlinePanel = memo(function OutlinePanel({
  isOutlineEnabled,
  isOutlineCollapsed,
  setIsOutlineCollapsed,
  outlineHeadings,
  onJumpToLine,
}) {
  if (!isOutlineEnabled) return null;

  return (
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
                  onClick={() => onJumpToLine(entry.line)}
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
  );
});

export function DocumentDetail({
  document,
  history,
  activeTab,
  setActiveTab,
  mode,
  setMode,
  onChange,
  onSave,
  onRenameTitle,
  onRefreshHistory,
  saving,
  dirty,
  menuAction,
  onNotify,
  onBack,
  breadcrumbs = [],
  onNavigateBreadcrumb,
  onOpenAIRequest,
  onInlineAIRequest,
  onRegisterAIEditor,
  inlineGhostSuggestion,
  onAcceptInlineGhost,
  onRejectInlineGhost,
  aiEnabled = true,
  aiPanelVisible = true,
  onShowAI,
  onOpenAISettings,
  onOpenDocument,
  workspaceTagSuggestions = [],
  workspaceStorageScope = "default",
  typoCheckEnabled = true,
  screenCaptureMode = "auto",
  outlineEnabled = true,
  onOutlineEnabledChange,
  focusModeEnabled = false,
  onFocusModeChange,
  aiSidebar = null,
}) {
  const MAX_EDITOR_HISTORY = 200;
  const textareaRef = useRef(null);
  const historyStateRef = useRef({
    raw: { undo: [], redo: [] },
    cleansed: { undo: [], redo: [] },
  });
  const applyingHistoryRef = useRef(false);
  const [showHistoryPopover, setShowHistoryPopover] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareMeta, setCompareMeta] = useState(null);
  const [compareLatestText, setCompareLatestText] = useState("");
  const [comparePreviousText, setComparePreviousText] = useState("");
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [smartMode, setSmartMode] = useState(true);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfOptionsOpen, setPdfOptionsOpen] = useState(false);
  const [pdfExportMode, setPdfExportMode] = useState("formal");
  const [pdfQualityPreset, setPdfQualityPreset] = useState("full");
  const [autosaveEnabled, setAutosaveEnabled] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:autosave-enabled",
    defaultValue: false,
    normalize: (value) => value === true,
    fallbackKey: AUTOSAVE_PREF_KEY,
  });
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState(0);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findMatchIndex, setFindMatchIndex] = useState(-1);
  const [findMatchTotal, setFindMatchTotal] = useState(0);
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);
  const [showMetadataPanel, setShowMetadataPanel] = useState(false);
  const [showOriginalImages, setShowOriginalImages] = useState(false);
  const [inlineLinkedMarkdown, setInlineLinkedMarkdown] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:inline-linked-markdown",
    defaultValue: false,
    normalize: (value) => value === true,
  });
  const [showMediaManager, setShowMediaManager] = useState(false);
  const [titleDraft, setTitleDraft] = useState(document.title || "");
  const [tagDraft, setTagDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);
  const [cachedTagSuggestions, setCachedTagSuggestions] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:tag-suggestions",
    defaultValue: [],
    normalize: normalizeTagSuggestionList,
  });
  const titleRenameInFlightRef = useRef(false);
  const lastSubmittedTitleRef = useRef("");
  const saveEditorSnapshotRef = useRef(null);

  const content = activeTab === "raw" ? document.rawNotes : document.cleansed;
  const mediaContent = `${document.rawNotes || ""}\n\n${document.cleansed || ""}`.trim();
  const nameText = getHeaderField(document.header, "Name");
  const locationText = getHeaderField(document.header, "Location");
  const timeText = getHeaderField(document.header, "Time");
  const timeRange = useMemo(() => parseTimeRangeToInputs(timeText), [timeText]);
  const timeRangeWarning = useMemo(() => {
    if (!timeRange.from || !timeRange.to) return "";
    const fromTs = Date.parse(timeRange.from);
    const toTs = Date.parse(timeRange.to);
    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) return "";
    return fromTs > toTs ? "End time must be after start time." : "";
  }, [timeRange.from, timeRange.to]);
  const tagText = getHeaderField(document.header, "Tags");
  const tagItems = useMemo(() => mergeTagLists(parseTagList(tagText), []), [tagText]);
  const combinedTagSuggestions = useMemo(() => {
    const merged = normalizeTagSuggestionList([
      ...workspaceTagSuggestions,
      ...cachedTagSuggestions,
      ...tagItems,
    ]);
    return merged.slice(0, 100);
  }, [workspaceTagSuggestions, cachedTagSuggestions, tagItems]);

  useEffect(() => {
    setTitleDraft(document.title || "");
    setTagDraft("");
    titleRenameInFlightRef.current = false;
    lastSubmittedTitleRef.current = "";
  }, [document.title, document.filePath]);

  const activeEditorField = activeTab === "raw" ? "rawNotes" : "cleansed";
  const activeHistoryKey = activeTab === "raw" ? "raw" : "cleansed";
  const isOutlineEnabled = outlineEnabled !== false;
  const isFocusMode = focusModeEnabled === true;
  const setEditorMode = (nextMode, options = {}) => {
    const { announce = true, force = false } = options;
    if (!force && showMediaManager) {
      if (announce) {
        onNotify?.("Close Assets view to switch editor mode.", "info");
      }
      return false;
    }

    setMode(nextMode);
    if (announce) {
      const activeMode = EDITOR_MODE_OPTIONS.find((item) => item.key === nextMode);
      onNotify?.(`Editor mode: ${activeMode?.announceLabel || nextMode}.`, "info");
    }
    return true;
  };

  const outlineHeadings = useMemo(() => {
    if (showMediaManager) return [];
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
  }, [content, showMediaManager]);

  const getCurrentAIContext = () => {
    const editor = textareaRef.current;
    const currentValue = String(content || "");
    const selectionStart = Number(editor?.selectionStart) || 0;
    const selectionEnd = Number(editor?.selectionEnd) || selectionStart;
    const hasSelection = selectionEnd > selectionStart;
    const selectedText = hasSelection
      ? currentValue.slice(selectionStart, selectionEnd)
      : "";
    const anchor = hasSelection ? selectionStart : selectionEnd;
    const currentBlock = getBlockRange(currentValue, anchor);

    return {
      tab: activeTab,
      field: activeEditorField,
      selectionStart,
      selectionEnd,
      hasSelection,
      selectedText,
      currentBlock,
      cursorOffset: selectionEnd,
      contentLength: currentValue.length,
    };
  };

  const applyAIResult = ({ text, mode, previewOnly = false, insertAt = null }) => {
    const editor = textareaRef.current;
    const currentValue = String(content || "");
    const insertion = String(text || "");
    if (!editor || !insertion) {
      return { applied: false, reason: "No editor target available." };
    }

    const selectionStart = Number(editor.selectionStart) || 0;
    const selectionEnd = Number(editor.selectionEnd) || selectionStart;
    const currentBlock = getBlockRange(currentValue, selectionEnd);

    let start = Number.isInteger(insertAt) ? insertAt : selectionEnd;
    let end = Number.isInteger(insertAt) ? insertAt : selectionEnd;

    if (mode === "replace-selection") {
      start = selectionStart;
      end = selectionEnd;
      if (end <= start) {
        return { applied: false, reason: "Select text to replace." };
      }
    } else if (mode === "replace-block") {
      start = currentBlock.start;
      end = currentBlock.end;
      if (end <= start) {
        return { applied: false, reason: "No current block found." };
      }
    }

    if (previewOnly && mode !== "insert") {
      return {
        applied: false,
        preview: true,
        mode,
        currentText: currentValue.slice(start, end),
        nextText: insertion,
        start,
        end,
      };
    }

    const nextValue = `${currentValue.slice(0, start)}${insertion}${currentValue.slice(end)}`;
    updateContent(nextValue);

    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      const nextCursor = start + insertion.length;
      textareaRef.current.selectionStart = nextCursor;
      textareaRef.current.selectionEnd = nextCursor;
    });

    return { applied: true, mode, start, end };
  };

  useEffect(() => {
    if (typeof onRegisterAIEditor !== "function") return undefined;

    onRegisterAIEditor({
      getContext: getCurrentAIContext,
      applyResult: applyAIResult,
    });

    return () => onRegisterAIEditor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterAIEditor, content, activeTab, activeEditorField]);

  useEffect(() => {
    historyStateRef.current = {
      raw: { undo: [], redo: [] },
      cleansed: { undo: [], redo: [] },
    };
  }, [document.filePath]);

  useEffect(() => {
    if (!saving) return;
    const editor = textareaRef.current;
    if (!editor) return;

    saveEditorSnapshotRef.current = {
      filePath: document.filePath,
      tab: activeTab,
      selectionStart: Number(editor.selectionStart) || 0,
      selectionEnd: Number(editor.selectionEnd) || 0,
      scrollTop: Number(editor.scrollTop) || 0,
    };
  }, [saving, document.filePath, activeTab]);

  useEffect(() => {
    if (saving) return;
    const snapshot = saveEditorSnapshotRef.current;
    if (!snapshot) return;

    const shouldRestore = snapshot.filePath === document.filePath && snapshot.tab === activeTab;
    saveEditorSnapshotRef.current = null;
    if (!shouldRestore) return;

    let canceled = false;
    const restorePosition = () => {
      if (canceled) return;
      const editor = textareaRef.current;
      if (!editor) return;
      editor.selectionStart = snapshot.selectionStart;
      editor.selectionEnd = snapshot.selectionEnd;
      editor.scrollTop = snapshot.scrollTop;
    };

    requestAnimationFrame(restorePosition);
    const lateRestoreA = window.setTimeout(restorePosition, 80);
    const lateRestoreB = window.setTimeout(restorePosition, 220);

    return () => {
      canceled = true;
      window.clearTimeout(lateRestoreA);
      window.clearTimeout(lateRestoreB);
    };
  }, [saving, document.filePath, activeTab]);

  useEffect(() => {
    if (!autosaveEnabled || !dirty || saving || showMediaManager) return undefined;

    const timer = window.setTimeout(async () => {
      await onSave({ reason: "autosave", silent: true });
      setLastAutoSaveAt(Date.now());
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, dirty, saving, showMediaManager, onSave, document.filePath, document.header, document.rawNotes, document.cleansed]);

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

  const canUndo = !showMediaManager && historyStateRef.current[activeHistoryKey].undo.length > 0;
  const canRedo = !showMediaManager && historyStateRef.current[activeHistoryKey].redo.length > 0;

  const jumpToLine = (line) => {
    const safeLine = Math.max(Number(line) || 1, 1);
    if (mode !== "edit" && mode !== "split") {
      setEditorMode("edit", { announce: false, force: true });
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

    const lineHeight = typeof editor.getLineHeight === "function"
      ? editor.getLineHeight()
      : parseFloat(window.getComputedStyle(editor).lineHeight) || 20;
    const viewportHeight = Number(editor.clientHeight) || lineHeight * 20;
    const targetTop = (safeLine - 1) * lineHeight - viewportHeight * 0.66;
    const maxScroll = Math.max(0, (Number(editor.scrollHeight) || 0) - viewportHeight);
    editor.scrollTop = Math.max(0, Math.min(targetTop, maxScroll));
  };

  const openFindReplacePanel = () => {
    setShowFindReplace(true);
    const selectedText = textareaRef.current
      ? textareaRef.current.value.slice(textareaRef.current.selectionStart, textareaRef.current.selectionEnd)
      : "";
    if (selectedText && !selectedText.includes("\n")) {
      setFindQuery(selectedText);
    }
    onNotify?.("Find panel opened.", "info");
  };

  const handleTagsChange = (event) => {
    const typedValue = event.target.value;
    const typedCursor = event.target.selectionStart;
    const completedValue = autocompleteTagInput(typedValue, combinedTagSuggestions, typedCursor);
    const isSingleCharInsert = event.nativeEvent?.inputType === "insertText";
    const nextValue = completedValue && isSingleCharInsert ? completedValue : typedValue;
    const input = event.target;

    setTagDraft(nextValue);

    if (completedValue && isSingleCharInsert) {
      requestAnimationFrame(() => {
        if (!input || typeof input.setSelectionRange !== "function") return;
        input.setSelectionRange(typedValue.length, completedValue.length);
      });
    }
  };

  const handleNameChange = (event) => {
    onChange({
      ...document,
      header: setHeaderField(document.header, "Name", event.target.value),
    });
  };

  const handleLocationChange = (event) => {
    onChange({
      ...document,
      header: setHeaderField(document.header, "Location", event.target.value),
    });
  };

  const handleTimeFromChange = (event) => {
    onChange({
      ...document,
      header: setHeaderField(document.header, "Time", buildTimeRangeHeaderValue(event.target.value, timeRange.to)),
    });
  };

  const handleTimeToChange = (event) => {
    onChange({
      ...document,
      header: setHeaderField(document.header, "Time", buildTimeRangeHeaderValue(timeRange.from, event.target.value)),
    });
  };

  const handleTagsKeyDown = (event) => {
    if (event.key === "Tab") {
      const completedValue = autocompleteTagInput(tagDraft, combinedTagSuggestions);
      if (!completedValue) return;
      event.preventDefault();
      setTagDraft(completedValue);
      requestAnimationFrame(() => {
        if (!event.currentTarget || typeof event.currentTarget.setSelectionRange !== "function") return;
        event.currentTarget.setSelectionRange(tagDraft.length, completedValue.length);
      });
      return;
    }

    if (event.key === "Backspace" && !tagDraft.trim() && tagItems.length) {
      event.preventDefault();
      const nextTags = tagItems.slice(0, -1);
      onChange({
        ...document,
        header: setHeaderField(document.header, "Tags", nextTags.join(", ")),
      });
      return;
    }

    if (event.key !== "Enter") return;
    event.preventDefault();

    const normalizedTags = normalizeTagInputFromEnter(tagDraft);
    const nextTags = parseTagList(normalizedTags);
    if (!nextTags.length) return;
    const mergedTags = mergeTagLists(tagItems, nextTags);

    onChange({
      ...document,
      header: setHeaderField(document.header, "Tags", mergedTags.join(", ")),
    });
    setTagDraft("");

    if (nextTags.length) {
      setCachedTagSuggestions((current) => normalizeTagSuggestionList([...(current || []), ...nextTags]).slice(0, 100));
    }
  };

  const handleTagRemove = (tagToRemove) => {
    const targetKey = String(tagToRemove || "").trim().toLowerCase();
    if (!targetKey) return;
    const nextTags = tagItems.filter((tag) => tag.toLowerCase() !== targetKey);
    onChange({
      ...document,
      header: setHeaderField(document.header, "Tags", nextTags.join(", ")),
    });
  };

  const handleManualSave = async () => {
    try {
      await onSave({ reason: "manual-save", silent: true });
      onNotify?.("Note saved.", "success");
    } catch (error) {
      onNotify?.(error?.message || "Unable to save note.", "error");
    }
  };

  const commitTitleRename = async () => {
    const nextTitle = String(titleDraft || "").trim();
    if (!nextTitle || nextTitle === document.title || typeof onRenameTitle !== "function") {
      setTitleDraft(document.title || "");
      return;
    }

    if (titleRenameInFlightRef.current) {
      return;
    }

    if (lastSubmittedTitleRef.current === nextTitle) {
      return;
    }

    titleRenameInFlightRef.current = true;
    lastSubmittedTitleRef.current = nextTitle;
    setTitleSaving(true);
    try {
      const renamed = await onRenameTitle(nextTitle);
      if (renamed === false) {
        lastSubmittedTitleRef.current = "";
      }
    } catch {
      lastSubmittedTitleRef.current = "";
    } finally {
      titleRenameInFlightRef.current = false;
      setTitleSaving(false);
    }
  };

  const handleTitleBlur = () => {
    const nextTitle = String(titleDraft || "").trim();
    const currentTitle = String(document.title || "").trim();
    if (!nextTitle) {
      setTitleDraft(document.title || "");
      return;
    }
    if (nextTitle === currentTitle || titleRenameInFlightRef.current) {
      return;
    }

    const confirmed = window.confirm(`Rename note to "${nextTitle}"?`);
    if (!confirmed) {
      setTitleDraft(document.title || "");
      return;
    }

    commitTitleRename();
  };

  const handleTitleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTitleRename();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setTitleDraft(document.title || "");
      event.currentTarget.blur();
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
      setEditorMode("edit", { announce: false, force: true });
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



  const handleUndo = () => {
    if (showMediaManager) return false;
    const currentHistory = historyStateRef.current[activeHistoryKey];
    if (!currentHistory.undo.length) return false;

    const previousValue = currentHistory.undo.pop();
    currentHistory.redo.push(content);

    applyingHistoryRef.current = true;
    onChange({
      ...document,
      [activeEditorField]: previousValue,
    });
    applyingHistoryRef.current = false;
    return true;
  };

  const handleRedo = () => {
    if (showMediaManager) return false;
    const currentHistory = historyStateRef.current[activeHistoryKey];
    if (!currentHistory.redo.length) return false;

    const nextValue = currentHistory.redo.pop();
    currentHistory.undo.push(content);

    applyingHistoryRef.current = true;
    onChange({
      ...document,
      [activeEditorField]: nextValue,
    });
    applyingHistoryRef.current = false;
    return true;
  };

  useDocumentEditorActions({
    menuAction,
    isFocusMode,
    showMediaManager,
    textareaRef,
    setFindQuery,
    openFindReplacePanel,
    toggleOutlineEnabled: () => onOutlineEnabledChange?.((value) => value === false),
    toggleSplitPreview: () => {
      if (!showMediaManager) {
        setMode((value) => (value === "split" ? "edit" : "split"));
        onNotify?.("Split preview toggled.", "info");
      }
    },
    toggleFocusMode: () => onFocusModeChange?.((value) => value !== true),
    openPdfOptions: () => {
      setPdfExportMode("formal");
      setPdfQualityPreset("full");
      setPdfOptionsOpen(true);
    },
    openHistoryVersions: () => setShowHistoryPopover(true),
    setEditorMode,
    handleManualSave,
    handleUndo,
    handleRedo,
    onNotify,
  });

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
        pdfQualityPreset,
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
    setCompareLatestText("");
    setComparePreviousText("");

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
      setCompareLatestText(latest);
      setComparePreviousText(previous || "");
    } catch (error) {
      onNotify?.(error?.message || "Unable to load version diff.", "error");
      setCompareModalOpen(false);
    } finally {
      setCompareLoading(false);
    }
  };

  const diffRows = useMemo(() => {
    if (!compareLatestText && !comparePreviousText) {
      return [];
    }
    return buildDiffRows(compareLatestText, comparePreviousText, { ignoreWhitespace: smartMode });
  }, [compareLatestText, comparePreviousText, smartMode]);

  const handleRestoreVersion = async (entry) => {
    const confirmed = window.confirm("Restore this version into the editor? Review it, then save to keep the restored content.");
    if (!confirmed) return;

    try {
      const previous = await readVersion(document.filePath, entry.versionPath);
      const restored = parseVersionDocumentContent(previous, document);
      onChange({
        ...document,
        header: restored.header,
        rawNotes: restored.rawNotes,
        cleansed: restored.cleansed,
      });
      setActiveTab("cleansed");
      setShowHistoryPopover(false);
      onNotify?.("Version restored to editor. Save to keep it.", "success");
    } catch (error) {
      onNotify?.(error?.message || "Unable to restore version.", "error");
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
        <nav className="detail-breadcrumb" aria-label="Note location">
          {breadcrumbs.length ? breadcrumbs.map((segment) => (
            <span className="detail-breadcrumb-part" key={segment.path}>
              <button
                className="detail-breadcrumb-link"
                type="button"
                onClick={() => onNavigateBreadcrumb?.(segment.path)}
              >
                {segment.label}
              </button>
              <span className="detail-breadcrumb-separator" aria-hidden="true">/</span>
            </span>
          )) : (
            <span className="detail-breadcrumb-part">
              <button className="detail-breadcrumb-link" type="button" onClick={onBack}>Notes</button>
              <span className="detail-breadcrumb-separator" aria-hidden="true">/</span>
            </span>
          )}
          <span className="detail-breadcrumb-current" title={document.title}>{document.title}</span>
        </nav>
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
      </div>

      {autosaveEnabled && lastAutoSaveAt ? (
        <div className="autosave-status">Last autosave {new Date(lastAutoSaveAt).toLocaleTimeString()}</div>
      ) : null}

      <header className="doc-header">
        <div className="doc-header-main">
          <h1>{document.title}</h1>
          <p className="doc-header-file">{document.fileName}</p>
        </div>
        <div className="panel-actions">
          <button
            className={`small-button ${showMetadataPanel ? "active" : ""}`}
            type="button"
            title="Toggle note metadata"
            onClick={() => setShowMetadataPanel((value) => !value)}
          >
            {showMetadataPanel ? "Hide details" : "Show details"}
          </button>
        </div>
      </header>

      <MetadataPanel
        showMetadataPanel={showMetadataPanel}
        isFocusMode={isFocusMode}
        titleText={titleDraft}
        titleSaving={titleSaving}
        timeRangeWarning={timeRangeWarning}
        nameText={nameText}
        timeFromText={timeRange.from}
        timeToText={timeRange.to}
        locationText={locationText}
        tagItems={tagItems}
        tagInputText={tagDraft}
        onTitleChange={(event) => setTitleDraft(event.target.value)}
        onTitleBlur={handleTitleBlur}
        onTitleKeyDown={handleTitleKeyDown}
        onNameChange={handleNameChange}
        onTimeFromChange={handleTimeFromChange}
        onTimeToChange={handleTimeToChange}
        onLocationChange={handleLocationChange}
        onTagRemove={handleTagRemove}
        onTagsChange={handleTagsChange}
        onTagsKeyDown={handleTagsKeyDown}
      />

      <div className={`workspace ${isOutlineEnabled ? "" : "outline-panel-disabled"} ${isOutlineCollapsed ? "outline-panel-collapsed" : ""} ${isFocusMode ? "focus-mode" : ""} ${aiSidebar ? "with-ai-chat" : ""}`}>
        <main className="editor-panel">
          <div className="tab-row">
            <div className="tabs">
              <button
                className={activeTab === "raw" ? "active" : ""}
                onClick={() => {
                  setShowMediaManager(false);
                  setActiveTab("raw");
                }}
                title="Quick notes"
              >
                <FilePenLine size={16} />
                <span>Quick Notes</span>
              </button>
              <button
                className={activeTab === "cleansed" ? "active" : ""}
                onClick={() => {
                  setShowMediaManager(false);
                  setActiveTab("cleansed");
                }}
                title="Formal notes"
              >
                <FileText size={16} />
                <span>Formal Notes</span>
              </button>
            </div>
            <div className="mode-switch">
              <button
                className={showOriginalImages ? "active" : ""}
                type="button"
                title="Toggle original image rendering in media preview"
                onClick={() => setShowOriginalImages((value) => !value)}
              >
                {showOriginalImages ? <Image size={16} /> : <ImageOff size={16} />}
                <span>Show Original Images</span>
              </button>
              <button
                className={inlineLinkedMarkdown ? "active" : ""}
                type="button"
                title="Render linked markdown files inline in preview"
                onClick={() => setInlineLinkedMarkdown((value) => !value)}
              >
                <FileText size={16} />
                <span>Inline Linked Notes</span>
              </button>
              <button
                className={showMediaManager ? "active" : ""}
                type="button"
                title="Open assets manager"
                onClick={() => setShowMediaManager((value) => !value)}
              >
                <Images size={16} />
                <span>Assets</span>
              </button>
              <div className="button-group-separator" />
              <div className="button-group">
                {EDITOR_MODE_OPTIONS.map((item) => (
                  <button
                    className={mode === item.key ? "active" : ""}
                    key={item.key}
                    disabled={showMediaManager}
                    onClick={() => setEditorMode(item.key, { announce: false })}
                    title={showMediaManager ? "Close Assets view to switch mode" : `Switch to ${item.label} mode`}
                  >
                    <item.icon size={16} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <FindReplacePanel
            showFindReplace={showFindReplace}
            findQuery={findQuery}
            setFindQuery={setFindQuery}
            replaceValue={replaceValue}
            setReplaceValue={setReplaceValue}
            findCaseSensitive={findCaseSensitive}
            setFindCaseSensitive={setFindCaseSensitive}
            onFindPrevious={handleFindPrevious}
            onFindNext={handleFindNext}
            onReplace={replaceCurrentMatch}
            onReplaceAll={replaceAllMatches}
            findMatchIndex={findMatchIndex}
            findMatchTotal={findMatchTotal}
          />

          <EditorPane
            value={content}
            onChange={updateContent}
            mode={mode}
            textareaRef={textareaRef}
            basePath={document.filePath}
            workspaceStorageScope={workspaceStorageScope}
            typoCheckEnabled={typoCheckEnabled}
            screenCaptureMode={screenCaptureMode}
            showToolbar={!showMediaManager}
            onNotify={onNotify}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            onOpenFind={openFindReplacePanel}
            aiEnabled={aiEnabled}
            onOpenAIRequest={onOpenAIRequest}
            onOpenAISettings={onOpenAISettings}
            onInlineAIContinue={() => {
              onInlineAIRequest?.({
                initialQuery: "Continue the current paragraph naturally in the same tone and structure.",
                target: "block",
                source: "inline-continue",
              });
            }}
            ghostSuggestion={inlineGhostSuggestion}
            onAcceptInlineGhost={onAcceptInlineGhost}
            onRejectInlineGhost={onRejectInlineGhost}
            showOriginalImages={showOriginalImages}
            inlineLinkedMarkdown={inlineLinkedMarkdown}
          />
        </main>

        <OutlinePanel
          isOutlineEnabled={isOutlineEnabled}
          isOutlineCollapsed={isOutlineCollapsed}
          setIsOutlineCollapsed={setIsOutlineCollapsed}
          outlineHeadings={outlineHeadings}
          onJumpToLine={jumpToLine}
        />
        {aiSidebar}
        {!aiPanelVisible && aiEnabled ? (
          <button
            type="button"
            className="ai-panel-reveal"
            onClick={onShowAI}
            title="Show AI panel"
            aria-label="Show AI panel"
          >
            AI
          </button>
        ) : null}
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

      {showHistoryPopover ? (
        <div className="overlay-dialog" role="dialog" aria-modal="true" aria-label="Versions">
          <div className="overlay-dialog-card">
            <div className="overlay-dialog-header">
              <h2>Versions</h2>
              <button className="icon-button" onClick={() => setShowHistoryPopover(false)} type="button" aria-label="Close versions dialog">
                <X size={16} />
              </button>
            </div>
            <div className="overlay-dialog-actions split">
              <button className="small-button" onClick={onRefreshHistory} title="Refresh history" type="button">
                <RotateCcw size={16} />
                Refresh
              </button>
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
                        onClick={() => handleRestoreVersion(entry)}
                        title="Restore this version into the editor"
                        type="button"
                      >
                        <RotateCcw size={14} />
                        Restore
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
        </div>
      ) : null}

      {showMediaManager ? (
        <div className="overlay-dialog" role="dialog" aria-modal="true" aria-label="Assets">
          <div className="overlay-dialog-card assets-dialog-card">
            <div className="overlay-dialog-header assets-dialog-header">
              <div className="assets-dialog-title-group">
                <h2>Assets Library</h2>
                <p>Manage images referenced across your notes.</p>
              </div>
              <button
                className="icon-button assets-close-button"
                onClick={() => setShowMediaManager(false)}
                type="button"
                aria-label="Close assets dialog"
              >
                <X size={16} />
              </button>
            </div>
            <div className="assets-dialog-body">
              <MediaTab
                content={mediaContent}
                basePath={document.filePath}
                onNotify={onNotify}
                onOpenDocument={async (filePath) => {
                  setShowMediaManager(false);
                  await onOpenDocument?.(filePath);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {pdfOptionsOpen ? (
        <div className="overlay-dialog" role="dialog" aria-modal="true" aria-label="Export PDF">
          <div className="overlay-dialog-card">
            <div className="overlay-dialog-header">
              <h2>Export PDF</h2>
              <button className="icon-button" onClick={() => setPdfOptionsOpen(false)} type="button" aria-label="Close export options">
                <X size={16} />
              </button>
            </div>
            <label className="overlay-dialog-field">
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
            </label>
            <label className="overlay-dialog-field">
              <span>Quality</span>
              <select
                value={pdfQualityPreset}
                onChange={(event) => setPdfQualityPreset(event.target.value)}
                className="topbar-popover-select"
              >
                <option value="full">Full quality</option>
                <option value="balanced">Balanced size</option>
                <option value="compact">Compact file</option>
              </select>
            </label>
            <div className="overlay-dialog-actions">
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
        </div>
      ) : null}

    </div>
  );
}
