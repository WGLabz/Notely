import { useEffect, useRef, useState } from "react";
import { validateMarkdownComplete } from "../utils/markdownValidationComplete";

export function useMarkdownValidation(value, { spellCheck = true } = {}) {
  const [issues, setIssues] = useState([]);
  const [status, setStatus] = useState("checking");
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("checking");

    const runValidation = async () => {
      try {
        const nextIssues = await validateMarkdownComplete(value || "", { spellCheck });
        if (requestId !== requestIdRef.current) return;
        setIssues(nextIssues);
        setStatus("ready");
      } catch {
        if (requestId !== requestIdRef.current) return;
        setIssues([]);
        setStatus("error");
      }
    };

    runValidation();

    return () => {
      requestIdRef.current = Math.max(requestIdRef.current, requestId);
    };
  }, [value, spellCheck]);

  return { issues, status };
}
