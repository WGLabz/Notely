export function MarkdownValidationBanner({ issues = [], status = "idle" }) {
  if (status === "checking") {
    return <div className="validation-banner checking">Checking markdown and typos...</div>;
  }

  if (status === "error") {
    return <div className="validation-banner error">Validation service unavailable.</div>;
  }

  if (!issues.length) {
    return <div className="validation-banner ok">No issues detected (markdown, typos).</div>;
  }

  const firstIssue = issues[0];
  const remaining = issues.length - 1;

  const getIssueLabel = (issue) => {
    if (!issue) return "Issue";
    if (issue.ruleId === "spelling") return issue.word ? "Typo" : "Spelling";
    if (issue.ruleId?.includes("table")) return "Markdown";
    return "Issue";
  };

  // Get icon and color based on issue type
  const getIssueIcon = (ruleId) => {
    if (ruleId === "spelling") return "✎";
    if (ruleId?.includes("table")) return "⊞";
    return "⚠";
  };

  const getSeverityClass = (issue) => {
    if (issue.ruleId === "spelling") return "spelling";
    if (issue.severity === "error") return "error";
    if (issue.severity === "warning") return "warning";
    return "info";
  };

  const icon = getIssueIcon(firstIssue.ruleId);
  const severityClass = getSeverityClass(firstIssue);

  return (
    <div className={`validation-banner ${severityClass}`}>
      <span className="validation-banner-main">
        <span className={`validation-kind-badge ${firstIssue.ruleId || "issue"}`}>{getIssueLabel(firstIssue)}</span>
        {icon} Line {firstIssue.line}:{firstIssue.column || 1} - {firstIssue.message}
      </span>
      {remaining > 0 ? <span>+{remaining} more</span> : null}
    </div>
  );
}
