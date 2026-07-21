import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search, RefreshCw, Layers, ShieldAlert, Database } from 'lucide-react';
import { aiGetGraph, aiBuildGraph, aiGetGraphStatus, aiGetLogs, aiClearGraphData, aiGetPreferences, aiGetGraphModelStatus } from '../services/electronService';

import * as d3Force from 'd3-force';
import '../styles/KnowledgeGraph.css';

// Custom Node component to bypass React Flow default padding, borders, and styles
const CustomNode = ({ data }) => {
  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      boxSizing: 'border-box' 
    }}>
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none', top: '50%', left: '50%', pointerEvents: 'none' }} />
      {data.label}
      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none', top: '50%', left: '50%', pointerEvents: 'none' }} />
    </div>
  );
};

const nodeTypes = {
  customNode: CustomNode,
};

// Curated node colors matching premium design system
// Light/Dark mode compatible high-contrast text and border colors using CSS variables
const TYPE_COLORS = {
  Note: { background: 'var(--kg-note-bg)', border: 'var(--kg-note-border)', text: 'var(--kg-note-border)' },
  Person: { background: 'var(--kg-person-bg)', border: 'var(--kg-person-border)', text: 'var(--kg-person-border)' },
  Project: { background: 'var(--kg-project-bg)', border: 'var(--kg-project-border)', text: 'var(--kg-project-border)' },
  Technology: { background: 'var(--kg-tech-bg)', border: 'var(--kg-tech-border)', text: 'var(--kg-tech-border)' },
  Company: { background: 'var(--kg-company-bg)', border: 'var(--kg-company-border)', text: 'var(--kg-company-border)' },
  Concept: { background: 'var(--kg-concept-bg)', border: 'var(--kg-concept-border)', text: 'var(--kg-concept-border)' },
  Task: { background: 'var(--kg-task-bg)', border: 'var(--kg-task-border)', text: 'var(--kg-task-border)' },
  Image: { background: 'var(--kg-image-bg, #f0fdf4)', border: 'var(--kg-image-border, #16a34a)', text: '#16a34a' },
  Document: { background: 'var(--kg-doc-bg, #fefce8)', border: 'var(--kg-doc-border, #ca8a04)', text: '#ca8a04' },
  ExternalURL: { background: 'var(--kg-url-bg, #faf5ff)', border: 'var(--kg-url-border, #9333ea)', text: '#9333ea' }
};

const DEFAULT_COLOR = { background: 'var(--surface-muted)', border: 'var(--border-default)', text: 'var(--text-muted)' };

