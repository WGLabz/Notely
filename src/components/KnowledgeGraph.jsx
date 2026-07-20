import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search, RefreshCw, Layers, ShieldAlert, Database } from 'lucide-react';
import { aiGetGraph, aiBuildGraph, aiGetGraphStatus } from '../services/electronService';

import dagre from 'dagre';
import '../styles/KnowledgeGraph.css';

// Curated node colors matching premium design system
// Light/Dark mode compatible high-contrast text and border colors using CSS variables
const TYPE_COLORS = {
  Note: { background: 'var(--kg-note-bg)', border: 'var(--kg-note-border)', text: 'var(--kg-note-border)' },
  Person: { background: 'var(--kg-person-bg)', border: 'var(--kg-person-border)', text: 'var(--kg-person-border)' },
  Project: { background: 'var(--kg-project-bg)', border: 'var(--kg-project-border)', text: 'var(--kg-project-border)' },
  Technology: { background: 'var(--kg-tech-bg)', border: 'var(--kg-tech-border)', text: 'var(--kg-tech-border)' },
  Company: { background: 'var(--kg-company-bg)', border: 'var(--kg-company-border)', text: 'var(--kg-company-border)' },
  Concept: { background: 'var(--kg-concept-bg)', border: 'var(--kg-concept-border)', text: 'var(--kg-concept-border)' },
  Task: { background: 'var(--kg-task-bg)', border: 'var(--kg-task-border)', text: 'var(--kg-task-border)' }
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
    Task: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [graphStatus, setGraphStatus] = useState({ nodeCount: 0, edgeCount: 0, sizeBytes: 0 });
  const [selectedNode, setSelectedNode] = useState(null);

  // Load Graph Data
  const loadGraphData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const graphRes = await aiGetGraph();
      const statusRes = await aiGetGraphStatus();

      if (statusRes.success && statusRes.data) {
        setGraphStatus(statusRes.data);
      }

      if (graphRes.success && graphRes.data) {
        const { entities, relationships } = graphRes.data;

        // 1. Separate connected nodes from non-referenced (isolated) nodes
        const referencedNodeIds = new Set();
        relationships.forEach(rel => {
          referencedNodeIds.add(rel.source_id);
          referencedNodeIds.add(rel.target_id);
        });

        const connectedEntities = [];
        const isolatedEntities = [];

        entities.forEach(entity => {
          if (referencedNodeIds.has(entity.id)) {
            connectedEntities.push(entity);
          } else {
            isolatedEntities.push(entity);
          }
        });

        // 2. Use dagre to layout the connected graph automatically
        const g = new dagre.graphlib.Graph();
        g.setGraph({ rankdir: 'LR', align: 'DL', nodesep: 60, edgesep: 40, ranksep: 180 });
        g.setDefaultEdgeLabel(() => ({}));

        // Set connected nodes inside dagre graph
        connectedEntities.forEach(entity => {
          g.setNode(entity.id, { width: 120, height: 60 });
        });

        // Set relationships inside dagre graph
        relationships.forEach(rel => {
          if (g.hasNode(rel.source_id) && g.hasNode(rel.target_id)) {
            g.setEdge(rel.source_id, rel.target_id);
          }
        });

        // Execute layout algorithm
        dagre.layout(g);

        // 3. Format nodes list
        const formattedNodes = [];

        // Build layed-out connected nodes
        connectedEntities.forEach(entity => {
          const dagreNode = g.node(entity.id);
          const typeColors = TYPE_COLORS[entity.type] || DEFAULT_COLOR;

          formattedNodes.push({
            id: entity.id,
            type: 'default',
            data: {
              label: (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                  <span style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, color: typeColors.border }}>{entity.type}</span>
                  <span style={{ fontWeight: 600, fontSize: '11px', color: 'var(--text-strong)', lineHeight: 1.2 }}>{entity.name}</span>
                </div>
              ),
              raw: entity
            },
            position: { x: dagreNode.x, y: dagreNode.y },
            style: {
              background: typeColors.background,
              border: `1.5px solid ${typeColors.border}`,
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '11px',
              boxShadow: `0 0 8px ${typeColors.border}15, var(--shadow-sm)`,
              width: 120,
              textAlign: 'center',
            }
          });
        });

        // 4. Place isolated (non-referenced) nodes neatly aside in their own vertical list (left side offset)
        isolatedEntities.forEach((entity, index) => {
          const typeColors = TYPE_COLORS[entity.type] || DEFAULT_COLOR;
          // Place in an isolated column on the left (e.g. X = -200) spaced cleanly vertically
          const x = -200;
          const y = 80 + index * 100;

          formattedNodes.push({
            id: entity.id,
            type: 'default',
            data: {
              label: (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                  <span style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, color: typeColors.border }}>{entity.type}</span>
                  <span style={{ fontWeight: 600, fontSize: '11px', color: 'var(--text-strong)', lineHeight: 1.2 }}>{entity.name}</span>
                </div>
              ),
              raw: entity
            },
            position: { x, y },
            style: {
              background: typeColors.background,
              border: `1.5px dashed ${typeColors.border}`, // dashed border indicates isolated/unreferenced node
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '11px',
              boxShadow: 'var(--shadow-sm)',
              width: 120,
              textAlign: 'center',
              opacity: 0.85
            }
          });
        });

        const formattedEdges = relationships.map((rel) => {
          const edgeColor = 'var(--text-subtle)';
          return {
            id: `edge-${rel.id}-${rel.source_id}-${rel.target_id}`,
            source: rel.source_id,
            target: rel.target_id,
            label: rel.type,
            type: 'smoothstep',
            style: { stroke: 'var(--border-soft)', strokeWidth: 1.5 },
            labelStyle: { fill: 'var(--text-strong)', fontSize: 8, fontWeight: 700 },
            labelBgStyle: { fill: 'var(--surface-bg)', stroke: 'var(--border-default)', strokeWidth: 1, fillOpacity: 1 },
            labelBgPadding: [4, 6],
            labelBgBorderRadius: 4,
            markerEnd: { type: 'arrowclosed', color: edgeColor, width: 14, height: 14 },
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

  const handleTypeToggle = (type) => {
    setSelectedTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };

  // Filtered nodes & edges list computed on options changes
  const { filteredNodes, filteredEdges } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const visibleNodes = nodes.filter(node => {
      const raw = node.data.raw;
      const typeMatch = selectedTypes[raw.type] !== false;
      const searchMatch = !q || raw.name.toLowerCase().includes(q) || raw.type.toLowerCase().includes(q) || raw.id.toLowerCase().includes(q);
      return typeMatch && searchMatch;
    });

    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = edges.filter(edge => {
      return visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target);
    });

    return { filteredNodes: visibleNodes, filteredEdges: visibleEdges };
  }, [nodes, edges, searchQuery, selectedTypes]);

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
        <div className="kg-header-actions">
          <div className="kg-search-wrapper">
            <Search size={16} className="kg-search-icon" />
            <input
              type="text"
              className="kg-search-input"
              placeholder="Search entity or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="kg-stats-pill">
            <Database size={12} />
            <span>Nodes: {graphStatus.nodeCount} | Edges: {graphStatus.edgeCount} | {sizeMB} MB</span>
          </div>
        </div>

        <div className="kg-body">
          {/* Sidebar Filters */}
          <div className="kg-sidebar">
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div className="kg-sidebar-section">
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
                  <Layers size={12} />
                  Entity Types
                </h4>
                <div className="kg-filters-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Object.keys(selectedTypes).map((type) => {
                    const color = TYPE_COLORS[type] || DEFAULT_COLOR;
                    // Format plural names correctly
                    const displayName = type === 'Note' ? 'Notes' : 
                                      type === 'Person' ? 'People' :
                                      type === 'Technology' ? 'Technologies' :
                                      type === 'Company' ? 'Companies' :
                                      type === 'Concept' ? 'Concepts' :
                                      type === 'Task' ? 'Tasks' : `${type}s`;
                    return (
                      <label key={type} className="kg-filter-checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={selectedTypes[type]}
                          onChange={() => handleTypeToggle(type)}
                          style={{
                            accentColor: color.border,
                            width: '14px',
                            height: '14px',
                            cursor: 'pointer'
                          }}
                        />
                        <span className="kg-filter-color-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: color.border }}></span>
                        <span style={{ fontWeight: selectedTypes[type] ? 600 : 400, color: selectedTypes[type] ? 'var(--text-strong)' : 'var(--text-secondary)' }}>{displayName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Relationship Lines Legend */}
              <div className="kg-sidebar-section" style={{ borderTop: '1px solid var(--border-default)', paddingTop: '16px' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
                  Relation Lines
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', width: '32px', height: '8px' }}>
                      <div style={{ width: '100%', height: '2px', borderTop: '2px dashed var(--border-soft)' }}></div>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Active flow (dashed)
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', width: '32px', height: '8px' }}>
                      <div style={{ width: '100%', height: '2px', background: 'var(--border-soft)' }}></div>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Standard relation (solid)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Rebuild Actions Panel */}
            <div className="kg-sidebar-section" style={{ borderTop: '1px solid var(--border-default)', padding: '16px', background: 'var(--surface-elevated)' }}>
              <button
                className="btn btn-secondary btn-icon-label"
                onClick={handleRebuild}
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', height: '36px' }}
              >
                <RefreshCw size={14} className={loading ? 'spin' : ''} />
                <span>Rebuild Knowledge Graph</span>
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
                    <div className="kg-detail-row">
                      <span className="label">File Path</span>
                      <code className="kg-path-code">{selectedNode.note_path}</code>
                    </div>
                  )}
                  {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                    <div className="kg-detail-row properties">
                      <span className="label">Attributes</span>
                      <pre className="kg-properties-json">
                        {JSON.stringify(selectedNode.properties, null, 2)}
                      </pre>
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
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
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
