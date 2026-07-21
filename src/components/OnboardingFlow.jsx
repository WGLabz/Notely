import React, { useState } from "react";
import { 
  ArrowRight, 
  ArrowLeft, 
  Sun, 
  Moon, 
  Monitor, 
  CheckCircle, 
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
import { 
  pickFolder,
  aiSetApiKey,
  aiTestConnection,
  aiGetModelStatus,
  aiDownloadModel,
  onModelDownloadProgress
} from "../services/electronService";
import notelyMark from "../assets/branding/notely-mark.png";
import "../styles/OnboardingFlow.css";

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

  const [aiEnabled, setAiEnabled] = useState(true);
  const [selectedAIProvider, setSelectedAIProvider] = useState("gemini");
  const [enableEmbeddings, setEnableEmbeddings] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [testSuccess, setTestSuccess] = useState(null);
  const [modelStatus, setModelStatus] = useState({ downloaded: false, isDownloading: false, progress: 0 });
  const [graphModelStatus, setGraphModelStatus] = useState({ downloaded: false, isDownloading: false, progress: 0 });

  const totalSteps = 5;
  const repositoryUrl = "https://github.com/wglabz/notely";

  React.useEffect(() => {
    if (step !== 4) return;
    
    const checkModel = async () => {
      try {
        const res = await aiGetModelStatus();
        if (res.success && res.data) {
          setModelStatus(res.data);
        }
        const { aiGetGraphModelStatus } = await import('../services/electronService');
        const gRes = await aiGetGraphModelStatus();
        if (gRes.success && gRes.data) {
          setGraphModelStatus(gRes.data);
        }
      } catch (err) {
        console.error(err);
      }
    };
    checkModel();

    const unsubscribe = onModelDownloadProgress((payload) => {
      setModelStatus(prev => ({
        ...prev,
        isDownloading: true,
        progress: payload.progress,
        downloaded: payload.progress === 100
      }));
    });

    let unsubscribeGraph = () => {};
    import('../services/electronService').then(({ onGraphModelDownloadProgress }) => {
      unsubscribeGraph = onGraphModelDownloadProgress((payload) => {
        setGraphModelStatus(prev => ({
          ...prev,
          isDownloading: true,
          progress: payload.progress,
          downloaded: payload.progress === 100
        }));
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      if (typeof unsubscribeGraph === 'function') unsubscribeGraph();
    };
  }, [step]);

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
      setupDemo,
      aiEnabled,
      aiProvider: selectedAIProvider,
      enableEmbeddings
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
            <div className="onboarding-slide">
              <h2>Workspace AI Assistant</h2>
              <p>
                Optionally enable AI features. All indexing, memory, and similarity analysis run locally or through your secure API keys.
              </p>

              <div style={{ margin: "16px 0", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", border: "1px solid var(--border-soft)", borderRadius: "8px", background: "var(--background-soft)" }}>
                  <span style={{ fontWeight: "700", color: "var(--text-strong)" }}>
                    Enable AI Subsystem
                  </span>
                  <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", position: "relative", width: "40px", height: "20px" }}>
                    <input
                      type="checkbox"
                      id="onboarding-ai-enabled"
                      checked={aiEnabled}
                      onChange={(e) => setAiEnabled(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: "absolute",
                      top: 0, left: 0, right: 0, bottom: 0,
                      background: aiEnabled ? "var(--accent-solid)" : "var(--border-default)",
                      borderRadius: "20px",
                      transition: "background var(--motion-standard)",
                      cursor: "pointer"
                    }}>
                      <span style={{
                        position: "absolute",
                        height: "16px",
                        width: "16px",
                        left: aiEnabled ? "22px" : "2px",
                        bottom: "2px",
                        background: "var(--surface-bg, #fff)",
                        borderRadius: "50%",
                        transition: "left var(--motion-standard)",
                        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)"
                      }} />
                    </span>
                  </label>
                </div>

                {aiEnabled && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingLeft: "8px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "6px" }}>
                        Default Text Provider
                      </label>
                      <select
                        value={selectedAIProvider}
                        onChange={(e) => {
                          setSelectedAIProvider(e.target.value);
                          setApiKey("");
                          setTestSuccess(null);
                        }}
                        style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--border-soft)", background: "var(--background-default)", color: "var(--text-strong)" }}
                      >
                        <option value="local">Local (Qwen2.5-0.5B offline model)</option>
                        <option value="gemini">Google Gemini (Default)</option>
                        <option value="groq">Groq (Ultra Fast Open Models)</option>
                      </select>
                    </div>

                    {selectedAIProvider === "local" ? (
                      <div style={{ padding: "10px", background: "var(--surface-muted)", border: "1px solid var(--border-soft)", borderRadius: "6px", marginBottom: "4px" }}>
                        <strong style={{ fontSize: "13px", display: "block", marginBottom: "4px" }}>Local Qwen Model Status</strong>
                        {graphModelStatus.downloaded ? (
                          <div style={{ color: "var(--accent-solid)", fontSize: "12px" }}>✓ Qwen2.5 model weights downloaded & ready!</div>
                        ) : graphModelStatus.isDownloading ? (
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                              <span>Downloading Qwen weights...</span>
                              <span>{graphModelStatus.progress}%</span>
                            </div>
                            <div style={{ width: "100%", height: "4px", background: "var(--background-soft)", borderRadius: "2px", overflow: "hidden" }}>
                              <div style={{ width: `${graphModelStatus.progress}%`, height: "100%", background: "var(--accent-solid)" }} />
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>~400 MB download required for offline mode.</span>
                            <button
                              type="button"
                              className="btn"
                              onClick={async () => {
                                try {
                                  const { aiDownloadGraphModel } = await import('../services/electronService');
                                  await aiDownloadGraphModel();
                                  setGraphModelStatus(prev => ({ ...prev, isDownloading: true, progress: 0 }));
                                } catch (err) {
                                  alert("Failed to start download: " + err.message);
                                }
                              }}
                              style={{ padding: "4px 10px", fontSize: "11px", cursor: "pointer", background: "var(--accent-solid)", color: "#fff", border: "none", borderRadius: "6px" }}
                            >
                              Download Qwen
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "4px" }}>
                          API Key
                        </label>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <input
                            type="password"
                            placeholder={`Enter ${selectedAIProvider} API Key...`}
                            value={apiKey}
                            onChange={(e) => {
                              setApiKey(e.target.value);
                              setTestSuccess(null);
                            }}
                            style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid var(--border-soft)", background: "var(--background-default)", color: "var(--text-strong)" }}
                          />
                          <button
                            type="button"
                            className="btn"
                            disabled={!apiKey || testingConnection}
                            onClick={async () => {
                              setTestingConnection(true);
                              setTestSuccess(null);
                              try {
                                await aiSetApiKey(selectedAIProvider, apiKey);
                                const res = await aiTestConnection({ provider: selectedAIProvider });
                                if (res.success) {
                                  setTestSuccess(true);
                                } else {
                                  setTestSuccess(false);
                                  alert(res.error || "Connection failed.");
                                }
                              } catch (err) {
                                setTestSuccess(false);
                                alert(err.message);
                              } finally {
                                setTestingConnection(false);
                              }
                            }}
                            style={{ padding: "0 12px", height: "35px", boxSizing: "border-box", cursor: "pointer", background: "var(--surface-header)", border: "1px solid var(--border-soft)", color: "var(--text-strong)", borderRadius: "6px" }}
                          >
                            {testingConnection ? "Testing..." : "Test Connection"}
                          </button>
                        </div>
                        {testSuccess === true && <div style={{ color: "var(--accent-solid)", fontSize: "12px", marginTop: "4px" }}>✓ Connection successful!</div>}
                        {testSuccess === false && <div style={{ color: "var(--accent-danger)", fontSize: "12px", marginTop: "4px" }}>✗ Connection failed.</div>}
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                      <input
                        type="checkbox"
                        id="onboarding-ai-embeddings"
                        checked={enableEmbeddings}
                        onChange={(e) => setEnableEmbeddings(e.target.checked)}
                        style={{ width: "16px", height: "16px", cursor: "pointer" }}
                      />
                      <label htmlFor="onboarding-ai-embeddings" style={{ fontSize: "13px", color: "var(--text-muted)", cursor: "pointer" }}>
                        Enable background embeddings (enables Semantic Search)
                      </label>
                    </div>

                    {enableEmbeddings && (
                      <div style={{ marginTop: "8px", borderTop: "1px solid var(--border-soft)", paddingTop: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <strong style={{ fontSize: "13px" }}>BGE Local Embedding Model</strong>
                            <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "var(--text-muted)" }}>
                              Runs locally on your CPU for secure offline semantic search.
                            </p>
                          </div>
                          {!modelStatus.downloaded && !modelStatus.isDownloading && (
                            <button
                              type="button"
                              className="btn"
                              onClick={async () => {
                                try {
                                  await aiDownloadModel();
                                } catch (err) {
                                  alert("Download trigger failed: " + err.message);
                                }
                              }}
                              style={{ padding: "6px 12px", fontSize: "12px", cursor: "pointer", background: "var(--accent-solid)", color: "#fff", border: "none", borderRadius: "6px" }}
                            >
                              Download Model (~90MB)
                            </button>
                          )}
                        </div>

                        {modelStatus.isDownloading && (
                          <div style={{ marginTop: "6px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                              <span>Downloading...</span>
                              <span>{modelStatus.progress}%</span>
                            </div>
                            <div style={{ width: "100%", height: "4px", background: "var(--background-soft)", borderRadius: "2px", overflow: "hidden" }}>
                              <div style={{ width: `${modelStatus.progress}%`, height: "100%", background: "var(--accent-solid)" }} />
                            </div>
                          </div>
                        )}

                        {modelStatus.downloaded && (
                          <div style={{ color: "var(--accent-solid)", fontSize: "12px", marginTop: "6px" }}>
                            ✓ Model downloaded and ready!
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
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
