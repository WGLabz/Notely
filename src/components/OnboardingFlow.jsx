import React, { useState } from "react";
import { 
  ArrowRight, 
  ArrowLeft, 
  Sun, 
  Moon, 
  Monitor, 
  CheckCircle, 
  BookOpen, 
  Share2, 
  Sparkles, 
  History,
  X,
  Github,
  User,
  ExternalLink,
  Table,
  Palette
} from "lucide-react";
import { pickFolder } from "../services/electronService";
import notelyMark from "../assets/branding/notely-mark.png";
import "./OnboardingFlow.css";

export function OnboardingFlow({ 
  onComplete, 
  defaultNotesPath, 
  themePreference, 
  onThemeChange,
  appInfo,
  canClose
}) {
  const [step, setStep] = useState(1);
  const [folderOption, setFolderOption] = useState("default"); // "default" or "custom"
  const [customPath, setCustomPath] = useState("");
  const [localTheme, setLocalTheme] = useState(themePreference || "auto");
  const [setupDemo, setSetupDemo] = useState(false);
  const [workspaceConfirmed, setWorkspaceConfirmed] = useState(false);

  const totalSteps = 4;
  const repositoryUrl = "https://github.com/wglabz/notely";

  const handleBrowseFolder = async () => {
    try {
      const selected = await pickFolder();
      if (selected) {
        setCustomPath(selected);
        setFolderOption("custom");
      }
    } catch (err) {
      console.error("Failed to pick folder:", err);
    }
  };

  const selectedWorkspacePath = folderOption === "default" ? defaultNotesPath : customPath;

  const handleNext = () => {
    if (step === 2 && folderOption === "custom" && !customPath) {
      alert("Please select a custom folder first, or choose the default location.");
      return;
    }
    if (step === 2) {
      setWorkspaceConfirmed(true);
    }
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleFinish = () => {
    onComplete({
      workspacePath: selectedWorkspacePath,
      theme: localTheme,
      setupDemo
    });
  };

  const selectTheme = (theme) => {
    setLocalTheme(theme);
    onThemeChange(theme);
  };

  const openLink = (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <header className="onboarding-header-progress">
          <div className="onboarding-logo" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <img 
              src={notelyMark} 
              alt="" 
              style={{ width: "18px", height: "18px", objectFit: "contain" }}
            />
            <span>Notely</span>
          </div>
          <div className="onboarding-steps-indicator" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {Array.from({ length: totalSteps }).map((_, idx) => {
              const stepNum = idx + 1;
              return (
                <div 
                  key={stepNum} 
                  className={`onboarding-step-dot ${stepNum === step ? "active" : ""} ${stepNum < step ? "completed" : ""}`}
                />
              );
            })}
            <button
              type="button"
              className="onboarding-close-btn"
              data-tooltip={(canClose && workspaceConfirmed) ? "Skip & close onboarding" : "Please select and confirm a workspace folder to close"}
              onClick={handleFinish}
              disabled={!(canClose && workspaceConfirmed)}
              style={{ 
                background: "none", 
                border: "none", 
                color: (canClose && workspaceConfirmed) ? "var(--text-muted)" : "var(--border-default)", 
                cursor: (canClose && workspaceConfirmed) ? "pointer" : "not-allowed", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                padding: "4px",
                borderRadius: "50%",
                transition: "background var(--motion-standard)",
                opacity: (canClose && workspaceConfirmed) ? 1 : 0.4
              }}
              onMouseEnter={(e) => {
                if (canClose && workspaceConfirmed) e.currentTarget.style.background = "var(--surface-accent)";
              }}
              onMouseLeave={(e) => {
                if (canClose && workspaceConfirmed) e.currentTarget.style.background = "none";
              }}
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <main className="onboarding-body">
          {step === 1 && (
            <div className="onboarding-slide">
              <div className="onboarding-welcome-hero" style={{ display: "flex", alignItems: "center", gap: "24px", marginBottom: "16px" }}>
                <img 
                  src={notelyMark} 
                  alt="Notely" 
                  style={{ width: "80px", height: "80px", objectFit: "contain" }}
                />
                <div>
                  <h2 style={{ fontSize: "28px", fontWeight: "800", color: "var(--text-strong)", margin: "0" }}>Notely Workspace</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: "4px 0 0 0" }}>
                    Version {appInfo?.version || "0.1.0"}
                  </p>
                  <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "12px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--text-secondary)" }}>
                      <User size={14} /> Bikash Narayan Panda
                    </span>
                    <a 
                      href={repositoryUrl} 
                      onClick={(e) => { e.preventDefault(); openLink(repositoryUrl); }}
                      style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--focus-ring-color)", textDecoration: "none", fontWeight: "600" }}
                    >
                      <Github size={14} /> wglabz/notely <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              </div>
              <p>
                Notely is a modern Markdown notes app for team and project workspaces. Organize, customize, and edit your notes all in one place.
              </p>
              <div className="onboarding-features-list">
                <div className="onboarding-feature-item">
                  <Table className="onboarding-feature-icon" size={20} />
                  <div className="onboarding-feature-text">
                    <h4>Markdown & Inline Tables</h4>
                    <p>Format styled text and edit complex tables using a focused visual grid editor.</p>
                  </div>
                </div>
                <div className="onboarding-feature-item">
                  <Palette className="onboarding-feature-icon" size={20} />
                  <div className="onboarding-feature-text">
                    <h4>Excalidraw & Mermaid</h4>
                    <p>Sketch quick drawings with Excalidraw, and render diagrams instantly with Mermaid.</p>
                  </div>
                </div>
                <div className="onboarding-feature-item">
                  <History className="onboarding-feature-icon" size={20} />
                  <div className="onboarding-feature-text">
                    <h4>Git Version Control</h4>
                    <p>Track history, manage branches, and tag commits directly inside your workspace.</p>
                  </div>
                </div>
                <div className="onboarding-feature-item">
                  <Share2 className="onboarding-feature-icon" size={20} />
                  <div className="onboarding-feature-text">
                    <h4>P2P Note Sync</h4>
                    <p>Discover, pair, and synchronize notes securely with peers on your local network.</p>
                  </div>
                </div>
                <div className="onboarding-feature-item">
                  <Sparkles className="onboarding-feature-icon" size={20} />
                  <div className="onboarding-feature-text">
                    <h4>Workspace AI</h4>
                    <p>Query semantic search, ask questions, and chat with local context integration.</p>
                  </div>
                </div>
                <div className="onboarding-feature-item">
                  <CheckCircle className="onboarding-feature-icon" size={20} />
                  <div className="onboarding-feature-text">
                    <h4>Tasks & Workspace Exports</h4>
                    <p>Track checklists across project files and export workspaces as PDF, HTML, or Zip.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-slide">
              <h2>Set Workspace Folder</h2>
              <p>
                Choose where your project notes, folders, and local media files will be saved on your computer.
              </p>

              <div className="onboarding-folder-selector">
                <button 
                  type="button"
                  className={`onboarding-folder-option ${folderOption === "default" ? "selected" : ""}`}
                  onClick={() => setFolderOption("default")}
                >
                  <div className="onboarding-folder-option-radio"></div>
                  <div className="onboarding-folder-option-text">
                    <h4>Default Notely Directory</h4>
                    <p>Save notes in your standard Documents directory.</p>
                  </div>
                </button>

                <button 
                  type="button"
                  className={`onboarding-folder-option ${folderOption === "custom" ? "selected" : ""}`}
                  onClick={() => {
                    if (customPath) {
                      setFolderOption("custom");
                    } else {
                      void handleBrowseFolder();
                    }
                  }}
                >
                  <div className="onboarding-folder-option-radio"></div>
                  <div className="onboarding-folder-option-text">
                    <h4>Custom Directory</h4>
                    <p>Select any existing project folder on your computer.</p>
                  </div>
                </button>

                <div className="onboarding-path-display">
                  <span data-tooltip={selectedWorkspacePath}>
                    {selectedWorkspacePath || "No custom directory selected"}
                  </span>
                  <button 
                    type="button"
                    className="onboarding-path-browse-btn"
                    onClick={handleBrowseFolder}
                  >
                    Browse...
                  </button>
                </div>
              </div>

              <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                <input 
                  type="checkbox" 
                  id="setupDemoCheckbox" 
                  checked={setupDemo} 
                  onChange={(e) => setSetupDemo(e.target.checked)} 
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                <label htmlFor="setupDemoCheckbox" style={{ fontSize: "13px", color: "var(--text-muted)", cursor: "pointer", userSelect: "none" }}>
                  Set up demo workspace (adds sample notes to help you explore features)
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="onboarding-slide">
              <h2>Personalize</h2>
              <p>
                Customize your initial workspace appearance. You can always change these settings later from the main app menu.
              </p>

              <div className="onboarding-theme-selector">
                <div 
                  className={`onboarding-theme-option ${localTheme === "light" ? "selected" : ""}`}
                  onClick={() => selectTheme("light")}
                >
                  <div className="onboarding-theme-icon"><Sun size={20} /></div>
                  <span className="onboarding-theme-label">Light</span>
                </div>

                <div 
                  className={`onboarding-theme-option ${localTheme === "dark" ? "selected" : ""}`}
                  onClick={() => selectTheme("dark")}
                >
                  <div className="onboarding-theme-icon"><Moon size={20} /></div>
                  <span className="onboarding-theme-label">Dark</span>
                </div>

                <div 
                  className={`onboarding-theme-option ${localTheme === "auto" ? "selected" : ""}`}
                  onClick={() => selectTheme("auto")}
                >
                  <div className="onboarding-theme-icon"><Monitor size={20} /></div>
                  <span className="onboarding-theme-label">System</span>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="onboarding-slide" style={{ textAlign: "center" }}>
              <div className="onboarding-completion-checkmark">
                <CheckCircle size={20} />
              </div>
              <h2>You&apos;re All Set!</h2>
              <p>
                Your workspace is ready. You can now create your first project note, import markdown documents, or enable AI tools to query your files.
              </p>
              <p style={{ marginTop: "12px", fontSize: "13px" }}>
                Workspace Location: <code style={{ wordBreak: "break-all" }}>{selectedWorkspacePath}</code>
              </p>
            </div>
          )}
        </main>

        <footer className="onboarding-footer">
          {step > 1 && (
            <button 
              type="button"
              className="onboarding-btn onboarding-btn-secondary"
              onClick={handleBack}
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}

          {step < totalSteps ? (
            <button 
              type="button"
              className="onboarding-btn onboarding-btn-primary"
              onClick={handleNext}
              disabled={step === 2 && folderOption === "custom" && !customPath}
            >
              Next <ArrowRight size={16} />
            </button>
          ) : (
            <button 
              type="button"
              className="onboarding-btn onboarding-btn-primary"
              onClick={handleFinish}
            >
              Get Started <CheckCircle size={16} />
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
