import { useEffect, useRef, useState } from "react";
import { validateMarkdownComplete } from "../utils/markdownValidationComplete";

export function useMarkdownValidation(
  value,
  { spellCheck = true, debounceMs = 500, strategy = "debounce", throttleMs = 500 } = {}
) {
  const [issues, setIssues] = useState([]);
  const [status, setStatus] = useState("ready");
  const requestIdRef = useRef(0);
  const debounceTimeoutRef = useRef(null);
  const throttleTimeoutRef = useRef(null);
  const lastThrottleRunRef = useRef(0);

  useEffect(() => {
    // Clear any pending validation timers.
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current);
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const runValidation = async () => {
      setStatus("checking");
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

    if (strategy === "throttle") {
      const now = Date.now();
      const interval = Math.max(Number(throttleMs) || 0, 0);
      const elapsed = now - lastThrottleRunRef.current;

      if (elapsed >= interval) {
        lastThrottleRunRef.current = now;
        void runValidation();
      } else {
        const delay = interval - elapsed;
        setStatus("checking");
        throttleTimeoutRef.current = setTimeout(() => {
          lastThrottleRunRef.current = Date.now();
          void runValidation();
        }, delay);
      }
    } else {
      debounceTimeoutRef.current = setTimeout(() => {
        void runValidation();
      }, debounceMs);
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
      }
      requestIdRef.current = Math.max(requestIdRef.current, requestId);
    };
  }, [value, spellCheck, debounceMs, strategy, throttleMs]);

  return { issues, status };
}
