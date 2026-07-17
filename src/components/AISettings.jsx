import React, { useEffect, useState } from 'react';
import { Key, Save, Trash2, X, Zap, AlertCircle } from 'lucide-react';
import AppInput from './AppInput';
import AppIconButton from './AppIconButton';
import AppSelect from './AppSelect';
import "../styles/AISettings.css";
import OverlayDialog from './OverlayDialog';
import {
  aiClearData,
  aiGetApiKey,
  aiGetPreferences,
  aiGetProviderModel,
  aiSetApiKey,
  aiSetPreferences,
  aiSetProviderModel,
  aiTestConnection,
  getSemanticGraph,
} from '../services/electronService';

const providers = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Fast, free tier available',
    available: true,
    models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    defaultModel: 'gemini-1.5-pro',
    capabilities: {
      textGeneration: true,
      embeddings: true,
      semanticSearch: true,
      relationshipDiscovery: true,
      patternDetection: true,
    }
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Very fast open-source models',
    available: true,
    models: ['mixtral-8x7b-32768', 'llama-3-70b-8192'],
    defaultModel: 'mixtral-8x7b-32768',
    capabilities: {
      textGeneration: true,
      embeddings: false,
      semanticSearch: false,
      relationshipDiscovery: false,
      patternDetection: true,
    }
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Most capable models',
    available: false,
    models: [],
    defaultModel: '',
    capabilities: {
      textGeneration: true,
      embeddings: true,
      semanticSearch: true,
      relationshipDiscovery: true,
      patternDetection: true,
    }
  },
  {
    id: 'local',
    name: 'Local LLM',
    description: 'Planned provider',
    available: false,
    models: [],
    defaultModel: '',
    capabilities: {
      textGeneration: true,
      embeddings: false,
      semanticSearch: false,
      relationshipDiscovery: false,
      patternDetection: false,
    }
  },
];

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

