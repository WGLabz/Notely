import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Database,
  Pause,
  Play,
  AlertCircle,
  FileText
} from 'lucide-react';
import {
  aiGetEmbeddingsStatus,
  aiRebuildEmbeddings,
  aiClearEmbeddingsData,
  aiPauseWorker,
  aiResumeWorker,
  aiGetModelStatus,
  aiDownloadModel,
  aiGetLogs,
  onModelDownloadProgress,
  aiGetPreferences
} from '../services/electronService';
import { OverlayDialog } from './OverlayDialog';

import '../styles/KnowledgeGraph.css'; // Reuses base layout rules for unified styling

export default function EmbeddingsPage({ onBack }) {
  const [status, setStatus] = useState({
    totalChunks: 0,
    indexedNotes: 0,
    queueSize: 0,
    queueTotal: 0,
    isPaused: false,
    isWorking: false,
    chunks: [],
    logs: [],
    dbSize: '0 KB'
  });
  const [modelStatus, setModelStatus] = useState({
    downloaded: false,
    isDownloading: false,
    progress: 0
  });
  const [preferences, setPreferences] = useState({
    embeddingProvider: 'internal'
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedChunk, setSelectedChunk] = useState(null);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);

  const loadEmbeddingsStatus = useCallback(async () => {
    try {
      setError('');
      const res = await aiGetEmbeddingsStatus({ search: searchQuery });
      const logsRes = await aiGetLogs('embeddings', 50);

      if (res.success && res.data) {
        if (res.data.uninitialized) {
          setError('AI agent or EmbeddingDB is not initialized. Please configure your active AI provider first under Settings > AI settings.');
        } else {
          const fetchedLogs = (logsRes && logsRes.success && Array.isArray(logsRes.data)) ? logsRes.data : [];
          setStatus({
            ...res.data,
            logs: fetchedLogs.length > 0 ? fetchedLogs : (res.data.logs || [])
          });
          if (isRebuilding && res.data.queueSize === 0) {
            setIsRebuilding(false);
            setShowProgressModal(false);
            window.dispatchEvent(new CustomEvent('app:toast', {
              detail: { message: 'Embeddings DB successfully rebuilt.', type: 'success' }
            }));
          }
        }
      } else {
        setError(res.error || 'Failed to fetch embeddings status.');
      }
    } catch (err) {
      setError(err.message || 'Error occurred fetching status.');
    }
  }, [searchQuery, isRebuilding]);

  const loadModelAndPrefs = useCallback(async () => {
    try {
      const modelRes = await aiGetModelStatus();
      if (modelRes.success && modelRes.data) {
        setModelStatus(modelRes.data);
      }
      const prefsRes = await aiGetPreferences();
      if (prefsRes.success && prefsRes.data) {
        setPreferences(prev => ({ ...prev, ...prefsRes.data }));
      }
    } catch (err) {
      console.error('Failed to load metadata', err);
    }
  }, []);

  useEffect(() => {
    loadEmbeddingsStatus();
    const interval = setInterval(loadEmbeddingsStatus, 1000);
    return () => clearInterval(interval);
  }, [loadEmbeddingsStatus]);

  useEffect(() => {
    loadModelAndPrefs();

    // Listen to model download progress
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
  }, [loadModelAndPrefs]);



  const handlePauseResume = async () => {
    try {
      if (status.isPaused) {
        await aiResumeWorker();
        setStatus(prev => ({ ...prev, isPaused: false }));
      } else {
        await aiPauseWorker();
        setStatus(prev => ({ ...prev, isPaused: true }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRebuild = async () => {
    if (!window.confirm('Are you sure you want to drop all indexed chunks and rebuild everything?')) return;
    try {
      setLoading(true);
      const res = await aiRebuildEmbeddings();
      if (res.success) {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { message: 'Embeddings rebuild triggered.', type: 'success' }
        }));
        setIsRebuilding(true);
        setShowProgressModal(true);
        await loadEmbeddingsStatus();
      } else {
        setError(res.error || 'Failed to clear data');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="knowledge-graph-page">
      {/* Unified topbar navigation breadcrumb */}
      <div className="detail-topbar">
        <nav className="detail-breadcrumb" aria-label="Embeddings location">
          <span className="detail-breadcrumb-part">
            <button className="detail-breadcrumb-link" type="button" onClick={onBack}>Notes</button>
            <span className="detail-breadcrumb-separator" aria-hidden="true">/</span>
          </span>
          <span className="detail-breadcrumb-current">Embeddings Engine</span>
        </nav>
      </div>

      <div className="knowledge-graph-container">
        <div className="kg-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', height: '52px', boxSizing: 'border-box' }}>
          <div className="kg-search-wrapper" style={{ height: '32px' }}>
            <Search size={16} className="kg-search-icon" />
            <input
              type="text"
              className="kg-search-input"
              placeholder="Search note chunk content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ height: '32px', boxSizing: 'border-box' }}
            />
          </div>

          {/* Unified Model & DB Status details pill in header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', background: 'var(--surface-muted)', border: '1px solid var(--border-soft)', padding: '0 12px', borderRadius: '6px', color: 'var(--text-secondary)', marginLeft: 'auto', height: '32px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Provider:</span>
              <strong style={{ color: 'var(--text-strong)' }}>{preferences.embeddingProvider === 'internal' ? 'Local' : 'HuggingFace'}</strong>
            </div>
            <span style={{ width: '1px', height: '10px', background: 'var(--border-soft)' }}></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Model:</span>
              <strong style={{ color: 'var(--text-strong)' }}>{preferences.embeddingProvider === 'internal' ? 'BGE-Small-En-v1.5' : 'bge-small-en'}</strong>
            </div>
            <span style={{ width: '1px', height: '10px', background: 'var(--border-soft)' }}></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>DB Size:</span>
              <strong style={{ color: 'var(--text-strong)' }}>{status.dbSize || '0 KB'}</strong>
            </div>
            <span style={{ width: '1px', height: '10px', background: 'var(--border-soft)' }}></span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: modelStatus.downloaded ? 'var(--status-success-text)' : 'var(--text-warning)' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: modelStatus.downloaded ? 'var(--status-success-border)' : 'var(--text-warning)' }}></span>
              {modelStatus.downloaded ? 'Ready' : 'Missing'}
            </span>
          </div>

          {!modelStatus.downloaded && (
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
              disabled={modelStatus.isDownloading}
              style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', height: '32px', gap: '4px', boxSizing: 'border-box' }}
            >
              <span>{modelStatus.isDownloading ? `Downloading (${modelStatus.progress}%)...` : 'Download Model (~130MB)'}</span>
            </button>
          )}

          <div className="kg-stats-pill" style={{ gap: '12px', display: 'flex', alignItems: 'center', height: '32px', boxSizing: 'border-box', margin: 0, padding: '0 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Database size={12} />
              <span>Chunks: {status.totalChunks} | Indexed Notes: {status.indexedNotes}</span>
            </div>
            {status.queueTotal > 0 && (
              status.queueSize > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="kg-category-badge" style={{ background: 'var(--kg-task-bg)', border: '1px solid var(--kg-task-border)', color: 'var(--kg-task-border)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <RefreshCw size={12} className="spin" />
                    Queue: {status.queueSize} remaining
                  </span>
                  <div style={{ width: '80px', height: '6px', background: 'var(--border-soft)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.max(0, Math.min(100, ((status.queueTotal - status.queueSize) / status.queueTotal) * 100))}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--accent-default) 0%, var(--accent-hover) 100%)',
                      transition: 'width 0.3s ease-out'
                    }} />
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {Math.round(((status.queueTotal - status.queueSize) / status.queueTotal) * 100)}%
                  </span>
                </div>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', background: 'var(--status-success-bg)', border: '1px solid var(--status-success-border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--status-success-text)', fontWeight: 600 }}>
                    ✓ Index Up to Date ({status.queueTotal} notes)
                  </span>
                </div>
              )
            )}
          </div>
        </div>

        <div className="kg-body">
          {/* Settings & Controls Sidebar */}
          <div className="kg-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              
               {/* Index Worker Controls */}
              <div className="kg-sidebar-section" style={{ background: 'var(--surface-elevated)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                <h4 style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>
                  Index Worker
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span className={status.isWorking ? 'spin' : ''} style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: status.isWorking ? 'var(--accent-default)' : status.isPaused ? 'var(--text-muted)' : 'var(--status-success-border)',
                      boxShadow: status.isWorking ? '0 0 8px var(--accent-default)' : status.isPaused ? 'none' : '0 0 8px var(--status-success-border)'
                    }}></span>
                    <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                    <strong style={{ color: 'var(--text-strong)' }}>{status.isWorking ? 'Processing' : status.isPaused ? 'Paused' : 'Idle'}</strong>
                  </div>
                  <button
                    className="kg-details-close"
                    onClick={handlePauseResume}
                    style={{
                      border: '1px solid var(--border-default)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      background: 'var(--surface-bg)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      fontWeight: 500,
                      transition: 'all 0.2s'
                    }}
                  >
                    {status.isPaused ? <Play size={12} /> : <Pause size={12} />}
                    <span>{status.isPaused ? 'Resume' : 'Pause'}</span>
                  </button>
                </div>
              </div>

              {/* Indexing Event Logs (Last 10) */}
              <div className="kg-sidebar-section" style={{ background: 'var(--surface-elevated)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                <h4 style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>
                  Indexing Event Logs
                </h4>
                <div style={{
                  maxHeight: '130px',
                  overflowY: 'auto',
                  background: 'var(--surface-muted)',
                  borderRadius: '6px',
                  padding: '8px',
                  border: '1px solid var(--border-soft)',
                  fontFamily: 'monospace',
                  fontSize: '9px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  {status.logs.length === 0 ? (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No logs available</span>
                  ) : (
                    status.logs.slice(0, 10).map((logItem, idx) => {
                      const timeStr = logItem.timestamp ? new Date(logItem.timestamp).toLocaleTimeString() : (logItem.ts || '');
                      const eventName = String(logItem.level || logItem.event || 'INFO').toUpperCase();
                      const detailText = logItem.message || logItem.detail || '';
                      return (
                        <div key={logItem.id || idx} style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', lineHeight: 1.3 }}>
                          <span style={{ color: 'var(--text-muted)' }}>[{timeStr}]</span>
                          <span style={{ color: eventName === 'ERROR' ? 'var(--text-danger)' : 'var(--accent-solid)', fontWeight: 600 }}>{eventName}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{detailText}</span>
                        </div>
                      );
                    })
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('app:menu-action', { detail: { action: 'open-app-logs' } }))}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-solid)', fontSize: '10px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                  >
                    View Dedicated Log Page →
                  </button>
                </div>
              </div>
            </div>

            {/* Sticky Actions */}
            <div className="kg-sidebar-section" style={{ borderTop: '1px solid var(--border-default)', padding: '16px', background: 'var(--surface-elevated)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="btn btn-secondary"
                onClick={handleRebuild}
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', height: '36px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={14} className={loading ? 'spin' : ''} />
                <span>Rebuild Embeddings DB</span>
              </button>

              <button
                className="btn btn-secondary"
                onClick={async () => {
                  if (window.confirm('Clear all indexed vector embeddings data from cache?')) {
                    await aiClearEmbeddingsData();
                    loadEmbeddingsStatus();
                  }
                }}
                style={{ width: '100%', justifyContent: 'center', height: '32px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-danger)' }}
              >
                <span>Clear Embeddings Data</span>
              </button>
            </div>

            {/* Chunk Detail Card */}
            {selectedChunk && (
              <div className="kg-details-card animate-fade-in">
                <div className="kg-details-head">
                  <h4>Chunk Content</h4>
                  <button className="kg-details-close" onClick={() => setSelectedChunk(null)}>✕</button>
                </div>
                <div className="kg-details-body" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  <div className="kg-detail-row">
                    <span className="label">Location</span>
                    <strong>Lines {selectedChunk.start_line} - {selectedChunk.end_line}</strong>
                  </div>
                  <div className="kg-detail-row">
                    <span className="label">Content</span>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '11px', background: 'var(--surface-muted)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-soft)' }}>
                      {selectedChunk.content}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Searchable Chunk Inspector & Log viewer */}
          <div className="kg-canvas-wrapper" style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-bg)', overflow: 'hidden' }}>
            {error && (
              <div className="kg-error-overlay">
                <AlertCircle size={20} style={{ color: 'var(--kg-task-border)' }} />
                <p>{error}</p>
              </div>
            )}

            {/* Chunks Inspector list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 12px 0' }}>Chunks Inspector</h3>
              {status.chunks.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                  <FileText size={20} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <span>No note chunks found. Try writing a note or rebuilding the index.</span>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px' }}>Note Path</th>
                      <th style={{ padding: '8px' }}>Type</th>
                      <th style={{ padding: '8px' }}>Lines</th>
                      <th style={{ padding: '8px' }}>Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.chunks.map((chunk) => (
                      <tr
                        key={chunk.id}
                        onClick={() => setSelectedChunk(chunk)}
                        style={{ borderBottom: '1px solid var(--border-soft)', cursor: 'pointer', hover: 'background: var(--surface-muted)' }}
                        className="kg-table-row"
                      >
                        <td style={{ padding: '8px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={chunk.note_path}>
                          {chunk.note_path.split(/[/\\]/).pop()}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <span className="kg-category-badge" style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'var(--surface-muted)', border: '1px solid var(--border-soft)' }}>
                            {chunk.chunk_type || 'text'}
                          </span>
                        </td>
                        <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>
                          {chunk.start_line}-{chunk.end_line}
                        </td>
                        <td style={{ padding: '8px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-strong)' }}>
                          {chunk.content}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        </div>
      </div>

      <OverlayDialog
        open={showProgressModal}
        onClose={() => setShowProgressModal(false)}
        ariaLabel="Embeddings Database Rebuild Progress"
      >
        <div className="overlay-dialog-header" style={{ padding: "1.25rem 1.5rem" }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>Rebuilding Embeddings DB</h2>
        </div>
        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "16px", minWidth: "320px", background: 'var(--surface-bg)' }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
              <span style={{ color: "var(--text-secondary)" }}>Indexing notes...</span>
              <strong style={{ color: "var(--text-strong)" }}>
                {status.queueTotal > 0 ? Math.round(((status.queueTotal - status.queueSize) / status.queueTotal) * 100) : 0}%
              </strong>
            </div>
            
            <div style={{ width: '100%', height: '8px', background: 'var(--border-soft)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                width: `${status.queueTotal > 0 ? Math.max(0, Math.min(100, ((status.queueTotal - status.queueSize) / status.queueTotal) * 100)) : 0}%`,
                height: '100%',
                background: 'var(--accent-default)',
                transition: 'width 0.3s ease'
              }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
              <span>Remaining: {status.queueSize} files</span>
              <span>Total: {status.queueTotal} files</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowProgressModal(false)}
              style={{ padding: "6px 12px", fontSize: "12px", background: 'var(--surface-muted)', border: '1px solid var(--border-default)', borderRadius: '4px', cursor: 'pointer' }}
            >
              Run in Background
            </button>
          </div>
        </div>
      </OverlayDialog>
    </div>
  );
}
