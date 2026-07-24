import React, { useEffect, useState } from 'react';
import { Database, Download, AlertCircle, Save, Trash2, Cpu, Sliders } from 'lucide-react';
import AppSelect from './AppSelect';
import {
  aiGetGraphModelStatus,
  aiDownloadGraphModel,
  aiDeleteGraphModel,
  onGraphModelDownloadProgress,
  aiGetPreferences,
  aiSetPreferences
} from '../services/electronService';

export default function KnowledgeGraphSettings() {
  const [loading, setLoading] = useState(false);
  const [preferences, setPreferences] = useState({ graphProvider: 'gliner-glirel', graphConfidence: 0.60 });
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

  const handlePreferencesSave = async () => {
    try {
      setLoading(true);
      await aiSetPreferences({
        ...preferences,
        graphProvider: preferences.graphProvider,
        graphConfidence: preferences.graphConfidence
      });
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: `Knowledge Graph preferences saved successfully.`, type: 'success' }
      }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: `Failed to save preferences: ${err.message}`, type: 'error' }
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

  const handleDeleteModel = async () => {
    if (!window.confirm('Delete local GLiNER and GLiREL ONNX model weights from disk? You can redownload anytime.')) return;
    try {
      setLoading(true);
      await aiDeleteGraphModel();
      setModelStatus({ downloaded: false, isDownloading: false, progress: 0 });
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: 'Local GLiNER & GLiREL ONNX model weights deleted successfully.', type: 'info' }
      }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: `Failed to delete model: ${err.message}`, type: 'error' }
      }));
    } finally {
      setLoading(false);
    }
  };

  const activeProvider = (preferences.graphProvider === 'text-provider') ? 'text-provider' : 'gliner-glirel';

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      <section className="ai-settings-section ai-settings-setup-card" style={{ gridColumn: "1 / -1", margin: 0 }}>
        <div className="ai-settings-setup-head" style={{ marginBottom: "6px" }}>
          <h3>Knowledge Graph Engine</h3>
        </div>

        <div className="preference-group compact" style={{ marginBottom: "12px" }}>
          <label htmlFor="graph-provider-select" style={{ fontSize: "11px" }}>Active Extraction Engine</label>
          <div style={{ display: "flex", gap: "5px", alignItems: "center", marginTop: "2px" }}>
            <AppSelect
              id="graph-provider-select"
              value={activeProvider}
              onChange={async (e) => {
                const newProvider = e.target.value;
                const updated = { ...preferences, graphProvider: newProvider };
                setPreferences(updated);
                await aiSetPreferences(updated);
                window.dispatchEvent(new CustomEvent('app:toast', {
                  detail: { message: `Graph extraction engine set to ${newProvider === 'gliner-glirel' ? 'GLiNER + GLiREL Model-Driven Pipeline' : 'Cloud AI Provider'}.`, type: 'success' }
                }));
              }}
              disabled={loading}
              style={{ flex: 1 }}
            >
              <option value="gliner-glirel">GLiNER + GLiREL Model-Driven Pipeline (Zero-Shot ONNX - Recommended)</option>
              <option value="text-provider">Cloud LLM Text Provider (Configured Cloud AI)</option>
            </AppSelect>
            <button
              className="btn btn-primary"
              onClick={handlePreferencesSave}
              disabled={loading}
              type="button"
            >
              <Save size={12} /> Save
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginTop: '10px', paddingBottom: '6px', borderBottom: '1px solid var(--border-soft)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Active Extraction Engine</span>
            <strong style={{ color: 'var(--text-strong)' }}>
              {activeProvider === 'gliner-glirel' ? 'GLiNER Zero-Shot NER + GLiREL Zero-Shot RE ONNX' : 'Cloud LLM Text Provider'}
            </strong>
          </div>
        </div>

        <div className="preference-group compact" style={{ marginBottom: "12px" }}>
          <label htmlFor="graph-confidence-slider" style={{ fontSize: "11px", display: "flex", justifyContent: "space-between" }}>
            <span>Extraction Confidence Threshold</span>
            <strong>{Math.round((preferences.graphConfidence || 0.60) * 100)}%</strong>
          </label>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "4px" }}>
            <Sliders size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              id="graph-confidence-slider"
              type="range"
              min="0.30"
              max="0.95"
              step="0.05"
              value={preferences.graphConfidence || 0.60}
              onChange={(e) => setPreferences({ ...preferences, graphConfidence: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
          </div>
        </div>

        {activeProvider === 'gliner-glirel' && (
          <div style={{ padding: "12px", background: "var(--surface-muted)", borderRadius: "6px", border: "1px solid var(--border-soft)", marginTop: "6px" }}>
            <h4 style={{ fontSize: "12px", fontWeight: "600", margin: "0 0 8px 0", display: "flex", alignItems: "center", gap: "6px" }}>
              <Cpu size={14} /> Offline Model Status (GLiNER + GLiREL ONNX)
            </h4>
            {modelStatus.downloaded ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--status-success-text)", fontSize: "11px" }}>
                  <Database size={12} />
                  <span>GLiNER Zero-Shot NER & GLiREL Zero-Shot RE ONNX weights downloaded and ready offline.</span>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleDeleteModel}
                  disabled={loading}
                  style={{ display: "flex", gap: "4px", alignItems: "center", padding: "4px 8px", fontSize: "10px", color: "var(--text-danger)" }}
                  title="Remove model weights from disk to free space or redownload"
                >
                  <Trash2 size={12} />
                  <span>Delete Models</span>
                </button>
              </div>
            ) : modelStatus.isDownloading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span>Downloading GLiNER & GLiREL ONNX weights...</span>
                  <span style={{ fontWeight: 600, color: 'var(--brand-primary)' }}>{modelStatus.progress}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--border-soft)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${modelStatus.progress}%`, height: '100%', background: 'var(--accent-solid)', transition: 'width 0.2s ease' }} />
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "11px" }}>
                  <AlertCircle size={12} />
                  <span>GLiNER + GLiREL models not downloaded. (Downloads zero-shot ONNX models for offline knowledge graph extraction)</span>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleDownloadModel}
                  disabled={loading}
                  style={{ display: "flex", gap: "6px", alignItems: "center", padding: "6px 12px", width: "fit-content" }}
                >
                  <Download size={12} />
                  <span>Download GLiNER & GLiREL Models</span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
