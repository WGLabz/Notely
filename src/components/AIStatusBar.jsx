import React, { useEffect, useState } from "react";
import { Sparkles, Activity, AlertTriangle, CheckCircle, Pause } from "lucide-react";
import { aiGetHealth, aiGetPreferences } from "../services/electronService";

export function AIStatusBar({ onClick }) {
  const [status, setStatus] = useState("disabled"); // disabled, idle, indexing, error
  const [provider, setProvider] = useState("");

  const updateStatus = async () => {
    try {
      const prefs = await aiGetPreferences();
      const aiEnabled = prefs?.aiEnabled !== false;

      if (!aiEnabled) {
        setStatus("disabled");
        setProvider("");
        return;
      }

      const health = await aiGetHealth();
      if (health?.success && health.data) {
        const rawProv = health.data.activeProvider || "Unknown";
        const providerName = rawProv.charAt(0).toUpperCase() + rawProv.slice(1);
        setProvider(providerName);
        if (health.data.isIndexing) {
          setStatus("indexing");
        } else if (health.data.isPaused) {
          setStatus("paused");
        } else {
          setStatus("idle");
        }
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    updateStatus();
    const interval = setInterval(updateStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  let Icon = Sparkles;
  let label = "AI: Not Ready";
  let statusClass = "ai-status-bar--disabled";

  if (status === "idle") {
    Icon = CheckCircle;
    label = `AI: Ready (${provider})`;
    statusClass = "ai-status-bar--ready";
  } else if (status === "indexing") {
    Icon = Activity;
    label = "AI: Indexing...";
    statusClass = "ai-status-bar--indexing";
  } else if (status === "paused") {
    Icon = Pause;
    label = "AI: Paused";
    statusClass = "ai-status-bar--paused";
  } else if (status === "error") {
    Icon = AlertTriangle;
    label = "AI Error";
    statusClass = "ai-status-bar--error";
  }

  return (
    <button
      type="button"
      className={`terminal-meta-pill ai-status-bar ${statusClass}`}
      onClick={onClick}
      data-tooltip="Click to open AI Settings & Diagnostics"
      aria-label={label}
    >
      <Icon size={12} className={status === "indexing" ? "animate-pulse" : ""} />
      <span>{label}</span>
    </button>
  );
}

export default AIStatusBar;
