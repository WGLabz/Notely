import React, { useEffect, useState } from 'react';
import { Save, Trash2, Zap, AlertCircle, Eye, EyeOff, Download, Database } from 'lucide-react';
import AppInput from './AppInput';
import AppSelect from './AppSelect';
import "../styles/AISettings.css";
import OverlayDialog from './OverlayDialog';
import KnowledgeGraphSettings from './KnowledgeGraphSettings';
import {
  aiClearData,
  aiGetApiKey,
  aiGetPreferences,
  aiGetProviderModel,
  aiSetApiKey,
  aiSetPreferences,
  aiSetProviderModel,
  aiTestConnection,
  aiGetProviderList,
  aiGetHealth,
  aiGetModelStatus,
  aiDownloadModel,
  onModelDownloadProgress,
  aiEnable,
  aiDisable
} from '../services/electronService';

const defaultPreferences = {
  enablePatternLearning: true,
  enableEmbeddings: true,
  enableRelationshipDiscovery: true,
  maxTokensPerQuery: 2048,
  temperature: 0.7
};

function normalizeProviderModels(models) {
  return (models || []).map((model) => {
    if (typeof model === 'string') {
      return { id: model, label: model, note: '' };
    }
    return {
      id: model?.id || '',
      label: model?.label || model?.id || '',
      note: model?.note || '',
    };
  }).filter((model) => model.id);
}

