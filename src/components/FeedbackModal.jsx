import React, { useState, useEffect } from "react";
import { X, HelpCircle, Github } from "lucide-react";
import { OverlayDialog } from "./OverlayDialog";
import AppIconButton from "./AppIconButton";
import AppSelect from "./AppSelect";
import AppButton from "./AppButton";
import { getAppInfo, openExternal } from "../services/electronService";

export function FeedbackModal({ open, onClose, themePreference }) {
  const [appInfo, setAppInfo] = useState({ version: "0.1.22", commitHash: "", isPackaged: false });
  const [issueType, setIssueType] = useState("bug");
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDetails, setIssueDetails] = useState("");
  const [issueSteps, setIssueSteps] = useState("");

  useEffect(() => {
    let active = true;
    async function loadAppInfo() {
      try {
        const info = await getAppInfo();
        if (info && active) {
          setAppInfo(info);
        }
      } catch (err) {
        console.warn("Failed to load app info", err);
      }
    }
    if (open) {
      loadAppInfo();
    }
    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  const handleReportIssue = async (e) => {
    e.preventDefault();
    if (!issueTitle.trim() || !issueDetails.trim()) return;

    let body = `### Description\n${issueDetails}\n\n`;
    if (issueType === "bug" && issueSteps.trim()) {
      body += `### Steps to Reproduce\n${issueSteps}\n\n`;
    }

    body += `---
### System Info
- App Version: ${appInfo.version}
- Core Version: ${appInfo.versionCore || appInfo.version}
- Commit: ${appInfo.commitHash || "N/A"}
- OS: ${navigator.userAgent || "Unknown"}
- Theme: ${themePreference || "auto"}`;

    const label = issueType === "bug" ? "bug" : "enhancement";
    const titleText = `[${issueType === "bug" ? "Bug" : "Enhancement"}] ${issueTitle}`;
    const url = `https://github.com/TheNotelyApp/Notely/issues/new?title=${encodeURIComponent(titleText)}&body=${encodeURIComponent(body)}&labels=${label}`;

    await openExternal(url);
    onClose();
  };

  return (
    <OverlayDialog open={open} onClose={onClose} ariaLabel="Report Bug / Feedback" cardClassName="feedback-dialog-card">
      <div className="overlay-dialog-header">
        <div className="settings-header-title">
          <HelpCircle size={18} />
          <h2>Report Bug / Feedback</h2>
        </div>
        <AppIconButton onClick={onClose} aria-label="Close Feedback">
          <X size={16} />
        </AppIconButton>
      </div>

      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto" }}>
        <p className="settings-pane-intro" style={{ margin: 0 }}>Report bugs or suggest features directly to our GitHub repository.</p>

        <form onSubmit={handleReportIssue} className="settings-help-form" style={{ maxWidth: "100%" }}>
          <div className="settings-field-group">
            <label className="settings-field-label">Issue Type</label>
            <AppSelect
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
            >
              <option value="bug">Bug Report</option>
              <option value="enhancement">Feature Enhancement</option>
            </AppSelect>
          </div>

          <div className="settings-field-group">
            <label className="settings-field-label">Title</label>
            <input
              type="text"
              required
              placeholder={issueType === "bug" ? "Brief description of the bug..." : "Brief description of the feature request..."}
              value={issueTitle}
              onChange={(e) => setIssueTitle(e.target.value)}
              className="settings-input"
            />
          </div>

          <div className="settings-field-group">
            <label className="settings-field-label">Details</label>
            <textarea
              required
              placeholder={
                issueType === "bug"
                  ? "What happened, and what did you expect to happen instead?"
                  : "Describe the feature, why it is useful, and how it should work."
              }
              value={issueDetails}
              onChange={(e) => setIssueDetails(e.target.value)}
              className="settings-textarea"
            />
          </div>

          {issueType === "bug" && (
            <div className="settings-field-group">
              <label className="settings-field-label">Steps to Reproduce</label>
              <textarea
                placeholder={"1. Open app\n2. Click on...\n3. See error..."}
                value={issueSteps}
                onChange={(e) => setIssueSteps(e.target.value)}
                className="settings-textarea"
              />
            </div>
          )}

          <div className="settings-info-box" style={{ marginTop: "8px" }}>
            <div className="settings-info-title">
              <HelpCircle size={14} /> System Information
            </div>
            <ul className="settings-info-details">
              <li><strong>App Version:</strong> {appInfo.version}</li>
              <li><strong>OS Platform:</strong> {navigator.userAgent.includes("Windows") ? "Windows" : navigator.userAgent.includes("Mac") ? "macOS" : "Linux"}</li>
              <li><strong>Commit:</strong> {appInfo.commitHash ? appInfo.commitHash.substring(0, 7) : "Unknown"}</li>
            </ul>
          </div>

          <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "8px", alignItems: "center" }}>
            <AppButton onClick={onClose} variant="small" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <X size={14} />
              Cancel
            </AppButton>
            <AppButton type="submit" variant="primary" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Github size={14} />
              Report on GitHub
            </AppButton>
          </div>
        </form>
      </div>
    </OverlayDialog>
  );
}
