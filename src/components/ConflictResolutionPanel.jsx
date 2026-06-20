import { useMemo, useState } from "react";

const MAX_DIFF_LINES = 400;

function computeLineDiff(aText, bText) {
  const a = String(aText || "").split("\n");
  const b = String(bText || "").split("\n");

  if (a.length + b.length > MAX_DIFF_LINES) {
    return null;
  }

  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const diff = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      diff.unshift({ type: "same", value: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: "added", value: b[j - 1] });
      j -= 1;
    } else {
      diff.unshift({ type: "removed", value: a[i - 1] });
      i -= 1;
    }
  }

  return diff;
}

function buildLinePairs(diff) {
  const left = [];
  const right = [];
  diff.forEach((entry, idx) => {
    if (entry.type === "same") {
      left.push({ type: "same", value: entry.value, key: idx });
      right.push({ type: "same", value: entry.value, key: idx });
    } else if (entry.type === "removed") {
      left.push({ type: "removed", value: entry.value, key: idx });
      right.push({ type: "empty", value: "", key: `r-${idx}` });
    } else {
      left.push({ type: "empty", value: "", key: `l-${idx}` });
      right.push({ type: "added", value: entry.value, key: idx });
    }
  });
  return { left, right };
}

function DiffSide({ lines }) {
  return (
    <div className="conflict-diff-side">
      {lines.map((line) => (
        <div key={line.key} className={`conflict-diff-line conflict-diff-line-${line.type}`}>
          <pre className="conflict-diff-text">{line.type === "empty" ? "\u00a0" : line.value}</pre>
        </div>
      ))}
    </div>
  );
}

function SectionDiff({ localText, remoteText }) {
  const diff = useMemo(() => computeLineDiff(localText, remoteText), [localText, remoteText]);

  if (!diff) {
    return (
      <div className="conflict-diff-split">
        <div className="conflict-diff-side conflict-diff-fallback">
          <pre className="conflict-diff-pre">{localText || "(empty)"}</pre>
        </div>
        <div className="conflict-diff-side conflict-diff-fallback">
          <pre className="conflict-diff-pre">{remoteText || "(empty)"}</pre>
        </div>
      </div>
    );
  }

  const { left, right } = buildLinePairs(diff);

  return (
    <div className="conflict-diff-split">
      <DiffSide lines={left} />
      <DiffSide lines={right} />
    </div>
  );
}

const SECTIONS = [
  { key: "header", label: "Header" },
  { key: "rawNotes", label: "Raw Notes" },
  { key: "cleansed", label: "Cleansed" },
];

export function ConflictResolutionPanel({
  localFile,
  conflictFile,
  relativePath,
  onResolve,
  loading,
}) {
  const [activeSection, setActiveSection] = useState("rawNotes");
  const [collapsedSections, setCollapsedSections] = useState({
    header: false,
    rawNotes: false,
    cleansed: false,
  });
  const [mergedHeader, setMergedHeader] = useState(localFile?.header || "");
  const [mergedRaw, setMergedRaw] = useState(localFile?.rawNotes || "");
  const [mergedCleansed, setMergedCleansed] = useState(localFile?.cleansed || "");
  const [busyAction, setBusyAction] = useState("");

  async function runAction(key, fn) {
    setBusyAction(key);
    try {
      await fn();
    } finally {
      setBusyAction("");
    }
  }

  function getMergedContent() {
    const header = mergedHeader.trim();
    const raw = mergedRaw.trim();
    const cleansed = mergedCleansed.trim();
    const parts = [];
    if (header) parts.push(header);
    parts.push("# RawNotes\n\n" + raw);
    parts.push("# Cleansed\n\n" + cleansed);
    return parts.join("\n\n") + "\n";
  }

  const sectionEditors = {
    header: { value: mergedHeader, onChange: setMergedHeader },
    rawNotes: { value: mergedRaw, onChange: setMergedRaw },
    cleansed: { value: mergedCleansed, onChange: setMergedCleansed },
  };

  const localSection = localFile?.[activeSection] || "";
  const conflictSection = conflictFile?.[activeSection] || "";
  const editorState = sectionEditors[activeSection];
  const isActiveCollapsed = Boolean(collapsedSections[activeSection]);

  function toggleCurrentSectionCollapse() {
    setCollapsedSections((currentSections) => ({
      ...currentSections,
      [activeSection]: !currentSections[activeSection],
    }));
  }

  function expandAllSections() {
    setCollapsedSections({
      header: false,
      rawNotes: false,
      cleansed: false,
    });
  }

  return (
    <div className="conflict-resolve-wrap">
      <div className="conflict-resolve-columns-label">
        <span>Your version</span>
        <span className="mono-cell conflict-resolve-filename">{relativePath}</span>
        <span>Incoming version</span>
      </div>

      <div className="conflict-resolve-tabs">
        {SECTIONS.map((section) => (
          <button
            key={section.key}
            className={`conflict-tab-btn${activeSection === section.key ? " active" : ""}`}
            type="button"
            onClick={() => setActiveSection(section.key)}
          >
            {section.label}
            {localFile?.[section.key] !== conflictFile?.[section.key] ? (
              <span className="conflict-tab-indicator" title="Content differs" />
            ) : null}
          </button>
        ))}
      </div>

      <div className="conflict-tab-actions">
        <button className="small-button" type="button" onClick={toggleCurrentSectionCollapse}>
          {isActiveCollapsed ? "Expand Current Section" : "Collapse Current Section"}
        </button>
        <button className="small-button" type="button" onClick={expandAllSections}>
          Expand All Sections
        </button>
      </div>

      {isActiveCollapsed ? (
        <div className="p2p-status-table-empty">This section is collapsed.</div>
      ) : (
        <>
          <div className="conflict-diff-wrap">
            <SectionDiff localText={localSection} remoteText={conflictSection} />
          </div>

          <div className="conflict-merge-editor">
            <div className="conflict-merge-editor-label">
              <span>Merged ({SECTIONS.find((s) => s.key === activeSection)?.label})</span>
              <div className="conflict-merge-shortcuts">
                <button
                  className="small-button"
                  type="button"
                  onClick={() => editorState.onChange(localSection)}
                >
                  Use Mine
                </button>
                <button
                  className="small-button"
                  type="button"
                  onClick={() => editorState.onChange(conflictSection)}
                >
                  Use Theirs
                </button>
              </div>
            </div>
            <textarea
              className="conflict-merge-textarea"
              value={editorState.value}
              onChange={(event) => editorState.onChange(event.target.value)}
              spellCheck={false}
            />
          </div>
        </>
      )}

      <div className="conflict-resolve-actions">
        <button
          className="small-button"
          type="button"
          disabled={loading || Boolean(busyAction)}
          onClick={() => runAction("local", () => onResolve("local"))}
        >
          {busyAction === "local" ? "Applying..." : "Keep All Mine"}
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={loading || Boolean(busyAction)}
          onClick={() => runAction("merged", () => onResolve({ mergedContent: getMergedContent() }))}
        >
          {busyAction === "merged" ? "Saving..." : "Save Merged"}
        </button>
        <button
          className="small-button"
          type="button"
          disabled={loading || Boolean(busyAction)}
          onClick={() => runAction("remote", () => onResolve("remote"))}
        >
          {busyAction === "remote" ? "Applying..." : "Keep All Theirs"}
        </button>
      </div>
    </div>
  );
}
