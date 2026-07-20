import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  Database,
  Cpu,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  ChevronRight,
  Terminal,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Wrench,
  Search,
  X
} from 'lucide-react';
import { aiGetHealth, aiListConversations, aiGetMessages } from '../services/electronService';
import { renderMarkdown } from '../utils/renderUtils';
import '../styles/KnowledgeGraph.css';
import '../styles/AISettings.css';
import '../styles/AIHealthPage.css';

function StatusDot({ ok }) {
  return (
    <span className="ahp-status-dot" data-ok={ok ? 'true' : 'false'} />
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="ahp-stat-card">
      <div className="ahp-stat-label">{label}</div>
      <div className="ahp-stat-value" style={accent ? { color: 'var(--accent-default)' } : {}}>{value}</div>
    </div>
  );
}

function DbRow({ label, count, countLabel, path, status }) {
  const ok = status === 'connected';
  return (
    <div className="ahp-db-row">
      <div className="ahp-db-row-header">
        <StatusDot ok={ok} />
        <span className="ahp-db-row-name">{label}</span>
        <span className="ahp-db-row-count">{count} {countLabel}</span>
      </div>
      <span className="ahp-db-row-path">{path || 'none'}</span>
    </div>
  );
}

function ToolCallBlock({ step }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ahp-tool-call">
      <button className="ahp-tool-call-header" onClick={() => setOpen(o => !o)} type="button">
        <Wrench size={12} className="ahp-tool-icon" />
        <span className="ahp-tool-name">{step.name}</span>
        <span className="ahp-tool-args-preview">{JSON.stringify(step.args || {}).slice(0, 60)}</span>
        <ChevronRight size={12} className={`ahp-tool-chevron${open ? ' open' : ''}`} />
      </button>
      {open && (
        <div className="ahp-tool-body">
          <div className="ahp-tool-section-label">Args</div>
          <pre className="ahp-tool-pre">{JSON.stringify(step.args || {}, null, 2)}</pre>
          <div className="ahp-tool-section-label">Output</div>
          <pre className="ahp-tool-pre">{step.output || '(empty)'}</pre>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  const trace = msg.metadata?.trace || [];
  return (
    <div className={`ahp-bubble-wrap${isUser ? ' user' : ' assistant'}`}>
      <div className={`ahp-bubble${isUser ? ' user' : ' assistant'}`}>
        <div className="ahp-bubble-role">{isUser ? '👤 User' : '🤖 Assistant'}</div>
        <div className="ahp-bubble-content markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
        {trace.length > 0 && (
          <div className="ahp-tool-calls">
            <div className="ahp-tool-calls-label">
              <Terminal size={12} /> Tool calls ({trace.length})
            </div>
            {trace.map((step, i) => <ToolCallBlock key={i} step={step} />)}
          </div>
        )}
        <div className="ahp-bubble-ts">{new Date(msg.created_at).toLocaleTimeString()}</div>
      </div>
    </div>
  );
}

function ConversationPane({ conv, onBack }) {
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await aiGetMessages(conv.id);
        if (res?.success) setMessages(res.data || []);
        else setError(res?.error || 'Failed to load messages.');
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [conv.id]);

  return (
    <div className="ahp-trace-pane">
      <div className="ahp-trace-header">
        <button className="ahp-back-btn" onClick={onBack} type="button">
          <ArrowLeft size={14} /> Conversations
        </button>
        <div className="ahp-trace-title">{conv.title}</div>
        <div className="ahp-trace-meta">Persona: {conv.persona} &middot; {new Date(conv.created_at).toLocaleDateString()}</div>
      </div>
      <div className="ahp-trace-body">
        {loading && <div className="ahp-empty">Loading messages&hellip;</div>}
        {error && <div className="ahp-error-bar"><AlertCircle size={14} /> {error}</div>}
        {!loading && !error && messages?.length === 0 && (
          <div className="ahp-empty">No messages in this conversation.</div>
        )}
        {messages?.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
      </div>
    </div>
  );
}

export default function AIHealthPage({ onBack }) {
  const [health, setHealth] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [convSearch, setConvSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [healthRes, convRes] = await Promise.all([
        aiGetHealth(),
        aiListConversations().catch(() => ({ success: true, data: [] }))
      ]);
      if (healthRes?.success) setHealth(healthRes.data);
      else setError(healthRes?.error || 'Failed to fetch diagnostics.');
      if (convRes?.success) setConversations(convRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const db = health?.database;
  const stats = health?.systemStats;

  const q = convSearch.trim().toLowerCase();
  const filteredConversations = q
    ? conversations.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.persona.toLowerCase().includes(q)
      )
    : conversations;

  return (
    <div className="knowledge-graph-page ahp-root">
      <div className="detail-topbar">
        <nav className="detail-breadcrumb" aria-label="Health location">
          <span className="detail-breadcrumb-part">
            <button className="detail-breadcrumb-link" type="button" onClick={onBack}>Notes</button>
            <span className="detail-breadcrumb-separator" aria-hidden="true">/</span>
          </span>
          <span className="detail-breadcrumb-current">AI Health &amp; Diagnostics</span>
        </nav>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={load} disabled={loading} className="btn btn-secondary ahp-refresh-btn" type="button">
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          <button onClick={onBack} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '28px', padding: '0 10px', fontSize: '12px' }} type="button">
            <X size={12} />
            Close
          </button>
        </div>
      </div>

      <div className="ahp-body">
        {/* Left column */}
        <div className="ahp-left">
          {error && (
            <div className="ahp-error-bar"><AlertCircle size={14} />{error}</div>
          )}

          <div className="ahp-card">
            <div className="ahp-card-header">
              <Cpu size={14} /><span>Subsystem State</span>
            </div>
            <div className="ahp-card-rows">
              <div className="ahp-row">
                <span>AI Engine</span>
                <span className="ahp-pill" data-ok={health?.enabled ? 'true' : 'false'}>
                  {health?.enabled ? <><CheckCircle size={12} /> Enabled</> : <><XCircle size={12} /> Disabled</>}
                </span>
              </div>
              <div className="ahp-row">
                <span>Orchestrator</span>
                <span className="ahp-pill" data-ok={health?.initialized ? 'true' : 'false'}>
                  {health?.initialized ? <><CheckCircle size={12} /> Ready</> : <><XCircle size={12} /> Not initialized</>}
                </span>
              </div>
              <div className="ahp-row">
                <span>Active Provider</span>
                <strong className="ahp-provider">{health?.activeProvider || '—'}</strong>
              </div>
              <div className="ahp-row">
                <span>Indexer Status</span>
                <span style={{
                  color: health?.isIndexing ? 'var(--accent-warning)' : health?.isPaused ? 'var(--text-muted)' : 'var(--accent-solid)',
                  fontWeight: 600
                }}>
                  {health?.isIndexing ? 'Indexing...' : health?.isPaused ? 'Paused' : 'Ready'}
                </span>
              </div>
            </div>
          </div>

          <div className="ahp-card">
            <div className="ahp-card-header">
              <Activity size={14} /><span>Session Usage</span>
            </div>
            <div className="ahp-stat-grid">
              <StatCard label="Requests" value={stats?.requestsCount ?? 0} />
              <StatCard label="Tokens" value={stats?.tokensUsed ?? 0} />
              <StatCard label="Conversations" value={conversations.length} accent />
            </div>
          </div>

          <div className="ahp-card">
            <div className="ahp-card-header">
              <Database size={14} /><span>Database Connections</span>
            </div>
            <div className="ahp-db-list">
              <DbRow label="Memory DB" count={db?.totalConversations ?? 0} countLabel="chats" path={db?.memoryDBPath} status={db?.status} />
              <DbRow label="Persona Registry" count={db?.totalPersonas ?? 0} countLabel="personas" path={db?.personaDBPath} status={db?.status} />
              <DbRow label="Embeddings DB" count={db?.totalChunks ?? 0} countLabel="chunks" path={db?.embeddingDBPath} status={db?.status} />
              <DbRow label="Knowledge Graph" count={db?.totalRelations ?? 0} countLabel="relations" path={db?.graphDBPath} status={db?.status} />
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="ahp-right">
          {selectedConv ? (
            <ConversationPane conv={selectedConv} onBack={() => setSelectedConv(null)} />
          ) : (
            <div className="ahp-conv-list-pane">
              <div className="ahp-conv-list-header">
                <MessageSquare size={14} /><span>Conversation History</span>
                <span className="ahp-conv-count">
                  {q ? `${filteredConversations.length} / ${conversations.length}` : conversations.length}
                </span>
              </div>
              <div className="ahp-conv-search-wrap">
                <Search size={12} className="ahp-conv-search-icon" />
                <input
                  className="ahp-conv-search"
                  type="text"
                  placeholder="Search conversations…"
                  value={convSearch}
                  onChange={e => setConvSearch(e.target.value)}
                />
                {convSearch && (
                  <button className="ahp-conv-search-clear" onClick={() => setConvSearch('')} type="button" aria-label="Clear search">
                    <X size={12} />
                  </button>
                )}
              </div>
              {filteredConversations.length === 0 ? (
                <div className="ahp-empty">
                  {conversations.length === 0
                    ? 'No conversations yet. Start chatting to see history here.'
                    : 'No matches for your search.'}
                </div>
              ) : (
                <div className="ahp-conv-list">
                  {filteredConversations.map(conv => (
                    <button key={conv.id} className="ahp-conv-item" onClick={() => setSelectedConv(conv)} type="button">
                      <div className="ahp-conv-title">{conv.title}</div>
                      <div className="ahp-conv-meta">
                        <span>Persona: {conv.persona}</span>
                        <span>{new Date(conv.updated_at).toLocaleString()}</span>
                      </div>
                      <ChevronRight size={14} className="ahp-conv-arrow" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
