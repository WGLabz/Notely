import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import './AISettings.css';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  aiClearData,
  aiGetApiKey,
  aiGetPreferences,
  aiSetApiKey,
  aiSetPreferences,
  aiTestConnection,
} from '../services/electronService';

const providers = [
  { id: 'gemini', name: 'Google Gemini', description: 'Fast, multimodal AI' },
  { id: 'openai', name: 'OpenAI', description: 'Planned provider' },
  { id: 'local', name: 'Local LLM', description: 'Planned provider' }
];

const defaultPreferences = {
  enablePatternLearning: true,
  enableEmbeddings: true,
  enableRelationshipDiscovery: true,
  maxTokensPerQuery: 2048,
  temperature: 0.7
};

const AISettings = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const dialogRef = useFocusTrap(isOpen);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen, selectedProvider]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setTestResult(null);

      const keyResponse = await aiGetApiKey(selectedProvider);
      if (keyResponse.success && keyResponse.data?.apiKey) {
        const key = keyResponse.data.apiKey;
        setApiKey(key.substring(0, 5) + '...' + key.substring(key.length - 5));
      } else {
        setApiKey('');
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
        setTestResult({
          success: false,
          message: `Connection failed: ${response.error}`
        });
        setStatus('Connection test failed.');
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `Error: ${error.message}`
      });
      setStatus('Connection test failed.');
    } finally {
      setLoading(false);
    }
  };

  const handlePreferenceChange = (key, value) => {
    setPreferences((currentPreferences) => ({
      ...currentPreferences,
      [key]: value
    }));
  };

  const handleClearData = async () => {
    if (!window.confirm('Clear all AI cache and pattern data? This cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      const response = await aiClearData();

      if (response.success) {
        setStatus('AI data cleared.');
      } else {
        setStatus(`Failed to clear data: ${response.error}`);
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="overlay-dialog" onClick={onClose} role="dialog" aria-modal="true" aria-label="AI settings">
      <div ref={dialogRef} className="overlay-dialog-card ai-settings-dialog-card" onClick={(event) => event.stopPropagation()}>
        <div className="overlay-dialog-header ai-settings-dialog-header">
          <div className="ai-settings-title-group">
            <h2>AI Settings</h2>
            <p>Provider, preferences, and local AI data.</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close AI settings">
            <X size={16} />
          </button>
        </div>

        {status ? (
          <div className={`ai-settings-status ${testResult?.success ? 'success' : testResult?.success === false ? 'error' : 'info'}`}>
            {status}
          </div>
        ) : null}

        <div className="ai-settings-content">
          <section className="ai-settings-section ai-settings-setup-card">
            <div className="ai-settings-setup-head">
              <h3>Provider Setup</h3>
              <span className="ai-settings-badge">On device</span>
            </div>
            <div className="provider-grid">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  className={`provider-card ${selectedProvider === provider.id ? 'selected' : ''}`}
                  onClick={() => setSelectedProvider(provider.id)}
                  disabled={loading}
                  type="button"
                >
                  <div className="provider-name">{provider.name}</div>
                  <div className="provider-description">{provider.description}</div>
                </button>
              ))}
            </div>
            <div className="api-key-group compact">
              <label htmlFor="api-key">
                {selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)} API Key
              </label>
              <div className="api-key-input-group">
                <input
                  id="api-key"
                  type="password"
                  className="api-key-input"
                  placeholder="Enter your API key"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  disabled={loading}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleSaveAPIKey}
                  disabled={loading || !apiKey}
                  type="button"
                >
                  Save Key
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleTestConnection}
                  disabled={loading || !apiKey}
                  type="button"
                >
                  Test
                </button>
              </div>
            </div>
            {testResult ? (
              <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                {testResult.message}
              </div>
            ) : null}
          </section>

          <section className="ai-settings-section ai-settings-features-card">
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

          <section className="ai-settings-section ai-settings-generation-card">
            <h3>Generation</h3>
            <div className="ai-settings-range-row">
              <div className="ai-settings-range-label">
                <span>Max Tokens</span>
                <strong>{preferences.maxTokensPerQuery}</strong>
              </div>
              <input
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
              <input
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
                Save Preferences
              </button>
            </div>
          </section>

          <section className="ai-settings-section ai-settings-storage-card">
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
                Clear AI Data
              </button>
            </div>
          </section>
        </div>

        <div className="ai-settings-footer">
          <button className="btn btn-secondary" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AISettings;
