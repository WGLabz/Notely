import { useEffect, useState } from "react";
import { validateMarkdownSyntax } from "../utils/markdownValidation";

export function MarkdownValidationBanner({ value }) {
  const [issues, setIssues] = useState([]);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    let cancelled = false;
    setStatus("checking");

    const timer = window.setTimeout(async () => {
      try {
        const result = await validateMarkdownSyntax(value || "");
        if (!cancelled) {
          setIssues(result);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setIssues([]);
          setStatus("error");
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  if (status === "checking") {
    return <div className="validation-banner checking">Checking markdown...</div>;
  }

  if (status === "error") {
    return <div className="validation-banner error">Validation service unavailable.</div>;
  }

  if (!issues.length) {
    return <div className="validation-banner ok">No markdown issues detected.</div>;
  }

  const firstIssue = issues[0];
  const remaining = issues.length - 1;

  return (
    <div className="validation-banner warning">
      <span>
        Line {firstIssue.line}:{firstIssue.column || 1} - {firstIssue.message}
      </span>
      {remaining > 0 ? <span>+{remaining} more</span> : null}
    </div>
  );
}