export const AISettingsContent = ({ onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [hfToken, setHfToken] = useState('');
  const [hfConfigured, setHfConfigured] = useState(false);
  const [hfTestResult, setHfTestResult] = useState(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [embeddingStaleness, setEmbeddingStaleness] = useState(null);
  const [showAdvancedGeneration, setShowAdvancedGeneration] = useState(true);
  const [showDataControls, setShowDataControls] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState("providers");

  useEffect(() => {
    loadSettings();
    loadEmbeddingStaleness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setTestResult(null);
      setHfTestResult(null);

      const keyResponse = await aiGetApiKey(selectedProvider);
      if (keyResponse.success && keyResponse.data?.configured) {
        setApiKey(String(keyResponse.data?.maskedKey || 'configured'));
      } else {
        setApiKey('');
      }

      const modelResponse = await aiGetProviderModel(selectedProvider);
      const providerEntry = providers.find((p) => p.id === selectedProvider);
      const providerModels = normalizeProviderModels(providerEntry?.models);
      setSelectedModel(
        (modelResponse?.success && modelResponse?.data?.model) ||
        providerEntry?.defaultModel ||
        providerModels[0]?.id ||
        ''
      );

      const hfResponse = await aiGetApiKey('huggingface');
      if (hfResponse.success && hfResponse.data?.configured) {
        setHfToken(String(hfResponse.data?.maskedKey || 'configured'));
        setHfConfigured(true);
      } else {
        setHfToken('');
        setHfConfigured(false);
      }

      const prefsResponse = await aiGetPreferences();
      if (prefsResponse.success && prefsResponse.data) {
        setPreferences({ ...defaultPreferences, ...prefsResponse.data });
      }

      setStatus('');
    } catch (error) {
      setStatus(`Error loading settings: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadEmbeddingStaleness = async () => {
    try {
      const data = await getSemanticGraph();
      setEmbeddingStaleness(data?.staleness || null);
    } catch {
      // Semantic graph can be unavailable when embeddings are not configured.
      setEmbeddingStaleness(null);
    }
  };

  const handleSaveAPIKey = async () => {
    if (!apiKey || apiKey.includes('...')) {
      setStatus('Please enter a complete API key.');
      return;
    }

    try {
      setLoading(true);
      const response = await aiSetApiKey(selectedProvider, apiKey);

      if (response.success) {
        setStatus(`${selectedProvider} API key saved.`);
        setApiKey(apiKey.substring(0, 5) + '...' + apiKey.substring(apiKey.length - 5));
      } else {
        setStatus(`Failed to save key: ${response.error}`);
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    try {
      setLoading(true);
      const response = await aiSetPreferences(preferences);

      if (response.success) {
        setStatus('Preferences saved.');
      } else {
        setStatus(`Failed to save preferences: ${response.error}`);
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveHfToken = async () => {
    if (!hfToken || hfToken.includes('...')) {
      setStatus('Please enter a complete HuggingFace token.');
      return;
    }
    try {
      setLoading(true);
      const response = await aiSetApiKey('huggingface', hfToken);
      if (response.success) {
        setHfConfigured(true);
        setHfToken(hfToken.substring(0, 5) + '...' + hfToken.substring(hfToken.length - 4));
        setStatus('HuggingFace token saved.');
      } else {
        setStatus(`Failed to save token: ${response.error}`);
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestHfConnection = async () => {
    try {
      setLoading(true);
      setHfTestResult(null);
      const response = await aiTestConnection('huggingface');
      setHfTestResult({
        success: response.success,
        message: response.success ? 'Embeddings connected successfully.' : `Failed: ${response.error}`,
      });
    } catch (error) {
      setHfTestResult({ success: false, message: `Error: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setLoading(true);
      setTestResult(null);

      const response = await aiTestConnection(selectedProvider);
      if (response.success) {
        setTestResult({
          success: true,
          message: `Connected successfully to ${selectedProvider}.`
        });
        setStatus('Connection test passed.');
      } else {
        setTestResult({ success: false, message: response.error || 'Connection failed.' });
      }
    } catch (err) {
      setTestResult({ success: false, message: err?.message || 'Connection failed.' });
    } finally {
      setLoading(false);
    }
  };

  const handlePreferenceChange = (key, value) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearData = async () => {
    try {
      setLoading(true);
      const response = await aiClearData();
      if (response.success) {
        setStatus('AI cached data cleared.');
        loadEmbeddingStaleness();
        setTimeout(() => setStatus(''), 3000);
      } else {
        setStatus(response.error || 'Failed to clear AI data.');
      }
    } catch (err) {
      setStatus(err?.message || 'Failed to clear AI data.');
    } finally {
      setLoading(false);
    }
  };

  const getCapabilityWarnings = () => {
    const selectedProv = providers.find((p) => p.id === selectedProvider);
    if (!selectedProv || !selectedProv.capabilities) return [];

    const warnings = [];
    if (!selectedProv.capabilities.embeddings && preferences.enableEmbeddings) {
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

  return (
    <div className="ai-settings-inner-wrap">
        {status ? (
          <div className={`ai-settings-status ${testResult?.success ? 'success' : testResult?.success === false ? 'error' : 'info'}`}>
            {status}
          </div>
        ) : null}

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
            aria-selected={activeSubTab === "tuning"}
            className={`ai-subtab-btn ${activeSubTab === "tuning" ? "active" : ""}`}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeSubTab === "tuning" ? "2px solid var(--accent-solid)" : "2px solid transparent",
              color: activeSubTab === "tuning" ? "var(--text-strong)" : "var(--text-muted)",
              padding: "4px 8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.85rem"
            }}
            onClick={() => setActiveSubTab("tuning")}
          >
            Tuning & Behavior
          </button>
        </div>

        <div className="ai-settings-content">
          {activeSubTab === "providers" ? (
            <>
              <section className="ai-settings-section ai-settings-embeddings-card">
                <div className="ai-settings-setup-head">
                  <h3>Embeddings</h3>
                  <span className={`ai-settings-badge ${hfConfigured ? 'badge-ok' : 'badge-off'}`}>
                    {hfConfigured ? 'Active' : 'Not configured'}
                  </span>
                </div>
                <p className="ai-settings-embeddings-info">
                  Powers semantic search and the workspace graph — works with any text provider (Groq or Gemini).
                  Uses <strong>HuggingFace Inference API</strong> free tier. Get a token at <strong>huggingface.co</strong>.
                </p>
                <div className="api-key-group compact">
                  <label htmlFor="hf-token">HuggingFace Token (hf_…)</label>
                  <div className="api-key-input-group">
                    <AppInput
                      id="hf-token"
                      type="password"
                      className="api-key-input"
                      placeholder="hf_xxxxxxxxxxxxxxxxxx"
                      value={hfToken}
                      onChange={(e) => setHfToken(e.target.value)}
                      disabled={loading}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveHfToken}
                      disabled={loading || !hfToken}
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
                {hfTestResult ? (
                  <div className={`test-result ${hfTestResult.success ? 'success' : 'error'}`}>
                    {hfTestResult.message}
                  </div>
                ) : null}
              </section>

              <section className="ai-settings-section ai-settings-setup-card">
                <div className="ai-settings-setup-head">
                  <h3>Text Provider</h3>
                  <span className="ai-settings-badge">On device</span>
                </div>
                <div className="provider-grid">
                  {providers.map((provider) => (
                    <button
                      key={provider.id}
                      className={`provider-card ${selectedProvider === provider.id ? 'selected' : ''} ${!provider.available ? 'planned' : ''}`}
                      onClick={() => provider.available && setSelectedProvider(provider.id)}
                      disabled={loading || !provider.available}
                      type="button"
                      data-tooltip={!provider.available ? 'Coming soon' : undefined}
                    >
                      <div className="provider-name">
                        {provider.name}
                        {!provider.available && <span className="provider-planned-badge">Soon</span>}
                      </div>
                      <div className="provider-description">{provider.description}</div>
                    </button>
                  ))}
                </div>
                <div className="api-key-group compact">
                  <label htmlFor="api-key">
                    {selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)} API Key
                  </label>
                  <div className="api-key-combined-row">
                    <AppInput
                      id="api-key"
                      type="password"
                      className="api-key-input"
                      placeholder="Enter your API key"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      disabled={loading}
                    />
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
                      disabled={loading || !apiKey}
                      type="button"
                    >
                      <Key size={12} /> Save
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={handleTestConnection}
                      disabled={loading || !apiKey}
                      type="button"
                    >
                      <Zap size={12} /> Test
                    </button>
                  </div>
                </div>
                {testResult ? (
                  <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                    {testResult.message}
                  </div>
                ) : null}

                {getCapabilityWarnings().length > 0 && (
                  <div className="ai-settings-capability-warnings">
                    {getCapabilityWarnings().map((warning, idx) => (
                      <div key={idx} className="capability-warning">
                        <AlertCircle size={14} />
                        <div>
                          <strong>{warning.title}</strong>
                          <p>{warning.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {embeddingStaleness && (
                  <div className="ai-settings-embedding-staleness">
                    <span>Embeddings: {embeddingStaleness.message}</span>
                  </div>
                )}
              </section>
            </>
          ) : (
            <>
              <section className="ai-settings-section ai-settings-features-card" style={{ gridColumn: "1 / -1" }}>
                <h3>Features</h3>
                <div className="ai-settings-option-list">
                  <label className="preference-checkbox ai-settings-option-row">
                    <input
                      type="checkbox"
                      checked={preferences.enablePatternLearning}
                      onChange={(event) => handlePreferenceChange('enablePatternLearning', event.target.checked)}
                      disabled={loading}
                    />
                    <span>Learn user patterns</span>
                  </label>
                  <label className="preference-checkbox ai-settings-option-row">
                    <input
                      type="checkbox"
                      checked={preferences.enableEmbeddings}
                      onChange={(event) => handlePreferenceChange('enableEmbeddings', event.target.checked)}
                      disabled={loading}
                    />
                    <span>Generate embeddings</span>
                  </label>
                  <label className="preference-checkbox ai-settings-option-row">
                    <input
                      type="checkbox"
                      checked={preferences.enableRelationshipDiscovery}
                      onChange={(event) => handlePreferenceChange('enableRelationshipDiscovery', event.target.checked)}
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
                    <span>Max tokens</span>
                    <strong>{preferences.maxTokensPerQuery}</strong>
                  </div>
                  <AppInput
                    type="range"
                    min="512"
                    max="8192"
                    step="256"
                    value={preferences.maxTokensPerQuery}
                    onChange={(event) => handlePreferenceChange('maxTokensPerQuery', parseInt(event.target.value, 10))}
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
                    onChange={(event) => handlePreferenceChange('temperature', parseFloat(event.target.value))}
                    disabled={loading}
                    className="slider"
                  />
                </div>
                <div className="ai-settings-inline-actions compact">
                  <button
                    className="btn btn-primary"
                    onClick={handleSavePreferences}
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
                  <div className="ai-settings-meta-pill">Private persona</div>
                </div>
                <div className="data-management compact">
                  <div className="ai-settings-storage-copy">
                    <strong>Data paths</strong>
                    <span><code>.notes-app/app.sqlite</code></span>
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
  );
};

export const AISettings = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <OverlayDialog
      open={isOpen}
      onClose={onClose}
      ariaLabel="AI settings"
      cardClassName="ai-settings-dialog-card"
    >
      <div className="overlay-dialog-header ai-settings-dialog-header">
        <div className="ai-settings-title-group">
          <h2>AI Settings</h2>
          <p>Connect providers, tune behavior, and manage local AI data.</p>
        </div>
        <AppIconButton onClick={onClose} aria-label="Close AI settings">
          <X size={16} />
        </AppIconButton>
      </div>

      <AISettingsContent onClose={onClose} />

      <div className="ai-settings-footer">
        <button className="btn btn-secondary" onClick={onClose} type="button">
          <X size={12} /> Close
        </button>
      </div>
    </OverlayDialog>
  );
};

export default AISettings;
