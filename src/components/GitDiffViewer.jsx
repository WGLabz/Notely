import { useState, useEffect, useRef } from "react";
import { GitCompare, Filter, Code2, Type } from "lucide-react";
import AppButton from "./AppButton";
import { renderMarkdown } from "../utils/renderUtils";
import { readImage } from "../services/electronService";

/**
 * Parse the internal note format into { header, rawNotes, cleansed } sections.
 * Mirrors parseVersionDocumentContent in DocumentDetail.
 */
function parseNoteContent(value, fallback = {}) {
  const lines = String(value || "").split(/\r?\n/);
  const rawIndex = lines.findIndex((l) => l.trim().toLowerCase() === "# rawnotes");
  const cleansedIndex = lines.findIndex((l) => l.trim().toLowerCase() === "# cleansed");

  if (rawIndex === -1 && cleansedIndex === -1) {
    return {
      header: fallback.header || "",
      rawNotes: fallback.rawNotes || "",
      cleansed: String(value || "").trim(),
    };
  }

  const firstIdx = Math.min(
    rawIndex === -1 ? Infinity : rawIndex,
    cleansedIndex === -1 ? Infinity : cleansedIndex
  );
  const header = lines.slice(0, firstIdx).join("\n").trim();
  const rawEnd = cleansedIndex > rawIndex && rawIndex !== -1 ? cleansedIndex : lines.length;

  return {
    header,
    rawNotes: rawIndex === -1 ? (fallback.rawNotes || "") : lines.slice(rawIndex + 1, rawEnd).join("\n").trim(),
    cleansed: cleansedIndex === -1 ? (fallback.cleansed || "") : lines.slice(cleansedIndex + 1).join("\n").trim(),
  };
}

/**
 * Compute word-level diff tokens between two strings.
 * Returns an array of { text, status: "same"|"added"|"removed" }.
 */
function diffWords(a, b) {
  const wordsA = String(a || "").split(/(\s+)/);
  const wordsB = String(b || "").split(/(\s+)/);

  // Simple LCS-based word diff
  const m = wordsA.length;
  const n = wordsB.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (wordsA[i - 1] === wordsB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const tokens = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
      tokens.unshift({ text: wordsA[i - 1], status: "same" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tokens.unshift({ text: wordsB[j - 1], status: "added" });
      j--;
    } else {
      tokens.unshift({ text: wordsA[i - 1], status: "removed" });
      i--;
    }
  }

  return tokens;
}

/**
 * Build line-level diff rows between two texts.
 */
function buildLineDiff(latestText, previousText) {
  const latest = String(latestText || "").replace(/\r\n/g, "\n").split("\n");
  const previous = String(previousText || "").replace(/\r\n/g, "\n").split("\n");
  const max = Math.max(latest.length, previous.length);
  const rows = [];

  for (let i = 0; i < max; i++) {
    const l = latest[i] ?? null;
    const p = previous[i] ?? null;

    let status = "same";
    if (p === null) status = "added";
    else if (l === null) status = "removed";
    else if (l !== p) status = "changed";

    rows.push({ index: i, latest: l, previous: p, status });
  }

  return rows;
}

const cleanMarkdown = (text) => {
  if (!text) return "";
  return String(text).replace(/(!\[[^\]]*\]\([^)]+\))\{[^}]*\}/g, "$1");
};

