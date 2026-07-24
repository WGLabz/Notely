import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Plus,
  Trash2,
  Upload,
  Download,
  Save,
  AlertCircle,
  Search
} from 'lucide-react';
import {
  aiListPersonas,
  aiSavePersona,
  aiDeletePersona,
  aiImportPersona,
  aiExportPersona
} from '../services/electronService';
import { MarkdownEditor } from './MarkdownEditor';
import { MarkdownToolbar } from './MarkdownToolbar';

import '../styles/KnowledgeGraph.css'; // Reuses base layout rules for unified styling
import '../styles/AISettings.css'; // Reuses button styling rules (.btn, .btn-primary)
import '../styles/editor.css'; // Reuses editor pane styles (.editor-toolbar, .pane-toolbar-row)

export default function AIPersonasManager({ onBack }) {
  const [personas, setPersonas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAvatar, setEditAvatar] = useState('👤');
  const [editPurpose, setEditPurpose] = useState('');
  const [editExpertise, setEditExpertise] = useState('');
  const [editTone, setEditTone] = useState('direct, clear, warm');
  const [editVerbosity, setEditVerbosity] = useState('balanced');
  const [editResponseStructure, setEditResponseStructure] = useState('');
  const [editClarificationStrategy, setEditClarificationStrategy] = useState('');
  const [editPreferredExamples, setEditPreferredExamples] = useState('');
  const [editFallbackBehaviour, setEditFallbackBehaviour] = useState('');
  const [editOwner, setEditOwner] = useState('User');
  const [editSchemaVersion, setEditSchemaVersion] = useState('1.0.0');

  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Refs needed for MarkdownEditor & MarkdownToolbar hook integrations
  const editorRef = useRef(null);

  const select = useCallback((p, force = false) => {
    if (!force && dirty && !window.confirm('You have unsaved changes. Discard them?')) {
      return;
    }
    setSelected(p);
    setEditName(p.name);
    setEditDesc(p.description ?? '');
    setEditAvatar(p.avatar ?? '👤');
    setEditPrompt(p.prompt ?? p.systemInstructions ?? '');
    setEditPurpose(p.purpose ?? p.description ?? '');
    setEditExpertise(Array.isArray(p.expertise) ? p.expertise.join(', ') : (p.expertise ?? ''));
    setEditTone(p.tone ?? 'direct, clear, warm');
    setEditVerbosity(p.verbosity ?? 'balanced');
    setEditResponseStructure(p.responseStructure ?? '');
    setEditClarificationStrategy(p.clarificationStrategy ?? '');
    setEditPreferredExamples(p.preferredExamples ?? '');
    setEditFallbackBehaviour(p.fallbackBehaviour ?? '');
    setEditOwner(p.owner ?? 'User');
    setEditSchemaVersion(p.schemaVersion ?? '1.0.0');
    setDirty(false);
    setError('');
    setStatus('');
  }, [dirty]);

  const load = useCallback(async () => {
    try {
      const res = await aiListPersonas();
      if (res?.success) {
        const list = res.data ?? [];
        setPersonas(list);
        if (list.length > 0 && !selected) {
          const def = list.find(p => p.id === 'general') || list[0];
          select(def, true);
        }
      }
    } catch (err) {
      setError(err.message);
    }
  }, [selected, select]);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = (val) => {
    setEditPrompt(val);
    setDirty(true);
  };

  const handleBack = () => {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) {
      return;
    }
    onBack();
  };

  const save = async () => {
    if (!selected) return;
    if (selected.type === 'builtin') {
      setError('System default personas cannot be modified.');
      return;
    }
    if (!editName.trim()) {
      setError('Persona name cannot be empty.');
      return;
    }
    if (!editPrompt.trim()) {
      setError('System prompt cannot be empty.');
      return;
    }

    // Direct name collision check against other existing personas
    const nameCollision = personas.find(p => p.id !== selected.id && p.name.trim().toLowerCase() === editName.trim().toLowerCase());
    if (nameCollision) {
      setError(`A persona named "${nameCollision.name}" already exists. Please choose a unique name.`);
      return;
    }

    try {
      setError('');
      setStatus('');
      const updated = {
        ...selected,
        name: editName.trim(),
        description: editDesc,
        prompt: editPrompt,
        avatar: editAvatar,
        purpose: editPurpose,
        expertise: editExpertise.split(',').map(s => s.trim()).filter(Boolean),
        tone: editTone,
        verbosity: editVerbosity,
        responseStructure: editResponseStructure,
        clarificationStrategy: editClarificationStrategy,
        preferredExamples: editPreferredExamples,
        fallbackBehaviour: editFallbackBehaviour,
        owner: editOwner,
        schemaVersion: editSchemaVersion
      };
      const res = await aiSavePersona(updated);
      if (res.success) {
        setDirty(false);
        setStatus('Saved successfully and synced to .md file.');
        setSelected(updated);
        await load();
      } else {
        setError(res.error || 'Failed to save changes.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const createNewPersona = () => {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) {
      return;
    }
    const newId = `custom-persona-${Date.now()}`;
    const newP = {
      id: newId,
      name: 'New Custom Persona',
      description: 'Brief custom instructions description.',
      purpose: 'Help users with custom task workflows',
      expertise: ['Note Synthesis', 'Task Execution'],
      tone: 'direct, clear, warm',
      verbosity: 'balanced',
      responseStructure: 'Summary -> Detailed Solution -> Next Steps',
      clarificationStrategy: 'Ask direct questions when intent is ambiguous',
      preferredExamples: 'Code snippets, structured markdown lists',
      fallbackBehaviour: 'Provide best effort summary of note context',
      owner: 'User',
      schemaVersion: '1.0.0',
      avatar: '👤',
      prompt: [
        '## Role Definition & Mindset',
        'You are a custom AI assistant tailored for workspace tasks.',
        '',
        '## Communication Style & Tone',
        '- Direct, helpful, concise, and structured.'
      ].join('\n'),
      type: 'custom',
      version: '1.0'
    };
    setSelected(newP);
    setEditName(newP.name);
    setEditDesc(newP.description);
    setEditAvatar(newP.avatar);
    setEditPurpose(newP.purpose);
    setEditExpertise(newP.expertise.join(', '));
    setEditTone(newP.tone);
    setEditVerbosity(newP.verbosity);
    setEditResponseStructure(newP.responseStructure);
    setEditClarificationStrategy(newP.clarificationStrategy);
    setEditPreferredExamples(newP.preferredExamples);
    setEditFallbackBehaviour(newP.fallbackBehaviour);
    setEditOwner(newP.owner);
    setEditSchemaVersion(newP.schemaVersion);
    setEditPrompt(newP.prompt);
    setDirty(true);
    setError('');
    setStatus('Ready to save new persona.');
  };

  const deletePersona = async () => {
    if (!selected || selected.type === 'builtin') return;
    if (!window.confirm(`Are you sure you want to delete the persona "${selected.name}"?`)) return;
    try {
      setError('');
      setStatus('');
      const res = await aiDeletePersona(selected.id);
      if (res.success) {
        setSelected(null);
        await load();
      } else {
        setError(res.error || 'Failed to delete persona.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const importPersona = async () => {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) {
      return;
    }
    try {
      setError('');
      setStatus('');
      const api = window.notesApi;
      if (!api?.showOpenDialog) {
        setError('File dialog requires Electron context.');
        return;
      }
      const result = await api.showOpenDialog({
        filters: [{ name: 'Persona', extensions: ['md'] }],
        properties: ['openFile']
      });
      if (!result || result.canceled || !result.filePaths?.length) return;
      const filePath = result.filePaths[0];
      const res = await aiImportPersona(filePath);
      if (res?.success) {
        setStatus(`Imported: ${res.data.name}`);
        await load();
      } else {
        setError(res?.error || 'Import failed.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const exportPersona = async () => {
    if (!selected) return;
    try {
      setError('');
      setStatus('');
      const api = window.notesApi;
      if (!api?.showSaveDialog) {
        setError('File dialog requires Electron context.');
        return;
      }
      const result = await api.showSaveDialog({
        defaultPath: `${selected.id}.md`,
        filters: [{ name: 'Persona Markdown', extensions: ['md'] }]
      });
      if (!result || result.canceled || !result.filePath) return;
      const res = await aiExportPersona(selected.id, result.filePath);
      if (res?.success) {
        setStatus(`Exported to ${result.filePath}`);
      } else {
        setError(res?.error || 'Export failed.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredPersonas = personas.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="knowledge-graph-page">
      <div className="detail-topbar">
        <nav className="detail-breadcrumb" aria-label="Personas location">
          <span className="detail-breadcrumb-part">
            <button className="detail-breadcrumb-link" type="button" onClick={handleBack}>Notes</button>
            <span className="detail-breadcrumb-separator" aria-hidden="true">/</span>
          </span>
          <span className="detail-breadcrumb-current">AI Personas</span>
        </nav>
      </div>

      <div className="knowledge-graph-container">
        <div className="kg-header-actions" style={{ justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>{selected?.avatar || '👤'}</span>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>
              Persona Registry Manager
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={createNewPersona}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={14} />
              New Persona
            </button>
            <button
              onClick={importPersona}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Upload size={14} />
              Import .md
            </button>
          </div>
        </div>

        <div className="kg-body">
          <div className="kg-sidebar" style={{ width: '280px' }}>
            <div className="kg-sidebar-section" style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', borderBottom: 'none' }}>
              <h4 style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>
                Available Personas
              </h4>
              
              <div className="kg-search-wrapper" style={{ width: '100%', flex: 'none' }}>
                <Search size={16} className="kg-search-icon" />
                <input
                  type="text"
                  placeholder="Search personas..."
                  className="kg-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', flex: 1, marginTop: '8px' }}>
                {filteredPersonas.map(p => (
                  <button
                    key={p.id}
                    onClick={() => select(p)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      borderRadius: '6px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: selected?.id === p.id ? 'var(--accent-light, rgba(99, 102, 241, 0.12))' : 'transparent',
                      color: selected?.id === p.id ? 'var(--accent-hover)' : 'var(--text-primary)',
                      borderLeft: selected?.id === p.id ? '3px solid var(--accent-default)' : '3px solid transparent',
                      fontSize: '13px',
                      fontWeight: selected?.id === p.id ? 600 : 400,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span style={{ fontSize: '16px', marginRight: '4px' }}>{p.avatar || '👤'}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {p.type === 'builtin' ? (
                      <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'var(--border-soft)', padding: '2px 4px', borderRadius: '3px', color: 'var(--text-muted)' }}>Built-in</span>
                    ) : (
                      <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'var(--accent-light)', padding: '2px 4px', borderRadius: '3px', color: 'var(--accent-default)' }}>Custom</span>
                    )}
                  </button>
                ))}
                {filteredPersonas.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 10px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No personas found
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pane-block" style={{ borderRadius: '8px', border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, marginLeft: '16px' }}>
            {selected ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-subtle)' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {selected.type === 'builtin' ? 'Customize Built-in Persona' : 'Edit Custom Persona'}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      onClick={save}
                      disabled={!dirty || selected.type === 'builtin'}
                      className="btn btn-primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: (dirty && selected.type !== 'builtin') ? 1 : 0.6 }}
                    >
                      <Save size={14} />
                      Save
                    </button>

                    {selected.type !== 'builtin' && (
                      <button
                        onClick={deletePersona}
                        className="btn btn-danger"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    )}

                    <button
                      onClick={exportPersona}
                      className="btn btn-secondary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Download size={14} />
                      Export
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'row', gap: '16px', padding: '16px', borderBottom: '1px solid var(--border-soft)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '80px', alignItems: 'center', justifyContent: 'center' }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>Avatar</label>
                    <input
                      value={editAvatar}
                      onChange={e => { setEditAvatar(e.target.value); setDirty(true); }}
                      disabled={selected.type === 'builtin'}
                      maxLength={4}
                      style={{
                        fontSize: '28px',
                        textAlign: 'center',
                        border: '1px solid var(--border-soft)',
                        background: 'var(--surface-bg)',
                        borderRadius: '6px',
                        width: '60px',
                        height: '60px',
                        color: 'var(--text-strong)',
                        outline: 'none',
                        transition: 'border-color 0.15s ease'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center' }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>Presets</label>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxWidth: '300px' }}>
                      {['🤖', '💻', '🧠', '👤', '🕵️', '🎨', '🧑‍🏫', '🚀', '🔒', '📈', '✨'].map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          disabled={selected.type === 'builtin'}
                          onClick={() => { setEditAvatar(emoji); setDirty(true); }}
                          style={{
                            fontSize: '18px',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: editAvatar === emoji ? '2px solid var(--accent-solid)' : '1px solid var(--border-soft)',
                            borderRadius: '4px',
                            background: editAvatar === emoji ? 'var(--surface-accent)' : 'var(--surface-bg)',
                            cursor: selected.type === 'builtin' ? 'not-allowed' : 'pointer',
                            padding: 0,
                            outline: 'none',
                            opacity: selected.type === 'builtin' ? 0.5 : 1
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>Persona Name</label>
                        <input
                          value={editName}
                          onChange={e => { setEditName(e.target.value); setDirty(true); }}
                          disabled={selected.type === 'builtin'}
                          placeholder="Persona Name..."
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            border: '1px solid var(--border-soft)',
                            background: 'var(--surface-bg)',
                            borderRadius: '6px',
                            width: '100%',
                            padding: '6px 10px',
                            color: 'var(--text-strong)',
                            outline: 'none'
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '150px' }}>
                        <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>Tone</label>
                        <select
                          value={editTone}
                          onChange={e => { setEditTone(e.target.value); setDirty(true); }}
                          disabled={selected.type === 'builtin'}
                          style={{
                            fontSize: '12px',
                            border: '1px solid var(--border-soft)',
                            background: 'var(--surface-bg)',
                            borderRadius: '6px',
                            width: '100%',
                            padding: '6px 10px',
                            color: 'var(--text-strong)',
                            outline: 'none'
                          }}
                        >
                          <option value="direct, clear, warm">Direct, Clear, Warm</option>
                          <option value="creative, energetic, open-minded">Creative, Energetic</option>
                          <option value="analytical, precise, practical">Analytical, Precise</option>
                          <option value="analytical, structured, strategic">Structured, Strategic</option>
                          <option value="methodical, organized, structured">Methodical, Structured</option>
                          <option value="curious, analytical, thorough">Curious, Thorough</option>
                          <option value="encouraging, patient, structured">Patient, Educational</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '130px' }}>
                        <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>Verbosity</label>
                        <select
                          value={editVerbosity}
                          onChange={e => { setEditVerbosity(e.target.value); setDirty(true); }}
                          disabled={selected.type === 'builtin'}
                          style={{
                            fontSize: '12px',
                            border: '1px solid var(--border-soft)',
                            background: 'var(--surface-bg)',
                            borderRadius: '6px',
                            width: '100%',
                            padding: '6px 10px',
                            color: 'var(--text-strong)',
                            outline: 'none'
                          }}
                        >
                          <option value="concise">Concise</option>
                          <option value="balanced">Balanced</option>
                          <option value="detailed">Detailed</option>
                          <option value="thorough">Thorough</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>Description</label>
                      <input
                        value={editDesc}
                        onChange={e => { setEditDesc(e.target.value); setDirty(true); }}
                        disabled={selected.type === 'builtin'}
                        placeholder="Persona Description..."
                        style={{
                          fontSize: '12px',
                          border: '1px solid var(--border-soft)',
                          background: 'var(--surface-bg)',
                          borderRadius: '6px',
                          width: '100%',
                          padding: '6px 10px',
                          color: 'var(--text-muted)',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Extended Frontmatter Metadata Form */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-subtle, rgba(0,0,0,0.02))' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Purpose</label>
                    <input
                      value={editPurpose}
                      onChange={e => { setEditPurpose(e.target.value); setDirty(true); }}
                      disabled={selected.type === 'builtin'}
                      placeholder="e.g. Help users generate new ideas..."
                      style={{ fontSize: '11px', border: '1px solid var(--border-soft)', background: 'var(--surface-bg)', borderRadius: '4px', padding: '4px 8px', color: 'var(--text-primary)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Expertise (comma separated)</label>
                    <input
                      value={editExpertise}
                      onChange={e => { setEditExpertise(e.target.value); setDirty(true); }}
                      disabled={selected.type === 'builtin'}
                      placeholder="e.g. Ideation, Problem Solving, Lateral Thinking"
                      style={{ fontSize: '11px', border: '1px solid var(--border-soft)', background: 'var(--surface-bg)', borderRadius: '4px', padding: '4px 8px', color: 'var(--text-primary)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Response Structure</label>
                    <input
                      value={editResponseStructure}
                      onChange={e => { setEditResponseStructure(e.target.value); setDirty(true); }}
                      disabled={selected.type === 'builtin'}
                      placeholder="e.g. Overview -> Category Map -> Recommendations"
                      style={{ fontSize: '11px', border: '1px solid var(--border-soft)', background: 'var(--surface-bg)', borderRadius: '4px', padding: '4px 8px', color: 'var(--text-primary)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Clarification Strategy</label>
                    <input
                      value={editClarificationStrategy}
                      onChange={e => { setEditClarificationStrategy(e.target.value); setDirty(true); }}
                      disabled={selected.type === 'builtin'}
                      placeholder="e.g. Prompt user with open-ended angles..."
                      style={{ fontSize: '11px', border: '1px solid var(--border-soft)', background: 'var(--surface-bg)', borderRadius: '4px', padding: '4px 8px', color: 'var(--text-primary)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Preferred Examples</label>
                    <input
                      value={editPreferredExamples}
                      onChange={e => { setEditPreferredExamples(e.target.value); setDirty(true); }}
                      disabled={selected.type === 'builtin'}
                      placeholder="e.g. Bulleted idea categories, Excalidraw trees"
                      style={{ fontSize: '11px', border: '1px solid var(--border-soft)', background: 'var(--surface-bg)', borderRadius: '4px', padding: '4px 8px', color: 'var(--text-primary)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Fallback Behaviour</label>
                    <input
                      value={editFallbackBehaviour}
                      onChange={e => { setEditFallbackBehaviour(e.target.value); setDirty(true); }}
                      disabled={selected.type === 'builtin'}
                      placeholder="e.g. Offer 3 distinct creative directions"
                      style={{ fontSize: '11px', border: '1px solid var(--border-soft)', background: 'var(--surface-bg)', borderRadius: '4px', padding: '4px 8px', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                {/* Markdown Toolbar directly wired to editor state */}
                {selected.type !== 'builtin' && (
                  <div className="pane-toolbar-row">
                    <MarkdownToolbar
                      value={editPrompt}
                      onChange={handleChange}
                      textareaRef={editorRef}
                      basePath=""
                      canUndo={false}
                      canRedo={false}
                    />
                  </div>
                )}

                {/* Fully featured MarkdownEditor component */}
                <div className="markdown-editor" style={{ flex: 1 }}>
                  <MarkdownEditor
                    value={editPrompt}
                    onChange={handleChange}
                    textareaRef={editorRef}
                    aiEnabled={false}
                    readOnly={selected.type === 'builtin'}
                  />
                </div>

                {(error || status) && (
                  <div style={{
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: error ? 'var(--text-warning)' : 'var(--status-success-text)',
                    background: error ? 'rgba(239, 68, 68, 0.05)' : 'rgba(34, 197, 94, 0.05)',
                    borderTop: '1px solid var(--border-soft)'
                  }}>
                    {error && <AlertCircle size={14} />}
                    <span>{error || status}</span>
                  </div>
                )}

              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Select a persona from the left sidebar to view or edit its system instructions.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