export const AISettingsContent = ({ _onClose }) => {
  const [providers, setProviders] = useState([]);
  const [apiKey, setApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [hfToken, setHfToken] = useState('');
  const [hfConfigured, setHfConfigured] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [plaintextKey, setPlaintextKey] = useState('');
  const [showPlaintext, setShowPlaintext] = useState(false);
  const [hfPlaintextToken, setHfPlaintextToken] = useState('');
  const [showHfPlaintext, setShowHfPlaintext] = useState(false);

  const [activeSubTab, setActiveSubTab] = useState("providers");
  const [modelStatus, setModelStatus] = useState({ downloaded: false, isDownloading: false, progress: 0 });

  useEffect(() => {
    const loadModelStatus = async () => {
      try {
        const res = await aiGetModelStatus();
        if (res.success && res.data) {
          setModelStatus(res.data);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadModelStatus();

    const unsubscribe = onModelDownloadProgress((payload) => {
      setModelStatus(prev => ({
        ...prev,
        isDownloading: true,
        progress: payload.progress,
        downloaded: payload.progress === 100
      }));
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (selectedProvider) {
      loadProviderKeyAndModel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setStatus('Loading configurations...');

      const listResponse = await aiGetProviderList();
      if (listResponse.success && listResponse.data) {
        setProviders(listResponse.data);
      }

      const prefsResponse = await aiGetPreferences();
      if (prefsResponse.success && prefsResponse.data) {
        setPreferences((prev) => ({ ...prev, ...prefsResponse.data }));
      }

      let activeProvider = prefsResponse.success && prefsResponse.data?.aiProvider;
      if (!activeProvider) {
        const healthRes = await aiGetHealth();
        if (healthRes?.success && healthRes?.data?.activeProvider && healthRes.data.activeProvider !== 'none') {
          activeProvider = healthRes.data.activeProvider;
        } else {
          activeProvider = 'gemini';
        }
      }

      setSelectedProvider(activeProvider);
      setStatus('');
    } catch (error) {
      setStatus(`Error loading settings: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadProviderKeyAndModel = async () => {
    if (!selectedProvider) return;
    try {
      const keyResponse = await aiGetApiKey(selectedProvider);
      if (keyResponse.success && keyResponse.data?.configured) {
        setApiKey(String(keyResponse.data?.maskedKey || ''));
        setPlaintextKey(String(keyResponse.data?.apiKey || ''));
      } else {
        setApiKey('');
        setPlaintextKey('');
      }

      const modelResponse = await aiGetProviderModel(selectedProvider);
      if (modelResponse.success && modelResponse.data?.model) {
        setSelectedModel(modelResponse.data.model);
      } else {
        const providerEntry = providers.find((p) => p.id === selectedProvider);
        setSelectedModel(providerEntry?.defaultModel || '');
      }
    } catch (err) {
      console.warn('[AI Settings] Failed to load provider details:', err.message);
    }
  };

  const handleSaveAPIKey = async () => {
    const keyToSave = showPlaintext ? plaintextKey : apiKey;
    if (!keyToSave || keyToSave.includes('...')) {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: 'Please enter a complete API key.', type: 'warning' }
      }));
      return;
    }

    try {
      setLoading(true);
      const response = await aiSetApiKey(selectedProvider, keyToSave);

      if (response.success) {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { message: `${selectedProvider} API key saved successfully.`, type: 'success' }
        }));
        setApiKey(keyToSave.substring(0, 5) + '...' + keyToSave.substring(keyToSave.length - 5));
        setPlaintextKey(keyToSave);
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { message: `Failed to save key: ${response.error}`, type: 'error' }
        }));
      }
    } catch (error) {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: `Error saving key: ${error.message}`, type: 'error' }
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveHfToken = async () => {
    const tokenToSave = showHfPlaintext ? hfPlaintextToken : hfToken;
    if (!tokenToSave || tokenToSave.includes('...')) {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: 'Please enter a complete HuggingFace token.', type: 'warning' }
      }));
      return;
    }

    try {
      setLoading(true);
      const response = await aiSetApiKey('huggingface', tokenToSave);
      if (response.success) {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { message: 'HuggingFace token saved successfully.', type: 'success' }
        }));
        setHfToken(tokenToSave.substring(0, 5) + '...' + tokenToSave.substring(tokenToSave.length - 5));
        setHfPlaintextToken(tokenToSave);
        setHfConfigured(true);
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { message: `Failed to save HuggingFace token: ${response.error}`, type: 'error' }
        }));
      }
    } catch (error) {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: `Error: ${error.message}`, type: 'error' }
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setLoading(true);
      setStatus('Testing connection...');
      setTestResult(null);

      const payloadKey = showPlaintext ? plaintextKey : apiKey;
      const res = await aiTestConnection({ provider: selectedProvider, apiKey: payloadKey });

      setTestResult(res);
      if (res.success) {
        setStatus(`Connection to ${selectedProvider} successful!`);
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { message: `Connected to ${selectedProvider} successfully!`, type: 'success' }
        }));
      } else {
        setStatus(`Connection failed: ${res.error}`);
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { message: `Connection failed: ${res.error}`, type: 'error' }
        }));
      }
    } catch (err) {
      setStatus(`Test failed: ${err.message}`);
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: `Error: ${err.message}`, type: 'error' }
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleTestHfConnection = async () => {
    try {
      setLoading(true);
      setStatus('Testing HuggingFace connection...');
      const res = await aiTestConnection({ provider: 'huggingface' });
      if (res.success) {
        setStatus('HuggingFace connection successful!');
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { message: 'HuggingFace embeddings connected successfully!', type: 'success' }
        }));
      } else {
        setStatus(`HuggingFace connection failed: ${res.error}`);
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { message: `HuggingFace connection failed: ${res.error}`, type: 'error' }
        }));
      }
    } catch (err) {
      setStatus(`HuggingFace test failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = async () => {
    if (!window.confirm('Are you sure you want to clear all learned patterns, cache, and interaction histories?')) {
      return;
    }
    try {
      setLoading(true);
      const res = await aiClearData();
      if (res.success) {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { message: 'AI local data cleared successfully.', type: 'success' }
        }));
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { message: `Failed to clear data: ${res.error}`, type: 'error' }
        }));
      }
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: `Error clearing data: ${err.message}`, type: 'error' }
      }));
    } finally {
      setLoading(false);
    }
  };

  const handlePreferenceChange = (key, val) => {
    setPreferences((prev) => ({ ...prev, [key]: val }));
  };

  const getCapabilityWarnings = () => {
    const warnings = [];
    if (!selectedProvider) return warnings;
    const selectedProv = providers.find((p) => p.id === selectedProvider);
    if (!selectedProv) return warnings;

    if (!selectedProv.capabilities.embeddings) {
      warnings.push({
        title: 'Semantic search unavailable',
        message: `${selectedProv.name} doesn't support embeddings. Use Gemini or configure HuggingFace separately.`
      });
    }
    if (!selectedProv.capabilities.semanticSearch) {
      warnings.push({
        title: 'Relationship discovery disabled',
        message: `${selectedProv.name} cannot discover semantic relationships. Workspace clustering unavailable.`
      });
    }
    return warnings;
  };

  const isAIEnabled = preferences.aiEnabled !== false;

  return (
    <div className="ai-settings-inner-wrap">
        {status ? (
          <div className={`ai-settings-status ${testResult?.success ? 'success' : testResult?.success === false ? 'error' : 'info'}`}>
            {status}
          </div>
        ) : null}

        {/* AI Master Switch */}
        <div className="ai-settings-master-switch-card" style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          borderRadius: "8px",
          border: "1px solid var(--border-soft)",
          background: "var(--background-soft)",
          marginBottom: "16px"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontWeight: "700", color: "var(--text-strong)", fontSize: "14px" }}>
              Enable AI Subsystem
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              Toggle the global switch to enable or disable all background AI services, embeddings, and chat.
            </span>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={isAIEnabled}
              onChange={async (e) => {
                const checked = e.target.checked;
                const nextPrefs = { ...preferences, aiEnabled: checked };
                setPreferences(nextPrefs);
                try {
                  if (checked) {
                    await aiEnable();
                  } else {
                    await aiDisable();
                  }
                  await aiSetPreferences(nextPrefs);
                  window.dispatchEvent(new CustomEvent('app:toast', {
                    detail: { message: `AI Subsystem ${checked ? 'enabled' : 'disabled'}.`, type: 'success' }
                  }));
                } catch (err) {
                  window.dispatchEvent(new CustomEvent('app:toast', {
                    detail: { message: `Failed to toggle AI: ${err.message}`, type: 'error' }
                  }));
                }
              }}
              style={{ width: "20px", height: "20px", cursor: "pointer" }}
            />
          </label>
        </div>

        <div style={{ opacity: isAIEnabled ? 1 : 0.5, pointerEvents: isAIEnabled ? "auto" : "none", transition: "opacity var(--motion-standard)" }}>
        <div className="ai-subtabs-nav" role="tablist" style={{ display: "flex", gap: "16px", marginBottom: "16px", borderBottom: "1px solid var(--border-soft)", paddingBottom: "8px" }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === "providers"}
            className={`ai-subtab-btn ${activeSubTab === "providers" ? "active" : ""}`}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeSubTab === "providers" ? "2px solid var(--accent-solid)" : "2px solid transparent",
              color: activeSubTab === "providers" ? "var(--text-strong)" : "var(--text-muted)",
              padding: "4px 8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.85rem"
            }}
            onClick={() => setActiveSubTab("providers")}
          >
            Connection & Providers
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === "embeddings"}
            className={`ai-subtab-btn ${activeSubTab === "embeddings" ? "active" : ""}`}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeSubTab === "embeddings" ? "2px solid var(--accent-solid)" : "2px solid transparent",
              color: activeSubTab === "embeddings" ? "var(--text-strong)" : "var(--text-muted)",
              padding: "4px 8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.85rem"
            }}
            onClick={() => setActiveSubTab("embeddings")}
          >
            Embeddings Engine
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === "graph"}
            className={`ai-subtab-btn ${activeSubTab === "graph" ? "active" : ""}`}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeSubTab === "graph" ? "2px solid var(--accent-solid)" : "2px solid transparent",
              color: activeSubTab === "graph" ? "var(--text-strong)" : "var(--text-muted)",
              padding: "4px 8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.85rem"
            }}
            onClick={() => setActiveSubTab("graph")}
          >
            Knowledge Graph
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === "behavior"}
            className={`ai-subtab-btn ${activeSubTab === "behavior" ? "active" : ""}`}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeSubTab === "behavior" ? "2px solid var(--accent-solid)" : "2px solid transparent",
              color: activeSubTab === "behavior" ? "var(--text-strong)" : "var(--text-muted)",
              padding: "4px 8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.85rem"
            }}
            onClick={() => setActiveSubTab("behavior")}
          >
            Behavior & Tuning
          </button>
        </div>

        <div className="ai-settings-content">
          {activeSubTab === "providers" && (
            <>
              <section className="ai-settings-section ai-settings-setup-card">
                <div className="ai-settings-setup-head" style={{ marginBottom: "6px" }}>
                  <h3>Providers Setup</h3>
                </div>

                <div className="preference-group compact" style={{ marginBottom: "8px" }}>
                  <label htmlFor="active-provider-select" style={{ fontSize: "11px" }}>Active Text Provider</label>
                  <div style={{ display: "flex", gap: "5px", alignItems: "center", marginTop: "2px" }}>
                    <AppSelect
                      id="active-provider-select"
                      value={selectedProvider || 'gemini'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedProvider(val);
                        setPreferences((prev) => ({ ...prev, aiProvider: val }));
                      }}
                      disabled={loading}
                      style={{ flex: 1 }}
                    >
                      {providers.filter(p => p.available).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </AppSelect>
                    <button
                      className="btn btn-primary"
                      onClick={async () => {
                        try {
                          setLoading(true);
                          const updatedPrefs = { ...preferences, aiProvider: selectedProvider };
                          setPreferences(updatedPrefs);
                          const response = await aiSetPreferences(updatedPrefs);
                          if (response.success) {
                            window.dispatchEvent(new CustomEvent('app:toast', {
                              detail: { message: `Active provider set to ${selectedProvider} and saved.`, type: 'success' }
                            }));
                          } else {
                            window.dispatchEvent(new CustomEvent('app:toast', {
                              detail: { message: `Failed to save active provider: ${response.error}`, type: 'error' }
                            }));
                          }
                        } catch (err) {
                          window.dispatchEvent(new CustomEvent('app:toast', {
                            detail: { message: `Error: ${err.message}`, type: 'error' }
                          }));
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading || !selectedProvider}
                      type="button"
                    >
                      <Save size={12} /> Save
                    </button>
                  </div>
                </div>

                {selectedProvider === 'local' ? (
                  <div style={{ padding: "8px 10px", background: "var(--surface-muted)", borderRadius: "6px", border: "1px solid var(--border-soft)", marginBottom: "8px" }}>
                    <h4 style={{ fontSize: "11px", fontWeight: "600", margin: "0 0 4px 0" }}>Local Model Status (Qwen GGUF)</h4>
                    {modelStatus.downloaded ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--status-success-text)", fontSize: "11px" }}>
                        <Database size={12} />
                        <span>Qwen2.5-0.5B model is downloaded and ready offline.</span>
                      </div>
                    ) : modelStatus.isDownloading ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
                          <span>Downloading local weights...</span>
                          <span>{modelStatus.progress}%</span>
                        </div>
                        <div style={{ width: "100%", height: "4px", background: "var(--border-soft)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ width: `${modelStatus.progress}%`, height: "100%", background: "var(--accent-solid)" }}></div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Qwen model not found. Click the button below or go to Knowledge Graph tab to download.</span>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={async () => {
                            try {
                              const { aiDownloadGraphModel } = await import('../services/electronService');
                              const res = await aiDownloadGraphModel();
                              if (res.success) {
                                setModelStatus(prev => ({ ...prev, isDownloading: true, progress: 0 }));
                              }
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          style={{ display: "flex", gap: "6px", alignItems: "center", padding: "6px 12px", width: "fit-content" }}
                        >
                          <Download size={12} />
                          <span>Download local model (400MB)</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="api-key-group compact" style={{ marginBottom: "8px" }}>
                    <label htmlFor="api-key" style={{ fontSize: "11px" }}>
                      {selectedProvider ? (selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)) : 'API'} Key
                    </label>
                    <div className="api-key-combined-row" style={{ marginTop: "2px" }}>
                      <div className="api-key-input-wrapper" style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
                        <AppInput
                          id="api-key"
                          type={showPlaintext ? "text" : "password"}
                          className="api-key-input"
                          placeholder="Enter API Key"
                          value={showPlaintext ? plaintextKey : apiKey}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (showPlaintext) {
                              setPlaintextKey(val);
                            } else {
                              setApiKey(val);
                              setPlaintextKey(val);
                            }
                          }}
                          disabled={loading}
                          style={{ paddingRight: "26px", width: "100%" }}
                        />
                        <button
                          className="api-key-toggle-eye"
                          onClick={() => setShowPlaintext(!showPlaintext)}
                          type="button"
                          title={showPlaintext ? "Hide Key" : "Show Key"}
                          style={{
                            position: "absolute",
                            right: "6px",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--text-muted)",
                            padding: "4px",
                            outline: "none"
                          }}
                        >
                          {showPlaintext ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      {(() => {
                        const providerEntry = providers.find((p) => p.id === selectedProvider);
                        const providerModels = normalizeProviderModels(providerEntry?.models);
                        if (!providerModels.length) return null;
                        return (
                          <AppSelect
                            id="provider-model"
                            className="provider-model-select"
                            value={selectedModel}
                            onChange={async (e) => {
                              const model = e.target.value;
                              setSelectedModel(model);
                              await aiSetProviderModel(selectedProvider, model);
                            }}
                            disabled={loading}
                          >
                            {providerModels.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.note ? `${m.label} — ${m.note}` : m.label}
                              </option>
                            ))}
                          </AppSelect>
                        );
                      })()}
                      <button
                        className="btn btn-primary"
                        onClick={handleSaveAPIKey}
                        disabled={loading || !(showPlaintext ? plaintextKey : apiKey)}
                        type="button"
                      >
                        <Save size={12} /> Save
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={handleTestConnection}
                        disabled={loading || !(showPlaintext ? plaintextKey : apiKey)}
                        type="button"
                      >
                        <Zap size={12} /> Test
                      </button>
                    </div>
                  </div>
                )}

                {getCapabilityWarnings().length > 0 && (
                  <div className="ai-settings-capability-warnings" style={{ marginTop: "4px", marginBottom: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
                    {getCapabilityWarnings().map((warning, idx) => (
                      <div key={idx} style={{ display: "flex", gap: "6px", background: "var(--status-warning-bg)", border: "1px solid var(--status-warning-border)", borderRadius: "4px", padding: "6px" }}>
                        <AlertCircle size={12} style={{ color: "var(--text-warning)" }} />
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: "10px", fontWeight: "600", color: "var(--text-strong)" }}>{warning.title}</span>
                          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{warning.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {activeSubTab === "embeddings" && (
            <section className="ai-settings-section ai-settings-setup-card">
              <div className="ai-settings-setup-head" style={{ marginBottom: "6px" }}>
                <h3>Embeddings Setup</h3>
              </div>

              <div className="preference-group compact" style={{ marginBottom: "8px" }}>
                <label htmlFor="embedding-provider-select" style={{ fontSize: "11px" }}>Active Embedding Provider</label>
                <div style={{ display: "flex", gap: "5px", alignItems: "center", marginTop: "2px" }}>
                  <AppSelect
                    id="embedding-provider-select"
                    value={preferences.embeddingProvider || 'internal'}
                    onChange={(e) => handlePreferenceChange('embeddingProvider', e.target.value)}
                    disabled={loading}
                    style={{ flex: 1 }}
                  >
                    <option value="internal">Local Model (BGE ONNX)</option>
                    <option value="huggingface">HuggingFace Inference API</option>
                  </AppSelect>
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      try {
                        setLoading(true);
                        const response = await aiSetPreferences({
                          ...preferences,
                          embeddingProvider: preferences.embeddingProvider
                        });
                        if (response.success) {
                          window.dispatchEvent(new CustomEvent('app:toast', {
                            detail: { message: `Active embedding provider set to ${preferences.embeddingProvider === 'internal' ? 'Local Model' : 'HuggingFace'} and saved.`, type: 'success' }
                          }));
                        } else {
                          window.dispatchEvent(new CustomEvent('app:toast', {
                            detail: { message: `Failed to save embedding provider: ${response.error}`, type: 'error' }
                          }));
                        }
                      } catch (err) {
                        window.dispatchEvent(new CustomEvent('app:toast', {
                          detail: { message: `Error: ${err.message}`, type: 'error' }
                        }));
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    type="button"
                  >
                    <Save size={12} /> Save
                  </button>
                </div>
              </div>

              {preferences.embeddingProvider === 'huggingface' && (
                <div className="api-key-group compact" style={{ background: "var(--surface-muted)", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--border-soft)", marginTop: "6px" }}>
                  <p className="ai-settings-embeddings-info" style={{ margin: "0 0 6px 0", fontSize: "10px", color: "var(--text-secondary)" }}>
                    Uses HuggingFace Inference API free tier. Get a token at huggingface.co.
                  </p>
                  <label htmlFor="hf-token" style={{ fontSize: "10px" }}>HuggingFace Token (hf_…)</label>
                  <div className="api-key-input-group" style={{ display: "flex", gap: "5px", width: "100%", marginTop: "2px" }}>
                    <div className="api-key-input-wrapper" style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
                      <AppInput
                        id="hf-token"
                        type={showHfPlaintext ? "text" : "password"}
                        className="api-key-input"
                        placeholder="hf_xxxxxxxxxxxxxxxxxx"
                        value={showHfPlaintext ? hfPlaintextToken : hfToken}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (showHfPlaintext) {
                            setHfPlaintextToken(val);
                          } else {
                            setHfToken(val);
                            setHfPlaintextToken(val);
                          }
                        }}
                        disabled={loading}
                        style={{ paddingRight: "26px", width: "100%" }}
                      />
                      <button
                        className="api-key-toggle-eye"
                        onClick={() => setShowHfPlaintext(!showHfPlaintext)}
                        type="button"
                        title={showHfPlaintext ? "Hide Token" : "Show Token"}
                        style={{
                          position: "absolute",
                          right: "6px",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--text-muted)",
                          padding: "4px",
                          outline: "none"
                        }}
                      >
                        {showHfPlaintext ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveHfToken}
                      disabled={loading || !(showHfPlaintext ? hfPlaintextToken : hfToken)}
                      type="button"
                    >
                      <Save size={12} /> Save
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={handleTestHfConnection}
                      disabled={loading || !hfConfigured}
                      type="button"
                    >
                      <Zap size={12} /> Test
                    </button>
                  </div>
                </div>
              )}

              {((preferences.embeddingProvider || 'internal') === 'internal' || !modelStatus.downloaded) && (
                <div style={{ padding: "8px 10px", background: "var(--surface-muted)", borderRadius: "6px", border: "1px solid var(--border-soft)", marginTop: "6px" }}>
                  <h4 style={{ fontSize: "11px", fontWeight: "600", margin: "0 0 4px 0" }}>Local Model Status (BGE ONNX)</h4>
                  {modelStatus.downloaded ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--status-success-text)", fontSize: "11px" }}>
                      <Database size={12} />
                      <span>bge-small-en-v1.5 model is downloaded and ready offline.</span>
                    </div>
                  ) : modelStatus.isDownloading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
                        <span>Downloading local weights...</span>
                        <span>{modelStatus.progress}%</span>
                      </div>
                      <div style={{ width: "100%", height: "4px", background: "var(--border-soft)", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ width: `${modelStatus.progress}%`, height: "100%", background: "var(--accent-solid)" }}></div>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        try {
                          const res = await aiDownloadModel();
                          if (res.success) {
                            setModelStatus(prev => ({ ...prev, isDownloading: true, progress: 0 }));
                          }
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      style={{ display: "flex", gap: "6px", alignItems: "center", padding: "6px 12px" }}
                    >
                      <Download size={12} />
                      <span>Download local model (130MB)</span>
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {activeSubTab === "graph" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <KnowledgeGraphSettings />
            </div>
          )}

          {activeSubTab === "behavior" && (
            <>
              <section className="ai-settings-section ai-settings-features-card" style={{ gridColumn: "1 / -1" }}>
                <h3>Features</h3>
                <div className="ai-settings-option-list">
                  <label className="preference-checkbox ai-settings-option-row">
                    <input
                      type="checkbox"
                      checked={preferences.enablePatternLearning}
                      onChange={(e) => handlePreferenceChange('enablePatternLearning', e.target.checked)}
                      disabled={loading}
                    />
                    <span>Learn user patterns</span>
                  </label>
                  <label className="preference-checkbox ai-settings-option-row">
                    <input
                      type="checkbox"
                      checked={preferences.enableEmbeddings}
                      onChange={(e) => handlePreferenceChange('enableEmbeddings', e.target.checked)}
                      disabled={loading}
                    />
                    <span>Generate embeddings</span>
                  </label>
                  <label className="preference-checkbox ai-settings-option-row">
                    <input
                      type="checkbox"
                      checked={preferences.enableRelationshipDiscovery}
                      onChange={(e) => handlePreferenceChange('enableRelationshipDiscovery', e.target.checked)}
                      disabled={loading}
                    />
                    <span>Discover relationships</span>
                  </label>
                </div>
              </section>

              <section className="ai-settings-section ai-settings-generation-card" style={{ gridColumn: "1 / -1" }}>
                <h3>Generation</h3>
                <div className="ai-settings-range-row">
                  <div className="ai-settings-range-label">
                    <span>Context Token Budget (max tokens)</span>
                    <strong>{preferences.maxTokensPerQuery}</strong>
                  </div>
                  <AppInput
                    type="range"
                    min="512"
                    max="8192"
                    step="256"
                    value={preferences.maxTokensPerQuery}
                    onChange={(e) => handlePreferenceChange('maxTokensPerQuery', parseInt(e.target.value, 10))}
                    disabled={loading}
                    className="slider"
                  />
                </div>
                <div className="ai-settings-range-row">
                  <div className="ai-settings-range-label">
                    <span>Temperature</span>
                    <strong>{preferences.temperature.toFixed(2)}</strong>
                  </div>
                  <AppInput
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={preferences.temperature}
                    onChange={(e) => handlePreferenceChange('temperature', parseFloat(e.target.value))}
                    disabled={loading}
                    className="slider"
                  />
                </div>
                <div className="ai-settings-inline-actions compact">
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      setLoading(true);
                      await aiSetPreferences(preferences);
                      setLoading(false);
                      window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: 'Preferences saved.', type: 'success' } }));
                    }}
                    disabled={loading}
                    type="button"
                  >
                    <Save size={12} /> Save
                  </button>
                </div>
              </section>

              <section className="ai-settings-section ai-settings-storage-card" style={{ gridColumn: "1 / -1" }}>
                <div className="ai-settings-storage-meta">
                  <div className="ai-settings-meta-pill">Local only</div>
                  <div className="ai-settings-meta-pill">SQLite memory</div>
                </div>
                <div className="data-management compact">
                  <div className="ai-settings-storage-copy">
                    <strong>Data paths</strong>
                    <span><code>.notes-app/ai-memory.db</code></span>
                    <span><code>%APPDATA%/Notely/ai-config.json</code></span>
                  </div>
                  <button
                    className="btn btn-danger"
                    onClick={handleClearData}
                    disabled={loading}
                    type="button"
                  >
                    <Trash2 size={12} /> Clear AI data
                  </button>
                </div>
              </section>
            </>
          )}
      </div>
      </div>
    </div>
  );
};

export default function AISettings({ open, onClose }) {
  return (
    <OverlayDialog open={open} onClose={onClose} title="AI Settings">
      <AISettingsContent _onClose={onClose} />
    </OverlayDialog>
  );
}