function DiffSection({ title, latestText, previousText, showOnlyChanges, isCodeView }) {
  const rows = buildLineDiff(latestText, previousText);
  const visible = showOnlyChanges ? rows.filter((r) => r.status !== "same") : rows;

  if (!latestText && !previousText) return null;

  return (
    <div className="git-diff-section">
      <h3 className="git-diff-section__title">{title}</h3>
      <div className={`git-diff-lines${isCodeView ? " git-diff-lines--code" : ""}`} aria-label={`${title} diff`}>
        {visible.length === 0 ? (
          <div className="git-diff-no-changes">No changes in this section.</div>
        ) : visible.map((row, idx) => {
          if (row.status === "changed") {
            const hasImageOrDiagram = (() => {
              const p = String(row.previous || "");
              const l = String(row.latest || "");
              const check = (str) => (str.includes("![") && str.includes("](")) || str.includes("excali-diagrams/") || str.includes("data-diagram-id");
              return check(p) || check(l);
            })();

            if (hasImageOrDiagram) {
              return (
                <div key={idx} style={{ display: "flex", flexDirection: "column" }}>
                  <div className="git-diff-row git-diff-row--removed">
                    <span className="git-diff-row__gutter">{row.index + 1}</span>
                    {isCodeView ? (
                      <del className="git-diff-row__content">{row.previous}</del>
                    ) : (
                      <del className="git-diff-row__content markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(cleanMarkdown(row.previous)) }} />
                    )}
                  </div>
                  <div className="git-diff-row git-diff-row--added">
                    <span className="git-diff-row__gutter">{row.index + 1}</span>
                    {isCodeView ? (
                      <span className="git-diff-row__content">{row.latest}</span>
                    ) : (
                      <span className="git-diff-row__content markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(cleanMarkdown(row.latest)) }} />
                    )}
                  </div>
                </div>
              );
            }

            const tokens = diffWords(row.previous ?? "", row.latest ?? "");
            return (
              <div key={idx} className="git-diff-row git-diff-row--changed">
                <span className="git-diff-row__gutter">{row.index + 1}</span>
                {isCodeView ? (
                  <span className="git-diff-row__content">
                    {tokens.map((token, ti) => (
                      token.status === "same"
                        ? <span key={ti}>{token.text}</span>
                        : token.status === "added"
                        ? <mark key={ti} className="git-diff-token--added">{token.text}</mark>
                        : <del key={ti} className="git-diff-token--removed">{token.text}</del>
                    ))}
                  </span>
                ) : (
                  <span className="git-diff-row__content markdown-body">
                    {tokens.map((token, ti) => {
                      const cleanedToken = cleanMarkdown(token.text);
                      if (token.status === "same") {
                        return <span key={ti} dangerouslySetInnerHTML={{ __html: renderMarkdown(cleanedToken) }} style={{ display: "inline" }} />;
                      }
                      if (token.status === "added") {
                        return <mark key={ti} className="git-diff-token--added" dangerouslySetInnerHTML={{ __html: renderMarkdown(cleanedToken) }} style={{ display: "inline" }} />;
                      }
                      return <del key={ti} className="git-diff-token--removed" dangerouslySetInnerHTML={{ __html: renderMarkdown(cleanedToken) }} style={{ display: "inline" }} />;
                    })}
                  </span>
                )}
              </div>
            );
          }

          if (row.status === "added") {
            const isEmpty = !String(row.latest || "").trim();
            return (
              <div key={idx} className={`git-diff-row git-diff-row--added${isEmpty ? " git-diff-row--empty" : ""}`}>
                <span className="git-diff-row__gutter">{row.index + 1}</span>
                {isCodeView ? (
                  <span className="git-diff-row__content">{row.latest}</span>
                ) : (
                  <span className="git-diff-row__content markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(cleanMarkdown(row.latest)) }} />
                )}
              </div>
            );
          }

          if (row.status === "removed") {
            const isEmpty = !String(row.previous || "").trim();
            return (
              <div key={idx} className={`git-diff-row git-diff-row--removed${isEmpty ? " git-diff-row--empty" : ""}`}>
                <span className="git-diff-row__gutter">{row.previous !== null ? row.index + 1 : ""}</span>
                {isCodeView ? (
                  <del className="git-diff-row__content">{row.previous}</del>
                ) : (
                  <del className="git-diff-row__content markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(cleanMarkdown(row.previous)) }} />
                )}
              </div>
            );
          }

          const isEmpty = !String(row.latest || "").trim() && !String(row.previous || "").trim();
          return (
            <div key={idx} className={`git-diff-row git-diff-row--same${isEmpty ? " git-diff-row--empty" : ""}`}>
              <span className="git-diff-row__gutter">{row.index + 1}</span>
              {isCodeView ? (
                <span className="git-diff-row__content">{row.latest}</span>
              ) : (
                <span className="git-diff-row__content markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(cleanMarkdown(row.latest)) }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * GitDiffViewer — renders a human-readable diff between two note versions.
 *
 * Sections are labeled "Quick Notes" (rawNotes) and "Formal Notes" (cleansed).
 * Never exposes raw `# RawNotes` / `# Cleansed` markers.
 *
 * Props:
 *  latestContent   — string: raw file content of the newer version
 *  previousContent — string: raw file content of the older version
 *  fromLabel       — string: label for the older version (e.g. commit hash + date)
 *  toLabel         — string: label for the newer version
 *  loading         — bool
 *  error           — string|null
 */
export function GitDiffViewer({
  latestContent,
  previousContent,
  _fromLabel = "Previous",
  _toLabel = "Current",
  loading = false,
  error = null,
  basePath = null,
}) {
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [activeSection, setActiveSection] = useState("quick");
  const [isCodeView, setIsCodeView] = useState(false);
  const containerRef = useRef(null);

  const latest = parseNoteContent(latestContent);
  const previous = parseNoteContent(previousContent);

  useEffect(() => {
    if (isCodeView || !basePath || !containerRef.current) return;
    let cancelled = false;

    const resolveImageElement = async (img) => {
      const src = img.getAttribute("src") || "";
      const assetPath = img.getAttribute("data-asset-path") || src;
      if (!assetPath || /^(data:|blob:|https?:)/i.test(assetPath)) return;

      try {
        let dataUrl = null;
        const diagramIdMatch = assetPath.match(/excali-diagrams\/([^/]+)/);
        if (diagramIdMatch && window.notesApi?.readDiagramImage) {
          const diagramId = diagramIdMatch[1];
          const response = await window.notesApi.readDiagramImage({
            documentPath: basePath,
            diagramId,
          });
          dataUrl = response?.success && response?.data ? response.data : null;
        } else {
          dataUrl = await readImage(basePath, assetPath, { thumbnail: true });
        }

        if (!cancelled && dataUrl) {
          img.setAttribute("data-asset-path", assetPath);
          img.src = dataUrl;
        }
      } catch {
        // Fall back gracefully
      }
    };

    const images = Array.from(containerRef.current.querySelectorAll("img"));
    images.forEach(resolveImageElement);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.tagName === "IMG") {
            void resolveImageElement(node);
          } else {
            node.querySelectorAll("img").forEach(resolveImageElement);
          }
        });
      });
    });

    observer.observe(containerRef.current, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [basePath, isCodeView, activeSection, latestContent, previousContent]);

  if (loading) {
    return (
      <div className="git-diff-viewer git-diff-viewer--loading" aria-live="polite">
        <span className="git-timeline-spinner" aria-label="Loading diff" />
        <span>Loading diff…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="git-diff-viewer git-diff-viewer--error" role="alert">
        <span>{error}</span>
      </div>
    );
  }

  if (!latestContent && !previousContent) {
    return (
      <div className="git-diff-viewer git-diff-viewer--empty">
        <GitCompare size={20} className="git-diff-viewer__empty-icon" aria-hidden="true" />
        <p>Select two commits to compare.</p>
      </div>
    );
  }

  return (
    <div className="git-diff-viewer" ref={containerRef}>
      <div className="git-diff-header">

        <div className="git-diff-controls" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", borderBottom: "1px solid var(--border-default)", paddingBottom: "var(--space-2, 0.5rem)", marginBottom: "var(--space-4, 1rem)" }}>
          <div className="p2p-tab-bar" role="tablist" aria-label="Diff section" style={{ borderBottom: "none", background: "none", padding: 0 }}>
            {[
              { key: "quick", label: "Quick Notes" },
              { key: "formal", label: "Formal Notes" },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                className={`p2p-tab-btn${activeSection === key ? " active" : ""}`}
                onClick={() => setActiveSection(key)}
                aria-pressed={activeSection === key}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "var(--space-2, 0.5rem)" }}>
            <AppButton
              variant="small"
              onClick={() => setIsCodeView((v) => !v)}
              aria-pressed={isCodeView}
              data-tooltip={isCodeView ? "Switch to Preview mode" : "Switch to Code view"}
            >
              {isCodeView ? <Type size={12} style={{ marginRight: 4 }} /> : <Code2 size={12} style={{ marginRight: 4 }} />}
              {isCodeView ? "Preview mode" : "Code view"}
            </AppButton>

            <AppButton
              variant="small"
              onClick={() => setShowOnlyChanges((v) => !v)}
              aria-pressed={showOnlyChanges}
              data-tooltip="Toggle between showing all lines and only changed lines"
            >
              <Filter size={12} style={{ marginRight: 4 }} />
              {showOnlyChanges ? "Show all" : "Changes only"}
            </AppButton>
          </div>
        </div>
      </div>

      <div className="git-diff-body">
        {activeSection === "quick" && (
          <DiffSection
            title="Quick Notes"
            latestText={latest.rawNotes}
            previousText={previous.rawNotes}
            showOnlyChanges={showOnlyChanges}
            isCodeView={isCodeView}
          />
        )}

        {activeSection === "formal" && (
          <DiffSection
            title="Formal Notes"
            latestText={latest.cleansed}
            previousText={previous.cleansed}
            showOnlyChanges={showOnlyChanges}
            isCodeView={isCodeView}
          />
        )}
      </div>
    </div>
  );
}

export default GitDiffViewer;