export default function KnowledgeGraph({ onBack }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState({
    Note: true,
    Person: true,
    Project: true,
    Technology: true,
    Company: true,
    Concept: true,
    Task: true,
    Image: true,
    Document: true,
    ExternalURL: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [graphStatus, setGraphStatus] = useState({ nodeCount: 0, edgeCount: 0, sizeBytes: 0 });
  const [selectedNode, setSelectedNode] = useState(null);
  const [graphLogs, setGraphLogs] = useState([]);
  const [preferences, setPreferences] = useState({
    graphProvider: 'text-provider',
    aiProvider: 'gemini'
  });
  const [modelStatus, setModelStatus] = useState({
    downloaded: false,
    isDownloading: false,
    progress: 0
  });

  const loadModelAndPrefs = useCallback(async () => {
    try {
      const modelRes = await aiGetGraphModelStatus();
      if (modelRes.success && modelRes.data) {
        setModelStatus(modelRes.data);
      }
      const prefsRes = await aiGetPreferences();
      if (prefsRes.success && prefsRes.data) {
        setPreferences(prev => ({ ...prev, ...prefsRes.data }));
      }
    } catch (err) {
      console.error('Failed to load graph preferences metadata', err);
    }
  }, []);

  useEffect(() => {
    loadModelAndPrefs();
  }, [loadModelAndPrefs]);

  // Load Graph Data
  const loadGraphData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const graphRes = await aiGetGraph();
      const statusRes = await aiGetGraphStatus();
      const logsRes = await aiGetLogs('graph', 50);

      if (logsRes && logsRes.success && Array.isArray(logsRes.data)) {
        setGraphLogs(logsRes.data);
      }

      if (statusRes.success && statusRes.data) {
        setGraphStatus(statusRes.data);
      }

      if (graphRes.success && graphRes.data) {
        const { entities, relationships } = graphRes.data;

        // 1. Calculate degrees for centrality node sizing
        const degrees = {};
        entities.forEach(e => { degrees[e.id] = 0; });
        relationships.forEach(rel => {
          if (degrees[rel.source_id] !== undefined) degrees[rel.source_id]++;
          if (degrees[rel.target_id] !== undefined) degrees[rel.target_id]++;
        });

        // 2. Perform d3-force simulation layout
        const entityIds = new Set(entities.map(e => e.id));
        const forceNodes = entities.map(entity => ({
          id: entity.id,
          entity,
          x: Math.random() * 500,
          y: Math.random() * 500
        }));

        const forceLinks = relationships
          .filter(rel => entityIds.has(rel.source_id) && entityIds.has(rel.target_id))
          .map(rel => ({
            source: rel.source_id,
            target: rel.target_id
          }));

        const simulation = d3Force.forceSimulation(forceNodes)
          .force('link', d3Force.forceLink(forceLinks).id(d => d.id).distance(150))
          .force('charge', d3Force.forceManyBody().strength(-280))
          .force('center', d3Force.forceCenter(350, 300))
          .force('collision', d3Force.forceCollide().radius(80))
          .stop();

        // Run simulation synchronously to compute layout coordinate sets
        for (let i = 0; i < 180; i++) simulation.tick();

        // Sanity check coordinates to prevent NaN values from corrupting React Flow rendering
        forceNodes.forEach(node => {
          if (isNaN(node.x) || typeof node.x !== 'number') {
            node.x = Math.random() * 500;
          }
          if (isNaN(node.y) || typeof node.y !== 'number') {
            node.y = Math.random() * 500;
          }
        });

        // 3. Format nodes list
        const formattedNodes = forceNodes.map(node => {
          const entity = node.entity;
          const degree = degrees[entity.id] || 0;
          // Scale size between 45px and 90px depending on connection weight (more compact)
          const nodeSize = Math.max(45, Math.min(90, 45 + degree * 6));
          const typeColors = TYPE_COLORS[entity.type] || DEFAULT_COLOR;

          return {
            id: entity.id,
            type: 'default',
            data: {
              label: (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <span style={{ fontSize: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 800, color: typeColors.border }}>{entity.type}</span>
                  <span style={{ fontWeight: 700, fontSize: nodeSize > 70 ? '10px' : '8px', color: 'var(--text-strong)', textAlign: 'center', margin: '1px 2px 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebKitLineClamp: 2, WebKitBoxOrient: 'vertical' }}>
                    {entity.name}
                  </span>
                </div>
              ),
              raw: entity,
              degree,
              relationships: relationships.filter(r => r.source_id === entity.id || r.target_id === entity.id)
            },
            position: { x: node.x, y: node.y },
            style: {
              background: typeColors.background,
              border: `2px solid ${typeColors.border}`,
              borderRadius: '8px',
              width: nodeSize,
              height: nodeSize,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 12px ${typeColors.border}22, var(--shadow-sm)`,
              cursor: 'pointer',
              transition: 'opacity var(--motion-standard), transform var(--motion-standard)'
            }
          };
        });

        const formattedEdges = relationships.map((rel) => {
          const edgeColor = 'var(--text-subtle)';
          return {
            id: `edge-${rel.id}-${rel.source_id}-${rel.target_id}`,
            source: rel.source_id,
            target: rel.target_id,
            label: rel.type,
            type: 'smoothstep',
            style: { stroke: 'var(--border-soft)', strokeWidth: 1.5, transition: 'opacity var(--motion-standard)' },
            labelStyle: { fill: 'var(--text-strong)', fontSize: 7, fontWeight: 700 },
            labelBgStyle: { fill: 'var(--surface-bg)', stroke: 'var(--border-default)', strokeWidth: 1, fillOpacity: 0.9 },
            labelBgPadding: [2, 4],
            labelBgBorderRadius: 3,
            markerEnd: { type: 'arrowclosed', color: edgeColor, width: 10, height: 10 },
            animated: rel.type === 'DEPENDS_ON' || rel.type === 'USES'
          };
        });

        setNodes(formattedNodes);
        setEdges(formattedEdges);
      } else {
        setError(graphRes.error || 'Failed to load graph nodes.');
      }
    } catch (err) {
      setError(err.message || 'Error occurred fetching Knowledge Graph.');
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  // Rebuild Graph Trigger
  const handleRebuild = async () => {
    try {
      setLoading(true);
      setError('');
      const rebuildRes = await aiBuildGraph();
      if (rebuildRes.success) {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { message: 'Knowledge Graph rebuilt successfully.', type: 'success' }
        }));
        await loadGraphData();
      } else {
        setError(rebuildRes.error || 'Rebuild failed.');
      }
    } catch (err) {
      setError(err.message || 'Failed to rebuild Knowledge Graph.');
    } finally {
      setLoading(false);
    }
  };

  // Node Click Selector
  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node.data.raw);
  }, []);

  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  const onNodeMouseEnter = useCallback((event, node) => {
    setHoveredNodeId(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const handleTypeToggle = (type) => {
    setSelectedTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };

  // Filtered nodes & edges list computed on options changes
  const { filteredNodes, filteredEdges } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    
    // Determine neighbor matches when hovering a node
    const activeNeighbors = new Set();
    if (hoveredNodeId) {
      activeNeighbors.add(hoveredNodeId);
      edges.forEach(edge => {
        if (edge.source === hoveredNodeId) activeNeighbors.add(edge.target);
        if (edge.target === hoveredNodeId) activeNeighbors.add(edge.source);
      });
    }

    const visibleNodes = nodes.map(node => {
      const raw = node.data.raw;
      const typeMatch = selectedTypes[raw.type] !== false;
      const searchMatch = !q || raw.name.toLowerCase().includes(q) || raw.type.toLowerCase().includes(q) || raw.id.toLowerCase().includes(q);
      const isVisible = typeMatch && searchMatch;

      // Dynamic opacity styling for hovered connection highlighting
      let opacity = 1;
      if (isVisible && hoveredNodeId) {
        if (!activeNeighbors.has(node.id)) {
          opacity = 0.2;
        }
      }

      return {
        ...node,
        style: {
          ...node.style,
          display: isVisible ? 'flex' : 'none',
          opacity
        }
      };
    });

    const visibleNodeIds = new Set(visibleNodes.filter(n => n.style.display !== 'none').map(n => n.id));
    const visibleEdges = edges.map(edge => {
      const isVisible = visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target);
      let opacity = 1;
      if (isVisible && hoveredNodeId) {
        const connectsHovered = edge.source === hoveredNodeId || edge.target === hoveredNodeId;
        opacity = connectsHovered ? 1 : 0.1;
      }
      return {
        ...edge,
        style: {
          ...edge.style,
          display: isVisible ? 'block' : 'none',
          opacity
        },
        labelStyle: {
          ...edge.labelStyle,
          opacity
        },
        labelBgStyle: {
          ...edge.labelBgStyle,
          opacity
        }
      };
    });

    return { 
      filteredNodes: visibleNodes.filter(n => n.style.display !== 'none'), 
      filteredEdges: visibleEdges.filter(e => e.style.display !== 'none') 
    };
  }, [nodes, edges, searchQuery, selectedTypes, hoveredNodeId]);

  const sizeMB = (graphStatus.sizeBytes / (1024 * 1024)).toFixed(2);

  return (
    <div className="knowledge-graph-page">
      {/* Breadcrumb — matches Git VC page pattern */}
      <div className="detail-topbar">
        <nav className="detail-breadcrumb" aria-label="Knowledge graph location">
          <span className="detail-breadcrumb-part">
            <button className="detail-breadcrumb-link" type="button" onClick={onBack}>Notes</button>
            <span className="detail-breadcrumb-separator" aria-hidden="true">/</span>
          </span>
          <span className="detail-breadcrumb-current">Knowledge Graph</span>
        </nav>
      </div>

      <div className="knowledge-graph-container">
        <div className="kg-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', height: '52px', boxSizing: 'border-box' }}>
          <div className="kg-search-wrapper" style={{ height: '32px' }}>
            <Search size={16} className="kg-search-icon" />
            <input
              type="text"
              className="kg-search-input"
              placeholder="Search entity or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ height: '32px', boxSizing: 'border-box' }}
            />
          </div>

          {/* Unified Model & DB Status details pill in header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', background: 'var(--surface-muted)', border: '1px solid var(--border-soft)', padding: '0 12px', borderRadius: '6px', color: 'var(--text-secondary)', marginLeft: 'auto', height: '32px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Provider:</span>
              <strong style={{ color: 'var(--text-strong)' }}>{preferences.graphProvider === 'local' ? 'Local' : 'Cloud'}</strong>
            </div>
            <span style={{ width: '1px', height: '10px', background: 'var(--border-soft)' }}></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Model:</span>
              <strong style={{ color: 'var(--text-strong)' }}>{preferences.graphProvider === 'local' ? 'Qwen2.5-0.5B' : preferences.aiProvider}</strong>
            </div>
            <span style={{ width: '1px', height: '10px', background: 'var(--border-soft)' }}></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>DB Size:</span>
              <strong style={{ color: 'var(--text-strong)' }}>{sizeMB} MB</strong>
            </div>
            <span style={{ width: '1px', height: '10px', background: 'var(--border-soft)' }}></span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: preferences.graphProvider !== 'local' || modelStatus.downloaded ? 'var(--status-success-text)' : 'var(--text-warning)' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: preferences.graphProvider !== 'local' || modelStatus.downloaded ? 'var(--status-success-border)' : 'var(--text-warning)' }}></span>
              {preferences.graphProvider !== 'local' ? 'Active' : modelStatus.downloaded ? 'Ready' : 'Missing'}
            </span>
          </div>

          <div className="kg-stats-pill" style={{ gap: '12px', display: 'flex', alignItems: 'center', height: '32px', boxSizing: 'border-box', margin: 0, padding: '0 12px' }}>
            <Database size={12} />
            <span>Nodes: {graphStatus.nodeCount} | Edges: {graphStatus.edgeCount}</span>
          </div>
        </div>

        <div className="kg-body">          {/* Sidebar Filters */}
          <div className="kg-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>

              {/* Entity Types Checklist (More Compact) */}
              <div className="kg-sidebar-section" style={{ background: 'var(--surface-elevated)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>
                  <Layers size={12} />
                  Entity Types
                </h4>
                <div className="kg-filters-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {Object.keys(selectedTypes).map((type) => {
                    const color = TYPE_COLORS[type] || DEFAULT_COLOR;
                    const displayName = type === 'Note' ? 'Notes' : 
                                      type === 'Person' ? 'People' :
                                      type === 'Technology' ? 'Technologies' :
                                      type === 'Company' ? 'Companies' :
                                      type === 'Concept' ? 'Concepts' :
                                      type === 'Task' ? 'Tasks' : `${type}s`;
                    return (
                      <label key={type} className="kg-filter-checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', color: 'var(--text-secondary)', padding: '2px 0' }}>
                        <input
                          type="checkbox"
                          checked={selectedTypes[type]}
                          onChange={() => handleTypeToggle(type)}
                          style={{
                            accentColor: color.border,
                            width: '12px',
                            height: '12px',
                            cursor: 'pointer'
                          }}
                        />
                        <span className="kg-filter-color-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: color.border }}></span>
                        <span style={{ fontWeight: selectedTypes[type] ? 600 : 400, color: selectedTypes[type] ? 'var(--text-strong)' : 'var(--text-secondary)' }}>{displayName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Extraction Logs Panel (Last 10) */}
              <div className="kg-sidebar-section" style={{ background: 'var(--surface-elevated)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>
                  Extraction Logs
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
                  {graphLogs.length > 0 ? (
                    graphLogs.slice(0, 10).map((log, i) => (
                      <div key={log.id || i} style={{ color: log.level === 'error' ? 'var(--text-danger)' : 'var(--text-secondary)', lineHeight: 1.3 }}>
                        <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        {log.message}
                      </div>
                    ))
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No extraction logs yet.</span>
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

            {/* Sticky Actions Panel (Matching Embeddings) */}
            <div className="kg-sidebar-section" style={{ background: 'var(--surface-elevated)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="btn btn-secondary btn-icon-label"
                onClick={handleRebuild}
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', height: '32px', fontSize: '11px' }}
              >
                <RefreshCw size={12} className={loading ? 'spin' : ''} />
                <span>Rebuild Knowledge Graph</span>
              </button>

              <button
                className="btn btn-secondary"
                onClick={async () => {
                  if (window.confirm('Clear all Knowledge Graph entities and relationships from cache?')) {
                    await aiClearGraphData();
                    loadGraphData();
                  }
                }}
                style={{ width: '100%', justifyContent: 'center', height: '28px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-danger)' }}
              >
                <span>Clear Knowledge Graph Data</span>
              </button>
            </div>

            {/* Node Details Sidebar */}
            {selectedNode && (
              <div className="kg-details-card animate-fade-in">
                <div className="kg-details-head">
                  <h4>Entity Details</h4>
                  <button className="kg-details-close" onClick={() => setSelectedNode(null)}>✕</button>
                </div>
                <div className="kg-details-body">
                  <div className="kg-detail-row">
                    <span className="label">Name</span>
                    <strong>{selectedNode.name}</strong>
                  </div>
                  <div className="kg-detail-row">
                    <span className="label">Category</span>
                    <span className="kg-category-badge" style={{
                      background: (TYPE_COLORS[selectedNode.type] || DEFAULT_COLOR).background,
                      border: `1px solid ${(TYPE_COLORS[selectedNode.type] || DEFAULT_COLOR).border}`,
                      color: (TYPE_COLORS[selectedNode.type] || DEFAULT_COLOR).text,
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 600
                    }}>
                      {selectedNode.type}
                    </span>
                  </div>
                  {selectedNode.note_path && (
                    <div className="kg-detail-row" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                      <button
                        className="btn btn-primary"
                        onClick={async () => {
                          try {
                            const { appOpenNote } = await import('../services/electronService');
                            if (typeof appOpenNote === 'function') {
                              await appOpenNote(selectedNode.note_path);
                            } else {
                              // Fallback dispatch if exposed differently
                              window.dispatchEvent(new CustomEvent('app:open-note', { detail: { path: selectedNode.note_path } }));
                            }
                            if (onBack) onBack(); // Return to editor view
                          } catch (err) {
                            console.error('[KG] Failed to open note:', err);
                          }
                        }}
                        style={{ width: '100%', padding: '6px 12px', fontSize: '11px', display: 'flex', justifyContent: 'center', height: '32px' }}
                      >
                        Open Note
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* React Flow Graph Visualizer */}
          <div className="kg-canvas-wrapper" style={{ flex: 1, height: '100%', position: 'relative' }}>
            {error && (
              <div className="kg-error-overlay">
                <ShieldAlert size={20} />
                <p>{error}</p>
                <button className="btn btn-secondary btn-sm" onClick={loadGraphData}>Retry</button>
              </div>
            )}

            <ReactFlow
              nodes={filteredNodes}
              edges={filteredEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              fitView
              style={{ width: '100%', height: '100%', background: 'var(--app-bg)' }}
            >
              <Controls style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-default)', color: 'var(--text-strong)' }} />
              <Background color="var(--border-default)" gap={24} size={1.5} />
            </ReactFlow>
          </div>
        </div>
      </div>
    </div>
  );
}
