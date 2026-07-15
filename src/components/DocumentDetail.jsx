import { memo, useRef, useState, useEffect, useMemo } from "react";
import {
  Save,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  FilePenLine,
  FileDown,
  PenLine,
  SplitSquareHorizontal,
  Eye,
  EyeOff,
  Clock,
  MapPin,
  User,
  Tag,
  Images,
  X,
  ListTree,
  Clipboard,
  Code2,
  CheckSquare,
  Square,
  Type,
  Maximize,
  Minimize,
} from "lucide-react";
import AppButton from "./AppButton";
import AppIconButton from "./AppIconButton";
import AppInput from "./AppInput";
import { EditorPane } from "./EditorPane";
import { MediaTab } from "./MediaTab";
import OverlayDialog from "./OverlayDialog";
import DialogSelectField from "./DialogSelectField";

import { downloadPdf } from "../services/electronService";
import { GitNoteHistoryPanel } from "./GitNoteHistoryPanel";
import { useDocumentEditorActions } from "../hooks/useDocumentEditorActions";
import { useWorkspaceScopedStorage } from "../hooks/useWorkspaceScopedStorage";
import { renderMarkdown } from "../utils/renderUtils";
import { extractTasksFromText, getTaskCountsFromText } from "../utils/taskUtils";
import useConfirm from "../hooks/useConfirm";

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

function tryBuildFindRegex(pattern, caseSensitive) {
  const source = String(pattern || "");
  if (!source) return null;
  try {
    return new RegExp(source, caseSensitive ? "gm" : "gim");
  } catch {
    return null;
  }
}

