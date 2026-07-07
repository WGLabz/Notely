import { EditorView } from "@codemirror/view";

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: '"Cascadia Code", Consolas, ui-monospace, monospace',
    lineHeight: "1.6",
  },
  ".cm-content": {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontFamily: 'inherit',
    fontSize: "var(--font-size-body, 14px)",
    color: "var(--app-text)",
    padding: "14px 0 max(72px, 45vh)",
    minHeight: "100%",
  },
  ".cm-line": {
    padding: "0 16px",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface-bg)",
    borderRight: "1px solid var(--border-default)",
    color: "var(--text-muted)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "var(--surface-accent)",
  },
  ".cm-selectionLayer": {
    display: "none !important",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "rgba(10, 107, 138, 0.3) !important",
  },
  ".cm-issue-spelling": {
    backgroundColor: "var(--status-warning-bg)",
    boxShadow: "inset 0 -2px 0 var(--status-warning-border)",
    borderRadius: "4px",
  },
  ".cm-issue-other": {
    backgroundColor: "var(--status-danger-bg)",
    boxShadow: "inset 0 -2px 0 var(--status-danger-border)",
    borderRadius: "4px",
  },
  ".cm-ai-ghost-widget": {
    margin: "8px 16px 0",
    padding: "12px 14px",
    border: "1px dashed var(--accent-solid)",
    borderRadius: "var(--radius-lg, 10px)",
    backgroundColor: "var(--surface-elevated)",
    color: "var(--text-strong)",
    display: "grid",
    gap: "10px",
    boxShadow: "var(--shadow-sm)",
  },
  ".cm-ai-ghost-header": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    fontSize: "var(--font-size-caption, 11px)",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
  },
  ".cm-ai-ghost-actions": {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  ".cm-ai-ghost-button": {
    minHeight: "28px",
    padding: "0 12px",
    border: "1px solid var(--border-soft)",
    borderRadius: "var(--radius-pill, 999px)",
    backgroundColor: "var(--surface-bg)",
    color: "var(--text-strong)",
    fontSize: "var(--font-size-caption, 11px)",
    fontWeight: "700",
    cursor: "pointer",
    transition: "background-color var(--motion-fast)",
  },
  ".cm-ai-ghost-button:hover": {
    backgroundColor: "var(--surface-accent)",
  },
  ".cm-ai-ghost-button.reject": {
    backgroundColor: "var(--status-danger-bg)",
    color: "var(--status-danger-text)",
    border: "1px solid var(--status-danger-border)",
  },
  ".cm-ai-ghost-button.reject:hover": {
    backgroundColor: "var(--surface-bg)",
  },
  ".cm-ai-ghost-body": {
    whiteSpace: "pre-wrap",
    fontSize: "var(--font-size-label, 12px)",
    lineHeight: "1.6",
    color: "var(--text-secondary)",
  },
  ".cm-find-match": {
    backgroundColor: "var(--status-success-bg)",
    boxShadow: "inset 0 0 0 1px var(--status-success-border)",
    borderRadius: "4px",
  },
  ".cm-find-match-active": {
    backgroundColor: "var(--status-success-bg)",
    boxShadow: "inset 0 0 0 2px var(--status-success-text)",
    borderRadius: "4px",
  },
});
