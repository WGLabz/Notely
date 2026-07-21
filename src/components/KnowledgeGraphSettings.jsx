import React, { useEffect, useState } from 'react';
import { Database, Download, AlertCircle, Save } from 'lucide-react';
import AppSelect from './AppSelect';
import {
  aiGetGraphModelStatus,
  aiDownloadGraphModel,
  onGraphModelDownloadProgress,
  aiGetPreferences,
  aiSetPreferences
} from '../services/electronService';

export default function KnowledgeGraphSettings() {
  const [loading, setLoading] = useState(false);
  const [preferences, setPreferences] = useState({ graphProvider: 'text-provider' });
  const [modelStatus, setModelStatus] = useState({ downloaded: false, isDownloading: false, progress: 0 });

  useEffect(() => {
    const loadStatusAndPrefs = async () => {
      try {
        const statusRes = await aiGetGraphModelStatus();
        if (statusRes.success && statusRes.data) {
          setModelStatus(statusRes.data);
        }

        const prefsRes = await aiGetPreferences();
        if (prefsRes.success && prefsRes.data) {
          setPreferences(prev => ({ ...prev, ...prefsRes.data }));
        }
      } catch (err) {
        console.error('Failed to load graph model status / preferences', err);
      }
    };

    loadStatusAndPrefs();

    const unsubscribe = onGraphModelDownloadProgress((payload) => {
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

  const handleProviderSave = async () => {
    try {
      setLoading(true);
      await aiSetPreferences({
        ...preferences,
        graphProvider: preferences.graphProvider
      });
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: `Graph extraction provider set to ${preferences.graphProvider === 'local' ? 'Local Model' : 'Text Provider'} and saved.`, type: 'success' }
      }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: `Failed to save provider: ${err.message}`, type: 'error' }
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadModel = async () => {
    try {
      setLoading(true);
      const res = await aiDownloadGraphModel();
      if (res.success) {
        setModelStatus(prev => ({ ...prev, isDownloading: true, progress: 0 }));
      }
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: `Failed to start download: ${err.message}`, type: 'error' }
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      <section className="ai-settings-section ai-settings-setup-card" style={{ gridColumn: "1 / -1", margin: 0 }}>
        <div className="ai-settings-setup-head" style={{ marginBottom: "6px" }}>
          <h3>Knowledge Graph Engine</h3>
        </div>

        <div className="preference-group compact" style={{ marginBottom: "8px" }}>
          <label htmlFor="graph-provider-select" style={{ fontSize: "11px" }}>Active Extraction Provider</label>
          <div style={{ display: "flex", gap: "5px", alignItems: "center", marginTop: "2px" }}>
            <AppSelect
              id="graph-provider-select"
              value={preferences.graphProvider || 'text-provider'}
              onChange={(e) => setPreferences(prev => ({ ...prev, graphProvider: e.target.value }))}
              disabled={loading}
              style={{ flex: 1 }}
            >
              <option value="text-provider">Text Provider (Uses configured cloud LLM)</option>
              <option value="local">Local Model (Qwen2.5-0.5B)</option>
            </AppSelect>
            <button
              className="btn btn-primary"
              onClick={handleProviderSave}
              disabled={loading}
              type="button"
            >
              <Save size={12} /> Save
            </button>
          </div>
        </div>

        {preferences.graphProvider === 'local' && (
          <div style={{ padding: "10px", background: "var(--surface-muted)", borderRadius: "6px", border: "1px solid var(--border-soft)", marginTop: "6px" }}>
            <h4 style={{ fontSize: "11px", fontWeight: "600", margin: "0 0 6px 0" }}>Local Model Status (Qwen GGUF)</h4>
            {modelStatus.downloaded ? (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--status-success-text)", fontSize: "11px" }}>
                <Database size={12} />
                <span>Qwen2.5-0.5B model is downloaded and ready offline. (Shared with local text provider)</span>
              </div>
            ) : modelStatus.isDownloading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
                  <span>Downloading local weights (~400MB)...</span>
                  <span>{modelStatus.progress}%</span>
                </div>
                <div style={{ width: "100%", height: "4px", background: "var(--border-soft)", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ width: `${modelStatus.progress}%`, height: "100%", background: "var(--accent-solid)" }}></div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "11px" }}>
                  <AlertCircle size={12} />
                  <span>Qwen model is not downloaded.</span>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleDownloadModel}
                  disabled={loading}
                  style={{ display: "flex", gap: "6px", alignItems: "center", padding: "6px 12px", width: "fit-content" }}
                >
                  <Download size={12} />
                  <span>Download Qwen2.5-0.5B (400MB)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