function isValidFindRegex(pattern) {
  if (!pattern) return true;
  try {
    void new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function collectMatches(text, query, caseSensitive, useRegex = false) {
  const source = String(text || "");
  const needle = String(query || "");
  if (!needle) return [];

  if (useRegex) {
    const regex = tryBuildFindRegex(needle, caseSensitive);
    if (!regex) return [];

    const output = [];
    let match;
    while ((match = regex.exec(source)) !== null) {
      const matchText = String(match[0] || "");
      if (!matchText.length) {
        regex.lastIndex += 1;
        continue;
      }
      output.push({ start: match.index, end: match.index + matchText.length });
    }
    return output;
  }

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

function getSelectedMatchIndex(matches, selectionStart, selectionEnd) {
  if (!matches.length) return -1;
  const safeStart = Number.isFinite(selectionStart) ? selectionStart : -1;
  const safeEnd = Number.isFinite(selectionEnd) ? selectionEnd : -1;
  if (safeStart < 0 || safeEnd < safeStart) return -1;

  return matches.findIndex((match) => match.start === safeStart && match.end === safeEnd);
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
        <AppInput
          type="text"
          className="metadata-input"
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
        <AppInput
          type="text"
          className="metadata-input"
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
          <div className="metadata-time-range-field">
            <span className="metadata-time-range-label">From</span>
            <AppInput
              type="datetime-local"
              className="metadata-input metadata-datetime"
              value={timeFromText}
              onChange={onTimeFromChange}
              aria-label="Start time"
            />
          </div>
          <div className="metadata-time-range-field">
            <span className="metadata-time-range-label">To</span>
            <AppInput
              type="datetime-local"
              className="metadata-input metadata-datetime"
              value={timeToText}
              onChange={onTimeToChange}
              aria-label="End time"
            />
          </div>
        </div>
        {timeRangeWarning ? <div className="metadata-warning" role="alert">{timeRangeWarning}</div> : null}
      </div>
      <label className="metadata-card metadata-card-input">
        <MapPin size={16} />
        <span>Location</span>
        <AppInput
          type="text"
          className="metadata-input"
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
                data-tooltip={`Remove ${tag}`}
                onClick={() => onTagRemove(tag)}
              >
                <X size={12} />
              </button>
            </span>
          )) : <span className="metadata-tag-empty">No tags yet</span>}
        </div>
        <AppInput
          type="text"
          className="metadata-input"
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
  showReplaceControls,
  findQuery,
  setFindQuery,
  replaceValue,
  setReplaceValue,
  findCaseSensitive,
  setFindCaseSensitive,
  findUseRegex,
  setFindUseRegex,
  regexValid,
  onFindPrevious,
  onFindNext,
  onReplace,
  onReplaceAll,
  currentMatchLabel,
  onClose,
}) {
  if (!showFindReplace) return null;
  const panelLabel = showReplaceControls ? "Find and replace" : "Find in note";
  const closeLabel = showReplaceControls ? "Close find and replace" : "Close find";

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        onFindPrevious?.();
      } else {
        onFindNext?.();
      }
    }
  };

  return (
    <div className="find-replace-panel" role="region" aria-label={panelLabel} onKeyDown={handleKeyDown}>
      <div className="find-input-group">
        <AppInput
          value={findQuery}
          onChange={(event) => setFindQuery(event.target.value)}
          placeholder="Find"
          autoFocus
          aria-label="Find query"
          className={`find-panel-input find-panel-input-query${findUseRegex && !regexValid ? " find-input-error" : ""}`}
        />
        {showReplaceControls ? (
          <AppInput
            value={replaceValue}
            onChange={(event) => setReplaceValue(event.target.value)}
            placeholder="Replace"
            aria-label="Replace with"
            className="find-panel-input find-panel-input-replace"
          />
        ) : null}
      </div>
      <div className="find-toggle-group" aria-label="Find options">
        <button
          type="button"
          className={`find-toggle-button ${findCaseSensitive ? "active" : ""}`}
          onClick={() => setFindCaseSensitive((value) => !value)}
          aria-pressed={findCaseSensitive}
          aria-label="Toggle case sensitive search"
          data-tooltip="Match case"
        >
          <Type size={14} />
          Case
        </button>
        <button
          type="button"
          className={`find-toggle-button ${findUseRegex ? "active" : ""}${findUseRegex && !regexValid ? " error" : ""}`}
          onClick={() => setFindUseRegex((value) => !value)}
          aria-pressed={findUseRegex}
          aria-label="Toggle regular expression search"
          data-tooltip="Use regular expression"
        >
          <Code2 size={14} />
          Regex
        </button>
      </div>
      <AppButton variant="small" className="find-action-button" onClick={onFindPrevious} data-tooltip="Previous match (Shift+Enter)">
        <ChevronLeft size={14} />
        Prev
      </AppButton>
      <AppButton variant="small" className="find-action-button" onClick={onFindNext} data-tooltip="Next match (Enter)">
        <ChevronRight size={14} />
        Next
      </AppButton>
      {showReplaceControls ? (
        <AppButton variant="small" className="find-action-button" onClick={onReplace} data-tooltip="Replace current match">
          <PenLine size={14} />
          Replace
        </AppButton>
      ) : null}
      {showReplaceControls ? (
        <AppButton variant="small" className="find-action-button" onClick={onReplaceAll} data-tooltip="Replace all matches">
          <FilePenLine size={14} />
          Replace All
        </AppButton>
      ) : null}
      {findUseRegex && !regexValid ? <span className="find-error" role="alert">Invalid regex</span> : null}
      <span className="find-count" aria-live="polite" aria-label={`Current match ${currentMatchLabel.replace("/", " of ")}`}>
        {currentMatchLabel}
      </span>
      <AppIconButton className="find-close" onClick={onClose} aria-label={closeLabel}>
        <X size={16} />
      </AppIconButton>
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
          <AppButton
            variant="small"
            onClick={() => setIsOutlineCollapsed(false)}
            data-tooltip="Open outline panel"
            aria-expanded="false"
          >
            <ListTree size={16} />
          </AppButton>
        </div>
      ) : (
        <>
          <div className="panel-title-row">
            <h2>Outline</h2>
            <div className="panel-actions">
              <AppButton
                variant="small"
                onClick={() => setIsOutlineCollapsed(true)}
                data-tooltip="Close outline panel"
                aria-expanded="true"
              >
                <ChevronRight size={16} />
              </AppButton>
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
                  data-tooltip={`Go to line ${entry.line}`}
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
  _history,
  workspacePath,
  branch,
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
  showOriginalImages = false,
  inlineLinkedMarkdown = false,
  outlineEnabled = true,
  onOutlineEnabledChange,
  focusModeEnabled = false,
  onFocusModeChange,
  aiSidebar = null,
}) {
  const { confirm } = useConfirm();
  const MAX_EDITOR_HISTORY = 200;
  const textareaRef = useRef(null);
  const historyStateRef = useRef({
    raw: { undo: [], redo: [] },
    cleansed: { undo: [], redo: [] },
  });
  const applyingHistoryRef = useRef(false);
  const [showHistoryPopover, setShowHistoryPopover] = useState(false);

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
  const [changedOnDisk, setChangedOnDisk] = useState(false);

  useEffect(() => {
    setChangedOnDisk(false);
  }, [document.filePath, document.rawNotes, document.cleansed]);

  useEffect(() => {
    if (typeof window.notesApi?.onDocumentChangedOnDisk !== "function") return undefined;
    const unsubscribe = window.notesApi.onDocumentChangedOnDisk((payload) => {
      if (payload && payload.filePath === document.filePath) {
        setChangedOnDisk(true);
        setAutosaveEnabled(false);
      }
    });
    return () => unsubscribe();
  }, [document.filePath, setAutosaveEnabled]);

  useEffect(() => {
    const currentPath = document.filePath;
    if (typeof window.notesApi?.startWatching === "function") {
      window.notesApi.startWatching(currentPath);
    }
    return () => {
      if (typeof window.notesApi?.stopWatching === "function") {
        window.notesApi.stopWatching(currentPath);
      }
    };
  }, [document.filePath]);

  const handleReloadFromDisk = async () => {
    try {
      if (typeof onOpenDocument === "function") {
        await onOpenDocument(document.filePath);
        setChangedOnDisk(false);
        onNotify?.("Note reloaded from disk.", "success");
      }
    } catch (err) {
      onNotify?.(err?.message || "Failed to reload document.", "error");
    }
  };
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showReplaceControls, setShowReplaceControls] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findUseRegex, setFindUseRegex] = useState(false);
  const [findMatchIndex, setFindMatchIndex] = useState(-1);
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);
  const [showMetadataPanel, setShowMetadataPanel] = useState(false);
  const [showMediaManager, setShowMediaManager] = useState(false);
  const [isTaskSummaryOpen, setIsTaskSummaryOpen] = useState(false);
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

  const findRegexValid = !findUseRegex || isValidFindRegex(findQuery);
  const content = activeTab === "raw" ? document.rawNotes : document.cleansed;
  const findMatches = useMemo(
    () => collectMatches(content, findQuery, findCaseSensitive, findUseRegex),
    [content, findQuery, findCaseSensitive, findUseRegex],
  );
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
  const selectedFindMatchIndex = getSelectedMatchIndex(
    findMatches,
    textareaRef.current?.selectionStart,
    textareaRef.current?.selectionEnd,
  );
  const activeFindMatchIndex = selectedFindMatchIndex !== -1
    ? selectedFindMatchIndex
    : (findMatchIndex >= 0 && findMatchIndex < findMatches.length ? findMatchIndex : (findMatches.length ? 0 : -1));
  const currentFindMatchLabel = findMatches.length
    ? `${activeFindMatchIndex + 1}/${findMatches.length}`
    : "0/0";

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

  const taskItems = useMemo(() => extractTasksFromText(content), [content]);

  const taskCounts = useMemo(() => getTaskCountsFromText(content), [content]);

  const openTaskItems = useMemo(() => taskItems.filter((task) => task.status === "open"), [taskItems]);
  const closedTaskItems = useMemo(() => taskItems.filter((task) => task.status === "closed"), [taskItems]);
  const taskSummaryPopoverId = useMemo(
    () => `detail-task-popover-${String(document.filePath || document.fileName || "note").toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`,
    [document.filePath, document.fileName],
  );

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

  const captureEditorSnapshot = () => {
    const editor = textareaRef.current;
    if (!editor) return null;
    return {
      filePath: document.filePath,
      tab: activeTab,
      selectionStart: Number(editor.selectionStart) || 0,
      selectionEnd: Number(editor.selectionEnd) || 0,
      scrollTop: Number(editor.scrollTop) || 0,
    };
  };

  const restoreEditorSnapshot = (snapshot) => {
    if (!snapshot) return;

    let canceled = false;
    const restore = () => {
      if (canceled) return;
      const editor = textareaRef.current;
      if (!editor) return;

      const docLength = String(editor.value || "").length;
      const nextStart = Math.max(0, Math.min(snapshot.selectionStart, docLength));
      const nextEnd = Math.max(0, Math.min(snapshot.selectionEnd, docLength));
      editor.selectionStart = nextStart;
      editor.selectionEnd = nextEnd;
      editor.scrollTop = snapshot.scrollTop;
    };

    requestAnimationFrame(restore);
    const lateRestoreA = window.setTimeout(restore, 80);
    const lateRestoreB = window.setTimeout(restore, 220);

    return () => {
      canceled = true;
      window.clearTimeout(lateRestoreA);
      window.clearTimeout(lateRestoreB);
    };
  };

  const savePreservingEditorViewport = async (options) => {
    const snapshot = captureEditorSnapshot();
    try {
      await onSave(options);
    } finally {
      const shouldRestore = snapshot
        && snapshot.filePath === document.filePath
        && snapshot.tab === activeTab;
      if (shouldRestore) {
        restoreEditorSnapshot(snapshot);
      }
    }
  };

  useEffect(() => {
    if (!autosaveEnabled || !dirty || saving || showMediaManager) return undefined;

    const timer = window.setTimeout(async () => {
      await savePreservingEditorViewport({ reason: "autosave", silent: true });
      setLastAutoSaveAt(Date.now());
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosaveEnabled, dirty, saving, showMediaManager, onSave, document.filePath, document.header, document.rawNotes, document.cleansed, activeTab]);

  useEffect(() => {
    const total = findMatches.length;
    if (!total) {
      setFindMatchIndex(-1);
    } else if (findMatchIndex >= total) {
      setFindMatchIndex(total - 1);
    }
  }, [findMatches, findMatchIndex]);

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

  const toggleOutlineEnabled = () => {
    if (isFocusMode) {
      onNotify?.("Outline is unavailable while Focus mode is enabled.", "info");
      return;
    }

    onOutlineEnabledChange?.((value) => {
      const nextEnabled = value === false;
      onNotify?.(nextEnabled ? "Outline panel shown." : "Outline panel hidden.", "info");
      return nextEnabled;
    });
  };

  const toggleFocusMode = () => {
    onFocusModeChange?.((value) => {
      const nextEnabled = value !== true;
      onNotify?.(
        nextEnabled
          ? "Focus mode on. Outline is hidden; press Ctrl/Cmd+Alt+F to exit."
          : "Focus mode off. Full layout restored.",
        "info",
      );
      return nextEnabled;
    });
  };

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

  const openFindPanel = ({ showReplace = false } = {}) => {
    if (mode !== "edit" && mode !== "split") {
      setEditorMode("edit", { announce: false, force: true });
    }
    setShowReplaceControls(showReplace);
    setShowFindReplace(true);
    const selectedText = textareaRef.current
      ? textareaRef.current.value.slice(textareaRef.current.selectionStart, textareaRef.current.selectionEnd)
      : "";
    if (selectedText && !selectedText.includes("\n")) {
      setFindQuery(selectedText);
    }
    onNotify?.("Find panel opened.", "info");
  };

  const openFindInNotePanel = () => {
    openFindPanel({ showReplace: false });
  };

  const toggleFindInNotePanel = () => {
    if (showFindReplace) {
      closeFindReplacePanel();
      onNotify?.("Find panel closed.", "info");
      return;
    }

    openFindInNotePanel();
  };

  const openFindReplacePanel = () => {
    openFindPanel({ showReplace: true });
  };

  const closeFindReplacePanel = () => {
    setShowFindReplace(false);
    setFindMatchIndex(-1);
    textareaRef.current?.focus?.();
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
    if (changedOnDisk) return;
    try {
      await savePreservingEditorViewport({ reason: "manual-save", silent: true });
      onNotify?.("Note saved.", "success");
    } catch (error) {
      onNotify?.(error?.message || "Unable to save note.", "error");
    }
  };

  const handleCopyAsHtml = () => {
    const html = renderMarkdown(content || "");
    navigator.clipboard.writeText(html)
      .then(() => onNotify?.("Copied as HTML.", "success"))
      .catch(() => onNotify?.("Unable to copy to clipboard.", "error"));
  };

  const handleCopyAsText = () => {
    navigator.clipboard.writeText(content || "")
      .then(() => onNotify?.("Copied as plain text.", "success"))
      .catch(() => onNotify?.("Unable to copy to clipboard.", "error"));
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

  const handleTitleBlur = async () => {
    const nextTitle = String(titleDraft || "").trim();
    const currentTitle = String(document.title || "").trim();
    if (!nextTitle) {
      setTitleDraft(document.title || "");
      return;
    }
    if (nextTitle === currentTitle || titleRenameInFlightRef.current) {
      return;
    }

    const confirmed = await confirm({
      title: "Rename Note?",
      message: `Rename note to "${nextTitle}"?`,
      confirmLabel: "Rename",
      cancelLabel: "Cancel",
      variant: "primary"
    });
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

    if (!findMatches.length) {
      setFindMatchIndex(-1);
      return;
    }

    const safeIndex = ((nextIndex % findMatches.length) + findMatches.length) % findMatches.length;
    const match = findMatches[safeIndex];

    if (mode !== "edit" && mode !== "split") {
      setEditorMode("edit", { announce: false, force: true });
    }

    editor.focus();
    if (typeof editor.setSelectionRange === "function") {
      editor.setSelectionRange(match.start, match.end);
    } else {
      editor.selectionStart = match.start;
      editor.selectionEnd = match.end;
    }
    editor.scrollTop = Math.max(0, editor.scrollTop - 1);
    setFindMatchIndex(safeIndex);
  };

  const handleFindNext = () => {
    const editor = textareaRef.current;
    if (!editor || !findMatches.length) return;

    const cursor = editor.selectionEnd;
    const next = findMatches.findIndex((entry) => entry.start > cursor);
    goToMatch(next === -1 ? 0 : next);
  };

  const handleFindPrevious = () => {
    const editor = textareaRef.current;
    if (!editor || !findMatches.length) return;

    const cursor = editor.selectionStart;
    let previous = -1;
    for (let index = 0; index < findMatches.length; index += 1) {
      if (findMatches[index].start < cursor) previous = index;
      else break;
    }
    goToMatch(previous === -1 ? findMatches.length - 1 : previous);
  };

  const replaceCurrentMatch = () => {
    if (!findQuery) return;
    const editor = textareaRef.current;
    if (!editor) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedMatchIndex = getSelectedMatchIndex(findMatches, start, end);
    const targetIndex = selectedMatchIndex !== -1 ? selectedMatchIndex : activeFindMatchIndex;
    if (targetIndex === -1) {
      return;
    }

    const targetMatch = findMatches[targetIndex];
    const nextValue = `${content.slice(0, targetMatch.start)}${replaceValue}${content.slice(targetMatch.end)}`;
    const nextCursor = targetMatch.start + replaceValue.length;
    updateContent(nextValue);

    requestAnimationFrame(() => {
      const nextEditor = textareaRef.current;
      if (!nextEditor) return;

      const nextRegexMatches = collectMatches(nextValue, findQuery, findCaseSensitive, findUseRegex);
      if (!nextRegexMatches.length) {
        nextEditor.focus();
        if (typeof nextEditor.setSelectionRange === "function") {
          nextEditor.setSelectionRange(nextCursor, nextCursor);
        } else {
          nextEditor.selectionStart = nextCursor;
          nextEditor.selectionEnd = nextCursor;
        }
        setFindMatchIndex(-1);
        return;
      }

      const nextIndex = nextRegexMatches.findIndex((entry) => entry.start >= nextCursor);
      const safeIndex = nextIndex === -1 ? 0 : nextIndex;
      const nextMatch = nextRegexMatches[safeIndex];

      nextEditor.focus();
      if (typeof nextEditor.setSelectionRange === "function") {
        nextEditor.setSelectionRange(nextMatch.start, nextMatch.end);
      } else {
        nextEditor.selectionStart = nextMatch.start;
        nextEditor.selectionEnd = nextMatch.end;
      }
      setFindMatchIndex(safeIndex);
    });
  };

  const replaceAllMatches = () => {
    if (!findQuery) return;
    if (!findMatches.length) return;

    let nextValue = "";
    if (findUseRegex) {
      const regex = tryBuildFindRegex(findQuery, findCaseSensitive);
      if (!regex) {
        onNotify?.("Invalid regular expression.", "error");
        return;
      }
      nextValue = content.replace(regex, replaceValue);
    } else {
      nextValue = findCaseSensitive
        ? content.split(findQuery).join(replaceValue)
        : content.replace(new RegExp(escapeRegExp(findQuery), "gi"), replaceValue);
    }

    updateContent(nextValue);
    onNotify?.(`Replaced ${findMatches.length} match${findMatches.length > 1 ? "es" : ""}.`, "success");
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
    toggleFindInNotePanel,
    openFindInNotePanel,
    openFindReplacePanel,
    toggleOutlineEnabled,
    toggleSplitPreview: () => {
      if (!showMediaManager) {
        setMode((value) => (value === "split" ? "edit" : "split"));
        onNotify?.("Split preview toggled.", "info");
      }
    },
    toggleFocusMode,
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



  return (
    <div className="detail-shell">
      {!isFocusMode && (
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
            <span className="detail-breadcrumb-current" data-tooltip={document.title}>{document.title}</span>
          </nav>
          {taskCounts.total > 0 && (
            <div
              className="detail-task-summary"
              onMouseEnter={() => setIsTaskSummaryOpen(true)}
              onMouseLeave={() => setIsTaskSummaryOpen(false)}
              onFocus={() => setIsTaskSummaryOpen(true)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setIsTaskSummaryOpen(false);
                }
              }}
            >
              <button
                className="detail-task-counts"
                type="button"
                aria-label={`${taskCounts.open} open tasks and ${taskCounts.closed} closed tasks`}
                aria-expanded={isTaskSummaryOpen}
                aria-controls={taskSummaryPopoverId}
              >
                <span className="task-count-item" data-tooltip="Open tasks">
                  <CheckSquare size={14} />
                  {taskCounts.open}
                </span>
                <span className="task-count-item" data-tooltip="Closed tasks">
                  <Square size={14} />
                  {taskCounts.closed}
                </span>
              </button>
              <div
                id={taskSummaryPopoverId}
                className="detail-task-popover"
                role="tooltip"
                aria-label="Note task summary"
              >
                {openTaskItems.length ? (
                  <div className="detail-task-popover-section">
                    <strong>Open</strong>
                    <ul className="detail-task-popover-list">
                      {openTaskItems.map((task) => (
                        <li className="detail-task-popover-item open" key={task.id}>
                          <span className="detail-task-popover-marker">[ ]</span>
                          <span>{task.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {closedTaskItems.length ? (
                  <div className="detail-task-popover-section">
                    <strong>Closed</strong>
                    <ul className="detail-task-popover-list">
                      {closedTaskItems.map((task) => (
                        <li className="detail-task-popover-item closed" key={task.id}>
                          <span className="detail-task-popover-marker">[x]</span>
                          <span>{task.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          )}
          <div className={`save-status ${dirty ? "dirty" : "clean"}`} aria-live="polite">
            {dirty ? "Unsaved" : "Saved"}
          </div>
          {!autosaveEnabled && (
            <AppButton
              variant="small"
              onClick={handleManualSave}
              disabled={!dirty || changedOnDisk}
              data-tooltip="Save note (Ctrl+S)"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <Save size={14} />
              <span>Save</span>
            </AppButton>
          )}
          <AppButton
            variant="small"
            className={`autosave-toggle-btn ${autosaveEnabled ? "active" : ""}`}
            onClick={() => setAutosaveEnabled((value) => !value)}
            data-tooltip="Toggle autosave"
          >
            <Save size={18} />
            {autosaveEnabled ? "Autosave On" : "Autosave Off"}
          </AppButton>
          <AppButton
            variant="small"
            onClick={toggleFocusMode}
            data-tooltip={isFocusMode ? "Exit Full Screen" : "Enter Full Screen"}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            {isFocusMode ? <Minimize size={14} /> : <Maximize size={14} />}
            <span>{isFocusMode ? "Exit Full Screen" : "Full Screen"}</span>
          </AppButton>
        </div>
      )}

      {!isFocusMode && autosaveEnabled && lastAutoSaveAt ? (
        <div className="autosave-status">Last autosave {new Date(lastAutoSaveAt).toLocaleTimeString()}</div>
      ) : null}

      {!isFocusMode && (
        <header className="doc-header">
        <div className="doc-header-main">
          <h1>{document.title}</h1>
          <p className="doc-header-file">{document.fileName}</p>
        </div>
        <div className="panel-actions">
          <AppButton
            variant="small"
            className={showMetadataPanel ? "active" : ""}
            data-tooltip="Toggle note metadata"
            onClick={() => setShowMetadataPanel((value) => !value)}
          >
            {showMetadataPanel ? <EyeOff size={14} /> : <ListTree size={14} />}
            {showMetadataPanel ? "Hide details" : "Show details"}
          </AppButton>
        </div>
      </header>
      )}

      {isFocusMode && (
        <div className="mode-contract-banner" role="status" aria-live="polite">
          <span>Focus mode is active — press F11 to exit</span>
          <button
            type="button"
            data-tooltip="Exit focus mode"
            className="mode-contract-exit"
            onClick={() => onFocusModeChange?.(false)}
          >
            Exit
          </button>
        </div>
      )}

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

      {changedOnDisk && (
        <div className="disk-change-banner" role="alert" style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "10px 14px",
          margin: "0 18px 12px",
          borderRadius: "8px",
          border: "1px solid #9b2f2f",
          backgroundColor: "#fff1f0",
          color: "#7d2020",
          fontSize: "13.5px",
          fontWeight: "550",
          boxShadow: "0 2px 8px rgba(155, 47, 47, 0.12)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>⚠️</span>
            <span>Content has been changed on disk by another tool. Autosave is disabled.</span>
          </div>
          <AppButton variant="primary" size="small" onClick={handleReloadFromDisk}>
            Reload content from disk
          </AppButton>
        </div>
      )}

      <div 
        className={`workspace ${changedOnDisk ? "workspace-disabled" : ""} ${isOutlineEnabled ? "" : "outline-panel-disabled"} ${isOutlineCollapsed ? "outline-panel-collapsed" : ""} ${aiSidebar ? "with-ai-chat" : ""}`}
        onKeyDown={(e) => {
          if (changedOnDisk) {
            // Let Ctrl+Shift+R pass through, block all other shortcuts/keys
            const isReload = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "r";
            if (!isReload) {
              e.preventDefault();
              e.stopPropagation();
            }
          }
        }}
      >
        <main className="editor-panel">
          {!isFocusMode && (
          <div className="tab-row">
            <div className="mode-switch">
              <div className="copy-menu" role="group" aria-label="Copy options">
                <button
                  type="button"
                  className="copy-menu-trigger"
                  data-tooltip="Copy note content"
                  disabled={showMediaManager}
                >
                  <Clipboard size={16} />
                  <span>Copy</span>
                  <ChevronDown size={14} />
                </button>
                <div className="copy-menu-panel" role="menu" aria-label="Copy actions">
                  <button
                    type="button"
                    role="menuitem"
                    data-tooltip="Copy note content as rendered HTML"
                    onClick={handleCopyAsHtml}
                    disabled={showMediaManager}
                  >
                    <Code2 size={16} />
                    <span>Copy HTML</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-tooltip="Copy note content as plain text (markdown source)"
                    onClick={handleCopyAsText}
                    disabled={showMediaManager}
                  >
                    <Clipboard size={16} />
                    <span>Copy Text</span>
                  </button>
                </div>
              </div>
              <div className="button-group-separator" />
              <div className="button-group">
                <button
                  className={activeTab === "raw" ? "active" : ""}
                  onClick={() => {
                    setShowMediaManager(false);
                    setActiveTab("raw");
                  }}
                  data-tooltip="Quick notes"
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
                  data-tooltip="Formal notes"
                >
                  <FileText size={16} />
                  <span>Formal Notes</span>
                </button>
              </div>
              <div className="button-group-separator" />
              <button
                className={showMediaManager ? "active" : ""}
                type="button"
                data-tooltip="Open assets manager"
                onClick={() => setShowMediaManager((value) => !value)}
              >
                <Images size={16} />
                <span>Assets</span>
              </button>
              <div className="button-group mode-switch-modes">
                {EDITOR_MODE_OPTIONS.map((item) => (
                  <button
                    className={mode === item.key ? "active" : ""}
                    key={item.key}
                    disabled={showMediaManager}
                    onClick={() => setEditorMode(item.key, { announce: false })}
                    data-tooltip={showMediaManager ? "Close Assets view to switch mode" : `Switch to ${item.label} mode`}
                  >
                    <item.icon size={16} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}

          <FindReplacePanel
            showFindReplace={showFindReplace}
            showReplaceControls={showReplaceControls}
            findQuery={findQuery}
            setFindQuery={setFindQuery}
            replaceValue={replaceValue}
            setReplaceValue={setReplaceValue}
            findCaseSensitive={findCaseSensitive}
            setFindCaseSensitive={setFindCaseSensitive}
            findUseRegex={findUseRegex}
            setFindUseRegex={setFindUseRegex}
            regexValid={findRegexValid}
            onFindPrevious={handleFindPrevious}
            onFindNext={handleFindNext}
            onReplace={replaceCurrentMatch}
            onReplaceAll={replaceAllMatches}
            currentMatchLabel={currentFindMatchLabel}
            onClose={closeFindReplacePanel}
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
            onOpenFind={openFindInNotePanel}
            onToggleFind={toggleFindInNotePanel}
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
            isFocusMode={isFocusMode}
            onToggleFocusMode={() => onFocusModeChange?.(!isFocusMode)}
            ghostSuggestion={inlineGhostSuggestion}
            onAcceptInlineGhost={onAcceptInlineGhost}
            onRejectInlineGhost={onRejectInlineGhost}
            findMatches={findMatches}
            activeFindMatchIndex={activeFindMatchIndex}
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
            data-tooltip="Show AI panel"
            aria-label="Show AI panel"
          >
            AI
          </button>
        ) : null}
      </div>


      {showHistoryPopover ? (
        <GitNoteHistoryPanel
          open={showHistoryPopover}
          onClose={() => setShowHistoryPopover(false)}
          filePath={document?.filePath}
          workspacePath={workspacePath}
          branch={branch}
          onNotify={onNotify}
          onRestored={async () => {
            // Trigger refresh/re-read of the note from disk
            if (typeof onRefreshHistory === "function") {
              await onRefreshHistory();
            }
          }}
        />
      ) : null}

      {showMediaManager ? (
        <OverlayDialog
          onClose={() => setShowMediaManager(false)}
          ariaLabel="Assets"
          cardClassName="assets-dialog-card"
        >
            <div className="overlay-dialog-header assets-dialog-header">
              <div className="assets-dialog-title-group">
                <h2>Assets Library</h2>
                <p>Manage images referenced across your notes.</p>
              </div>
              <AppIconButton
                className="assets-close-button"
                onClick={() => setShowMediaManager(false)}
                aria-label="Close assets dialog"
              >
                <X size={16} />
              </AppIconButton>
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
        </OverlayDialog>
      ) : null}

      {pdfOptionsOpen ? (
        <OverlayDialog
          onClose={() => setPdfOptionsOpen(false)}
          ariaLabel="Export PDF"
        >
            <div className="overlay-dialog-header">
              <h2>Export PDF</h2>
              <AppIconButton onClick={() => setPdfOptionsOpen(false)} aria-label="Close export options">
                <X size={16} />
              </AppIconButton>
            </div>
            <DialogSelectField
              id="pdf-export-content-mode"
              label="Content"
              value={pdfExportMode}
              onChange={(event) => setPdfExportMode(event.target.value)}
            >
                <option value="formal">Formal Notes</option>
                <option value="raw">Raw Notes</option>
                <option value="both">Both Raw and Formal</option>
            </DialogSelectField>
            <DialogSelectField
              id="pdf-export-quality"
              label="Quality"
              value={pdfQualityPreset}
              onChange={(event) => setPdfQualityPreset(event.target.value)}
            >
                <option value="full">Full quality</option>
                <option value="balanced">Balanced size</option>
                <option value="compact">Compact file</option>
            </DialogSelectField>
            <div className="overlay-dialog-actions">
              <AppButton
                variant="primary"
                onClick={handleConfirmPdfExport}
                disabled={pdfExporting}
              >
                <FileDown size={14} />
                {pdfExporting ? "Exporting..." : "Export"}
              </AppButton>
            </div>
        </OverlayDialog>
      ) : null}

    </div>
  );
}
