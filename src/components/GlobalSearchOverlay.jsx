import { useEffect, useMemo, useRef, useState } from "react";
import { OverlayDialog } from "./OverlayDialog";
import { useWorkspaceScopedStorage } from "../hooks/useWorkspaceScopedStorage";

const RECENT_SEARCHES_KEY = "notely:recent-searches";
const RECENT_SEARCHES_LIMIT = 6;

function extractCodeBlocks(text) {
  const source = String(text || "");
  const parts = [];
  const blockRegex = /```[\w]*\n?([\s\S]*?)```/g;
  const inlineRegex = /`([^`\n]+)`/g;
  let match;
  while ((match = blockRegex.exec(source)) !== null) {
    parts.push(match[1]);
  }
  while ((match = inlineRegex.exec(source)) !== null) {
    parts.push(match[1]);
  }
  return parts.join("\n");
}

function tryBuildRegex(pattern) {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, "im");
  } catch {
    return null;
  }
}

function isValidRegex(pattern) {
  if (!pattern) return true;
  try {
    // This intentionally creates a RegExp to test syntax validity
    void new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function normalizeRecentSearches(rawValue) {
  if (!Array.isArray(rawValue)) return [];
  return rawValue
    .filter((item) => typeof item === "string" && item.trim())
    .slice(0, RECENT_SEARCHES_LIMIT);
}

function buildMatchPreview(text, needle, contextLength = 36) {
  const source = String(text || "");
  const normalizedNeedle = String(needle || "").trim().toLowerCase();
  if (!source || !normalizedNeedle) return "";

  const normalizedSource = source.toLowerCase();
  const at = normalizedSource.indexOf(normalizedNeedle);
  if (at === -1) return "";

  const start = Math.max(0, at - contextLength);
  const end = Math.min(source.length, at + normalizedNeedle.length + contextLength);
  const rawSnippet = source.slice(start, end).replace(/\s+/g, " ").trim();
  const leading = start > 0 ? "..." : "";
  const trailing = end < source.length ? "..." : "";
  return `${leading}${rawSnippet}${trailing}`;
}

function buildMatchPreviewRegex(text, regex, contextLength = 36) {
  const source = String(text || "");
  if (!source || !regex) return "";
  try {
    const match = regex.exec(source);
    if (!match) return "";
    const at = match.index;
    const start = Math.max(0, at - contextLength);
    const end = Math.min(source.length, at + match[0].length + contextLength);
    const rawSnippet = source.slice(start, end).replace(/\s+/g, " ").trim();
    const leading = start > 0 ? "..." : "";
    const trailing = end < source.length ? "..." : "";
    return `${leading}${rawSnippet}${trailing}`;
  } catch {
    return "";
  }
}

function buildResultMatch(entry, query, useRegex) {
  const needle = String(query || "").trim();
  if (!needle) return { where: "", preview: "" };

  const regex = useRegex ? tryBuildRegex(needle) : null;

  const matchesText = (value) => {
    if (!value) return false;
    if (regex) return regex.test(value);
    return String(value).toLowerCase().includes(needle.toLowerCase());
  };

  const previewText = (value) => {
    if (!value) return "";
    if (regex) return buildMatchPreviewRegex(value, regex);
    return buildMatchPreview(value, needle);
  };

  const candidates = [
    { where: "title", value: entry?.title },
    { where: "path", value: entry?.filePath },
    { where: "metadata", value: [entry?.metadata?.time, entry?.metadata?.location].filter(Boolean).join(" ") },
    { where: "content", value: entry?.searchText },
  ];

  for (const candidate of candidates) {
    if (matchesText(candidate.value)) {
      return { where: candidate.where, preview: previewText(candidate.value) };
    }
  }

  return { where: "", preview: "" };
}

function buildSearchResults({ documents, currentDocument, query, typeFilter, useRegex }) {
  const needle = String(query || "").trim();
  const lowerNeedle = needle.toLowerCase();
  const regex = useRegex && needle ? tryBuildRegex(needle) : null;

  const matchesHaystack = (haystack) => {
    if (!needle) return true;
    if (regex) return regex.test(haystack);
    return haystack.toLowerCase().includes(lowerNeedle);
  };

  const codeOnly = typeFilter === "code";

  const docResults = documents
    .filter((entry) => {
      if ((typeFilter === "notes" || codeOnly) && entry.entryType !== "file") return false;
      if (typeFilter === "folders" && entry.entryType !== "folder") return false;
      if (!needle) return true;

      if (codeOnly) {
        return matchesHaystack(extractCodeBlocks(entry.searchText));
      }

      const haystack = [
        entry.title,
        entry.filePath,
        entry.metadata?.time,
        entry.metadata?.location,
        entry.searchText,
      ].filter(Boolean).join(" ");
      return matchesHaystack(haystack);
    })
    .map((entry) => {
      const match = buildResultMatch(entry, query, useRegex);
      // For code-only, override preview with code block context
      let matchWhere = match.where;
      let matchPreview = match.preview;
      if (codeOnly && needle) {
        const codeText = extractCodeBlocks(entry.searchText);
        matchWhere = "code";
        matchPreview = regex
          ? buildMatchPreviewRegex(codeText, regex)
          : buildMatchPreview(codeText, needle);
      }
      return {
        id: `doc:${entry.filePath}`,
        kind: "document",
        entry,
        label: entry.title,
        subtitle: entry.entryType === "folder" ? "Folder" : "Note",
        matchWhere,
        matchPreview,
      };
    });

  const contentResults = [];
  if (currentDocument && needle && (typeFilter === "all" || typeFilter === "current")) {
    const sourceText = `${currentDocument.rawNotes || ""}\n${currentDocument.cleansed || ""}`;
    const matchesCurrent = regex ? regex.test(sourceText) : sourceText.toLowerCase().includes(lowerNeedle);
    if (matchesCurrent) {
      const preview = regex
        ? buildMatchPreviewRegex(sourceText, regex)
        : buildMatchPreview(sourceText, query);
      contentResults.push({
        id: `current:${currentDocument.filePath}`,
        kind: "current-note-match",
        label: `Find "${query}" in ${currentDocument.title}`,
        subtitle: "Current note content",
        matchWhere: "content",
        matchPreview: preview,
      });
    }
  }

  if (typeFilter === "current") {
    return contentResults;
  }

  return [...contentResults, ...docResults];
}

export function GlobalSearchOverlay({
  isOpen,
  documents = [],
  currentDocument = null,
  workspaceStorageScope = "default",
  onClose,
  onOpenResult,
  initialQuery = "",
}) {
  const [query, setQuery] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const [typeFilter, setTypeFilter] = useState("all");
  const [useRegex, setUseRegex] = useState(false);
  const regexValid = !useRegex || isValidRegex(query.trim());
  const [recentSearches, setRecentSearches] = useWorkspaceScopedStorage({
    workspaceScope: workspaceStorageScope,
    key: "notes:recent-searches",
    defaultValue: [],
    normalize: normalizeRecentSearches,
    fallbackKey: RECENT_SEARCHES_KEY,
  });
  const inputRef = useRef(null);

  const results = useMemo(() => buildSearchResults({
    documents,
    currentDocument,
    query,
    typeFilter,
    useRegex: useRegex && regexValid,
  }), [documents, currentDocument, query, typeFilter, useRegex, regexValid]);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setActiveIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    } else {
      setQuery("");
      setActiveIndex(0);
      setTypeFilter("all");
      setUseRegex(false);
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, results.length - 1)));
  }, [results]);

  function trackRecentSearch(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return;
    const next = [trimmed, ...recentSearches.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())]
      .slice(0, RECENT_SEARCHES_LIMIT);
    setRecentSearches(next);
  }

  if (!isOpen) return null;

  return (
    <OverlayDialog
      open={isOpen}
      onClose={onClose}
      ariaLabel="Global search"
      cardClassName="global-search-card"
      initialFocusRef={inputRef}
    >
        <div className="global-search-header">
          <input
            ref={inputRef}
            className={`global-search-input${useRegex && !regexValid ? " regex-error" : ""}`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
              }

              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
                return;
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
                return;
              }

              if (event.key === "Enter") {
                event.preventDefault();
                const selected = results[activeIndex];
                if (!selected) return;
                trackRecentSearch(query);
                onOpenResult(selected, query);
              }
            }}
            placeholder={useRegex ? "Regex pattern…" : "Search notes, folders, and current note content"}
            aria-label="Search"
          />
        </div>

        <div className="global-search-filters" role="group" aria-label="Search filters">
          <button
            type="button"
            className={typeFilter === "all" ? "active" : ""}
            onClick={() => setTypeFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={typeFilter === "notes" ? "active" : ""}
            onClick={() => setTypeFilter("notes")}
          >
            Notes
          </button>
          <button
            type="button"
            className={typeFilter === "folders" ? "active" : ""}
            onClick={() => setTypeFilter("folders")}
          >
            Folders
          </button>
          <button
            type="button"
            className={typeFilter === "current" ? "active" : ""}
            onClick={() => setTypeFilter("current")}
            disabled={!currentDocument}
          >
            Current Note
          </button>
          <button
            type="button"
            className={typeFilter === "code" ? "active" : ""}
            onClick={() => setTypeFilter("code")}
            data-tooltip="Search only inside code blocks and inline code"
          >
            Code Blocks
          </button>
          <span className="global-search-filter-divider" aria-hidden="true" />
          <button
            type="button"
            className={`global-search-regex-toggle${useRegex ? " active" : ""}${useRegex && !regexValid ? " error" : ""}`}
            onClick={() => setUseRegex((v) => !v)}
            data-tooltip="Toggle regular expression search"
            aria-pressed={useRegex}
          >
            .*
          </button>
        </div>

        {useRegex && !regexValid && query.trim() ? (
          <div className="global-search-regex-error" role="alert">
            Invalid regular expression pattern.
          </div>
        ) : null}

        {!query.trim() && recentSearches.length ? (
          <div className="global-search-recents">
            <span>Recent searches</span>
            <div>
              {recentSearches.map((item) => (
                <button key={item} type="button" onClick={() => setQuery(item)}>{item}</button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="global-search-results" role="listbox" aria-label="Search results">
          {!results.length ? (
            <div className="global-search-empty">No matches found.</div>
          ) : (
            results.map((result, index) => (
              <button
                key={result.id}
                className={`global-search-item${index === activeIndex ? " active" : ""}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  trackRecentSearch(query);
                  onOpenResult(result, query);
                }}
              >
                <span className="global-search-item-label">{result.label}</span>
                <small>{result.subtitle}</small>
                {result.matchPreview ? (
                  <small>
                    Match in {result.matchWhere || "text"}: {result.matchPreview}
                  </small>
                ) : null}
              </button>
            ))
          )}
        </div>
    </OverlayDialog>
  );
}