import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Search, RefreshCw, Trash2, Download, Terminal, Filter } from 'lucide-react';
import { aiGetLogs, aiClearLogs } from '../services/electronService';

import '../styles/KnowledgeGraph.css';

export default function AppLogsPage({ onBack }) {
  const [logs, setLogs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [subsystemFilter, setSubsystemFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const sub = subsystemFilter === 'all' ? null : subsystemFilter;
      const res = await aiGetLogs(sub, 200);
      if (res && res.success && Array.isArray(res.data)) {
        setLogs(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch application logs:', err);
    }
  }, [subsystemFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (levelFilter !== 'all' && log.level !== levelFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const msgMatch = String(log.message || '').toLowerCase().includes(query);
        const subMatch = String(log.subsystem || '').toLowerCase().includes(query);
        return msgMatch || subMatch;
      }
      return true;
    });
  }, [logs, levelFilter, searchQuery]);

  const handleClear = async () => {
    if (!window.confirm('Are you sure you want to clear system logs?')) return;
    try {
      const sub = subsystemFilter === 'all' ? null : subsystemFilter;
      await aiClearLogs(sub);
      await fetchLogs();
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const handleExport = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `notely-system-logs-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      console.error('Export logs failed:', err);
    }
  };

  return (
    <div className="knowledge-graph-page">
      {/* Top Navigation Breadcrumb */}
      <div className="detail-topbar">
        <nav className="detail-breadcrumb" aria-label="System Logs location">
          <span className="detail-breadcrumb-part">
            <button className="detail-breadcrumb-link" type="button" onClick={onBack}>Notes</button>
            <span className="detail-breadcrumb-separator" aria-hidden="true">/</span>
          </span>
          <span className="detail-breadcrumb-current">System & Application Logs</span>
        </nav>
      </div>

      <div className="knowledge-graph-container" style={{ display: 'flex', flexDirection: 'column', padding: '16px', gap: '16px', height: 'calc(100vh - 80px)' }}>
        {/* Controls Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', background: 'var(--surface-elevated)', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
            <div className="kg-search-wrapper" style={{ flex: 1, margin: 0, height: '32px', display: 'flex', alignItems: 'center' }}>
              <Search size={16} className="kg-search-icon" />
              <input
                type="text"
                className="kg-search-input"
                placeholder="Search log messages or subsystems..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ height: '32px', boxSizing: 'border-box', fontSize: '12px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '32px' }}>
              <Filter size={14} style={{ color: 'var(--text-muted)' }} />
              <select
                value={subsystemFilter}
                onChange={(e) => setSubsystemFilter(e.target.value)}
                style={{ height: '32px', boxSizing: 'border-box', background: 'var(--surface-bg)', color: 'var(--text-strong)', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '0 10px', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
              >
                <option value="all">All Subsystems</option>
                <option value="graph">Knowledge Graph</option>
                <option value="embeddings">Embeddings Engine</option>
                <option value="app">Application</option>
                <option value="git">Git VC</option>
                <option value="ai">AI Agent</option>
              </select>

              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                style={{ height: '32px', boxSizing: 'border-box', background: 'var(--surface-bg)', color: 'var(--text-strong)', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '0 10px', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
              >
                <option value="all">All Severity</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '32px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{ height: '32px', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '0 12px' }}
            >
              <RefreshCw size={14} className={autoRefresh ? 'spin' : ''} />
              <span>{autoRefresh ? 'Live Auto-Refresh' : 'Paused'}</span>
            </button>

            <button
              className="btn btn-secondary"
              onClick={handleExport}
              style={{ height: '32px', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '0 12px' }}
            >
              <Download size={14} />
              <span>Export</span>
            </button>

            <button
              className="btn btn-secondary"
              onClick={handleClear}
              style={{ height: '32px', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '0 12px', color: 'var(--text-danger)' }}
            >
              <Trash2 size={14} />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Logs Console Container */}
        <div style={{ flex: 1, background: 'var(--surface-muted)', borderRadius: '8px', border: '1px solid var(--border-soft)', padding: '12px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filteredLogs.length > 0 ? (
            filteredLogs.map((item, idx) => {
              const isErr = item.level === 'error';
              const isWarn = item.level === 'warn';
              const levelColor = isErr ? 'var(--text-danger)' : isWarn ? 'var(--text-warning)' : 'var(--status-success-text)';
              return (
                <div key={item.id || idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: 1.4, padding: '3px 6px', borderRadius: '4px', background: isErr ? 'rgba(239,68,68,0.06)' : isWarn ? 'rgba(245,158,11,0.06)' : 'transparent' }}>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: '10px' }}>
                    [{new Date(item.timestamp).toLocaleTimeString()}]
                  </span>
                  <span style={{ background: 'var(--surface-accent)', color: 'var(--accent-solid)', padding: '0 4px', borderRadius: '3px', fontSize: '9.5px', textTransform: 'uppercase', flexShrink: 0 }}>
                    {item.subsystem || 'app'}
                  </span>
                  <span style={{ color: levelColor, fontWeight: 700, fontSize: '9.5px', textTransform: 'uppercase', flexShrink: 0, width: '42px' }}>
                    {item.level || 'info'}
                  </span>
                  <span style={{ color: 'var(--text-strong)', wordBreak: 'break-word', flex: 1 }}>
                    {item.message}
                  </span>
                </div>
              );
            })
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', gap: '8px' }}>
              <Terminal size={20} />
              <span>No system logs match the active filter criteria.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
