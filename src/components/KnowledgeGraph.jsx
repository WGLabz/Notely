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
import { Search, RefreshCw, Layers, ShieldAlert, Database, Pause, Play, CheckSquare, Square, Trash2, RotateCw } from 'lucide-react';
import {
  aiGetGraph,
  aiBuildGraph,
  aiGetGraphStatus,
  aiGetLogs,
  aiClearGraphData,
  aiGetPreferences,
  aiGetGraphModelStatus,
  aiPauseGraphWorker,
  aiResumeGraphWorker,
  onGraphProgress
} from '../services/electronService';
import { OverlayDialog } from './OverlayDialog';

import * as d3Force from 'd3-force';
import '../styles/KnowledgeGraph.css';

// Custom Node component
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

const TYPE_COLORS = {
  Note: { background: 'var(--kg-note-bg)', border: 'var(--kg-note-border)', text: 'var(--kg-note-border)' },
  Person: { background: 'var(--kg-person-bg)', border: 'var(--kg-person-border)', text: 'var(--kg-person-border)' },
  Project: { background: 'var(--kg-project-bg)', border: 'var(--kg-project-border)', text: 'var(--kg-project-border)' },
  Technology: { background: 'var(--kg-tech-bg)', border: 'var(--kg-tech-border)', text: 'var(--kg-tech-border)' },
  Company: { background: 'var(--kg-company-bg)', border: 'var(--kg-company-border)', text: 'var(--kg-company-border)' },
  Concept: { background: 'var(--kg-concept-bg)', border: 'var(--kg-concept-border)', text: 'var(--kg-concept-border)' },
  Task: { background: 'var(--kg-task-bg)', border: 'var(--kg-task-border)', text: 'var(--kg-task-border)' },
  Image: { background: 'var(--kg-image-bg)', border: 'var(--kg-image-border)', text: 'var(--kg-image-border)' },
  Document: { background: 'var(--kg-doc-bg)', border: 'var(--kg-doc-border)', text: 'var(--kg-doc-border)' },
  ExternalURL: { background: 'var(--kg-url-bg)', border: 'var(--kg-url-border)', text: 'var(--kg-url-border)' }
};

const DEFAULT_COLOR = { background: 'var(--kg-default-bg)', border: 'var(--kg-default-border)', text: 'var(--text-strong)' };

const RELATIONSHIP_COLORS = {
  // Semantic / LLM Relationships
  DEPENDS_ON: '#f59e0b',       // Amber
  USES: '#06b6d4',             // Cyan
  REFERENCES: '#6366f1',       // Indigo
  CONTAINS: '#10b981',         // Emerald
  HAS: '#10b981',              // Emerald
  MENTIONS: '#8b5cf6',         // Purple
  CREATED_BY: '#f43f5e',       // Rose
  OWNED_BY: '#f43f5e',         // Rose

  // Structural Note Graph Relationships
  LINKS_TO: '#6366f1',         // Indigo
  TAGGED: '#ec4899',           // Pink
  CONTAINS_MEDIA: '#10b981',   // Emerald
  REFERENCES_URL: '#3b82f6',   // Blue
  ATTACHES_FILE: '#eab308',    // Yellow
  CONTAINS_CODE: '#06b6d4',    // Cyan
  CONTAINS_SECTION: '#14b8a6', // Teal
  EMPHASIZES: '#f97316',       // Orange
  REFERENCES_CODE: '#0284c7',  // Sky Blue
  HAS_CALLOUT: '#a855f7',      // Violet
  CONTAINS_FORMULA: '#d946ef', // Fuchsia
  HAS_OPEN_TASK: '#ef4444',    // Red
  HAS_COMPLETED_TASK: '#22c55e',// Green
  MENTIONS_NOTE: '#8b5cf6',    // Purple
  RELATED_TO: '#8b5cf6',       // Purple
  DEFAULT: '#06b6d4'           // Vibrant Cyan fallback
};

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
  const [graphStatus, setGraphStatus] = useState({ nodeCount: 0, edgeCount: 0, sizeBytes: 0, isBuilding: false, isPaused: false, current: 0, total: 0, progress: 0, noteName: '' });
  const [selectedNode, setSelectedNode] = useState(null);
  const [graphLogs, setGraphLogs] = useState([]);
  const [preferences, setPreferences] = useState({
    graphProvider: 'local'
  });
  const [modelStatus, setModelStatus] = useState({
    downloaded: false,
    isDownloading: false,
    progress: 0
  });
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);

  // Force Layout State
  const [chargeStrength] = useState(-280);
  const [linkDistance] = useState(150);
  const [collideRadius] = useState(80);

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
        setGraphStatus(prev => ({ ...prev, ...statusRes.data }));
      }

      if (graphRes.success && graphRes.data) {
        const { entities, relationships } = graphRes.data;

        const degrees = {};
        entities.forEach(e => { degrees[e.id] = 0; });
        relationships.forEach(rel => {
          if (degrees[rel.source_id] !== undefined) degrees[rel.source_id]++;
          if (degrees[rel.target_id] !== undefined) degrees[rel.target_id]++;
        });

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

        const nodeCount = forceNodes.length;
        const dynamicDistance = Math.max(100, Math.min(300, linkDistance + (nodeCount > 50 ? 40 : 0)));
        const dynamicCharge = Math.min(-150, chargeStrength - (nodeCount > 50 ? 120 : 0));
        const dynamicCollision = Math.max(50, collideRadius + (nodeCount > 50 ? 15 : 0));

        const simulation = d3Force.forceSimulation(forceNodes)
          .force('link', d3Force.forceLink(forceLinks).id(d => d.id).distance(dynamicDistance))
          .force('charge', d3Force.forceManyBody().strength(dynamicCharge))
          .force('center', d3Force.forceCenter(400, 350))
          .force('collision', d3Force.forceCollide().radius(dynamicCollision))
          .stop();

        for (let i = 0; i < 40; i++) simulation.tick();

        forceNodes.forEach(node => {
          if (isNaN(node.x) || typeof node.x !== 'number') node.x = Math.random() * 500;
          if (isNaN(node.y) || typeof node.y !== 'number') node.y = Math.random() * 500;
        });

        const formattedNodes = forceNodes.map(node => {
          const entity = node.entity;
          const degree = degrees[entity.id] || 0;
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
          const relTypeUpper = String(rel.type || 'RELATION').toUpperCase();
          const relColor = RELATIONSHIP_COLORS[relTypeUpper] || RELATIONSHIP_COLORS.DEFAULT;
          return {
            id: `edge-${rel.id}-${rel.source_id}-${rel.target_id}`,
            source: rel.source_id,
            target: rel.target_id,
            label: rel.type,
            type: 'smoothstep',
            style: { stroke: relColor, strokeWidth: 1.8, transition: 'opacity var(--motion-standard)' },
            labelStyle: { fill: 'var(--text-strong)', fontSize: 8, fontWeight: 700 },
            labelBgStyle: { fill: 'var(--surface-bg)', stroke: relColor, strokeWidth: 1, fillOpacity: 0.95 },
            labelBgPadding: [3, 5],
            labelBgBorderRadius: 4,
            markerEnd: { type: 'arrowclosed', color: relColor, width: 12, height: 12 },
            animated: relTypeUpper === 'DEPENDS_ON' || relTypeUpper === 'USES'
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
  }, [setNodes, setEdges, chargeStrength, linkDistance, collideRadius]);

  useEffect(() => {
    loadModelAndPrefs();
    loadGraphData();
  }, [loadModelAndPrefs, loadGraphData]);

  useEffect(() => {
    const unsubscribe = onGraphProgress((payload) => {
      if (payload) {
        setGraphStatus(prev => ({ ...prev, ...payload }));
        
        // Refresh logs in real-time on progress events
        aiGetLogs('graph', 50).then((logsRes) => {
          if (logsRes && logsRes.success && Array.isArray(logsRes.data)) {
            setGraphLogs(logsRes.data);
          }
        }).catch(() => {});

        if (!payload.isBuilding && isRebuilding) {
          setIsRebuilding(false);
          setShowProgressModal(false);
          window.dispatchEvent(new CustomEvent('app:toast', {
            detail: { message: 'Knowledge Graph successfully rebuilt.', type: 'success' }
          }));
          loadGraphData();
        }
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [isRebuilding, loadGraphData]);

  const handlePauseResume = async () => {
    try {
      if (graphStatus.isPaused) {
        await aiResumeGraphWorker();
        setGraphStatus(prev => ({ ...prev, isPaused: false }));
      } else {
        await aiPauseGraphWorker();
        setGraphStatus(prev => ({ ...prev, isPaused: true }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRebuild = async () => {
    try {
      setError('');
      setIsRebuilding(true);
      setGraphStatus(prev => ({ ...prev, isBuilding: true, current: 0, noteName: 'Initializing ModernBERT worker...' }));
      const rebuildRes = await aiBuildGraph();
      if (!rebuildRes.success) {
        setError(rebuildRes.error || 'Rebuild failed.');
        setIsRebuilding(false);
        setGraphStatus(prev => ({ ...prev, isBuilding: false }));
      }
    } catch (err) {
      setError(err.message || 'Failed to rebuild Knowledge Graph.');
      setIsRebuilding(false);
      setGraphStatus(prev => ({ ...prev, isBuilding: false }));
    }
  };

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node.data.raw);
  }, []);

  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const onNodeMouseEnter = useCallback((event, node) => setHoveredNodeId(node.id), []);
  const onNodeMouseLeave = useCallback(() => setHoveredNodeId(null), []);

  const handleTypeToggle = (type) => {
    setSelectedTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const { filteredNodes, filteredEdges } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
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

      let opacity = 1;
      if (isVisible && hoveredNodeId) {
        if (!activeNeighbors.has(node.id)) opacity = 0.2;
      }

      return {
        ...node,
        style: { ...node.style, display: isVisible ? 'flex' : 'none', opacity }
      };
    });

    const visibleNodeIds = new Set(visibleNodes.filter(n => n.style.display !== 'none').map(n => n.id));
    const visibleEdges = edges
      .filter(edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
      .map(edge => {
        let opacity = 1;
        if (hoveredNodeId) {
          const connectsHovered = edge.source === hoveredNodeId || edge.target === hoveredNodeId;
          opacity = connectsHovered ? 1 : 0.15;
        }
        return {
          ...edge,
          style: { ...edge.style, opacity },
          labelStyle: { ...edge.labelStyle, opacity },
          labelBgStyle: { ...edge.labelBgStyle, opacity }
        };
      });

    return {
      filteredNodes: visibleNodes.filter(n => n.style.display !== 'none'),
      filteredEdges: visibleEdges
    };
  }, [nodes, edges, searchQuery, selectedTypes, hoveredNodeId]);

  const sizeMB = (graphStatus.sizeBytes / (1024 * 1024)).toFixed(2);

  return (
    <div className="knowledge-graph-page">
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
        {/* Header Bar with Live Top Progress Banner when Building */}
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

          {/* Real-time Top Building Progress Indicator */}
          {graphStatus.isBuilding ? (
            <div
              onClick={() => setShowProgressModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'var(--surface-muted)',
                border: '1px solid var(--accent-solid)',
                padding: '0 12px',
                borderRadius: '6px',
                fontSize: '11px',
                color: 'var(--text-strong)',
                marginLeft: 'auto',
                height: '32px',
                cursor: 'pointer',
                boxSizing: 'border-box'
              }}
              title="Click to view detailed extraction log"
            >
              <RefreshCw size={12} className="spin" style={{ color: 'var(--accent-solid)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600 }}>{graphStatus.noteName || 'Extracting graph...'}</span>
                <div style={{ width: '120px', height: '3px', background: 'var(--border-soft)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${graphStatus.progress || 0}%`, height: '100%', background: 'var(--accent-solid)', transition: 'width 0.2s ease' }} />
                </div>
              </div>
              <span style={{ fontWeight: 700, fontSize: '10px', color: 'var(--accent-solid)' }}>{graphStatus.progress || 0}%</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', background: 'var(--surface-muted)', border: '1px solid var(--border-soft)', padding: '0 12px', borderRadius: '6px', color: 'var(--text-secondary)', marginLeft: 'auto', height: '32px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Engine:</span>
                <strong style={{ color: 'var(--text-strong)' }}>{preferences.graphProvider === 'local' ? 'ModernBERT 2-Model' : 'Cloud LLM'}</strong>
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
          )}

          <div className="kg-stats-pill" style={{ gap: '12px', display: 'flex', alignItems: 'center', height: '32px', boxSizing: 'border-box', margin: 0, padding: '0 12px' }}>
            <Database size={12} />
            <span>Nodes: {graphStatus.nodeCount} | Edges: {graphStatus.edgeCount}</span>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handlePauseResume}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '32px', padding: '0 10px', fontSize: '11px' }}
          >
            {graphStatus.isPaused ? <Play size={12} /> : <Pause size={12} />}
            <span>{graphStatus.isPaused ? 'Resume Worker' : 'Pause Worker'}</span>
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={loadGraphData}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '32px', padding: '0 10px', fontSize: '11px' }}
            title="Reload Knowledge Graph data from cache"
          >
            <RotateCw size={12} className={loading ? 'spin' : ''} />
            <span>Reload Data</span>
          </button>
        </div>

        {/* Main Body */}
        <div className="kg-body">
          {/* Sidebar */}
          <div className="kg-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
            <div className="kg-sidebar-section-scroll" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px' }}>
              {/* Entity Types Checklist */}
              <div className="kg-sidebar-section" style={{ background: 'var(--surface-elevated)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>
                    <Layers size={11} />
                    Entity Types
                  </h4>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className="btn btn-tertiary"
                      onClick={() => {
                        const typesInGraph = new Set(nodes.map(n => n.data?.raw?.type || 'Entity'));
                        const allKnown = new Set([...Object.keys(TYPE_COLORS), ...typesInGraph]);
                        const next = {};
                        allKnown.forEach(k => { next[k] = true; });
                        setSelectedTypes(next);
                      }}
                      style={{ padding: '2px 5px', fontSize: '9px', height: '18px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                    >
                      <CheckSquare size={10} />
                      All
                    </button>
                    <button
                      className="btn btn-tertiary"
                      onClick={() => {
                        const typesInGraph = new Set(nodes.map(n => n.data?.raw?.type || 'Entity'));
                        const allKnown = new Set([...Object.keys(TYPE_COLORS), ...typesInGraph]);
                        const next = {};
                        allKnown.forEach(k => { next[k] = false; });
                        setSelectedTypes(next);
                      }}
                      style={{ padding: '2px 5px', fontSize: '9px', height: '18px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                    >
                      <Square size={10} />
                      None
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {(() => {
                    const getTypeColor = (type) => {
                      if (TYPE_COLORS[type]) return TYPE_COLORS[type];
                      let hash = 0;
                      for (let i = 0; i < type.length; i++) {
                        hash = (type.charCodeAt(i) + ((hash << 5) - hash)) | 0;
                      }
                      const hue = Math.abs(hash) % 360;
                      return {
                        background: `hsl(${hue}, 75%, 95%)`,
                        border: `hsl(${hue}, 70%, 45%)`,
                        text: `hsl(${hue}, 70%, 45%)`
                      };
                    };

                    const typesInGraph = new Set(nodes.map(n => n.data?.raw?.type || 'Entity'));
                    const allTypesSet = new Set([...Object.keys(TYPE_COLORS), ...typesInGraph]);
                    const activeTypes = Array.from(allTypesSet)
                      .filter(type => nodes.some(n => (n.data?.raw?.type || 'Entity') === type))
                      .sort((a, b) => {
                        const countA = nodes.filter(n => (n.data?.raw?.type || 'Entity') === a).length;
                        const countB = nodes.filter(n => (n.data?.raw?.type || 'Entity') === b).length;
                        return countB - countA;
                      });

                    if (activeTypes.length === 0) {
                      return <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No entities extracted yet.</span>;
                    }

                    return activeTypes.map(type => {
                      const color = getTypeColor(type);
                      const count = nodes.filter(n => (n.data?.raw?.type || 'Entity') === type).length;
                      return (
                        <label key={type} className="kg-filter-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', cursor: 'pointer', padding: '1px 0' }}>
                          <input
                            type="checkbox"
                            checked={selectedTypes[type] !== false}
                            onChange={() => handleTypeToggle(type)}
                          />
                          <span className="kg-filter-color-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: color.border }}></span>
                          <span style={{ fontWeight: selectedTypes[type] !== false ? 600 : 400, color: selectedTypes[type] !== false ? 'var(--text-strong)' : 'var(--text-secondary)' }}>{type} ({count})</span>
                        </label>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Compact Relationship & Arrow Legend */}
              <div className="kg-sidebar-section" style={{ background: 'var(--surface-elevated)', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>
                    Arrow & Colors
                  </h4>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '9px', fontFamily: 'monospace', background: 'var(--surface-muted)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}>
                    <span>Source</span>
                    <span style={{ color: 'var(--accent-solid)', fontWeight: 'bold' }}>──►</span>
                    <span>Target</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 6px', marginTop: '2px' }}>
                  {[
                    { label: 'LINKS', color: RELATIONSHIP_COLORS.LINKS_TO },
                    { label: 'DEPENDS', color: RELATIONSHIP_COLORS.DEPENDS_ON },
                    { label: 'USES', color: RELATIONSHIP_COLORS.USES },
                    { label: 'CONTAINS', color: RELATIONSHIP_COLORS.CONTAINS },
                    { label: 'MENTIONS', color: RELATIONSHIP_COLORS.MENTIONS_NOTE },
                    { label: 'TAGGED', color: RELATIONSHIP_COLORS.TAGGED },
                    { label: 'URL', color: RELATIONSHIP_COLORS.REFERENCES_URL },
                  ].map(item => (
                    <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontWeight: 600, padding: '2px 5px', borderRadius: '4px', background: `${item.color}15`, border: `1px solid ${item.color}45`, color: 'var(--text-strong)' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.color, display: 'inline-block' }} />
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Extraction Logs Panel */}
              <div className="kg-sidebar-section" style={{ background: 'var(--surface-elevated)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>
                  Extraction Logs
                </h4>
                <div style={{
                  background: 'var(--surface-muted)',
                  borderRadius: '4px',
                  padding: '6px',
                  border: '1px solid var(--border-soft)',
                  fontFamily: 'monospace',
                  fontSize: '9px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px'
                }}>
                  {graphLogs.length > 0 ? (
                    graphLogs.slice(0, 10).map((logItem, i) => (
                      <div key={logItem.id || i} style={{ color: logItem.level === 'error' ? 'var(--text-danger)' : 'var(--text-secondary)', lineHeight: 1.3 }}>
                        <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>[{new Date(logItem.timestamp).toLocaleTimeString()}]</span>
                        {logItem.message}
                      </div>
                    ))
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No logs yet.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions Panel - Rebuild & Clear on single row */}
            <div className="kg-sidebar-section" style={{ background: 'var(--surface-elevated)', padding: '10px', borderTop: '1px solid var(--border-soft)', display: 'flex', gap: '6px' }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleRebuild}
                disabled={loading || graphStatus.isBuilding}
                style={{ flex: 1, justifyContent: 'center', height: '26px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', padding: '0 6px' }}
              >
                <RefreshCw size={11} className={graphStatus.isBuilding ? 'spin' : ''} />
                <span>{graphStatus.isBuilding ? 'Building...' : 'Rebuild'}</span>
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  if (window.confirm('Clear all Knowledge Graph entities and relationships from cache?')) {
                    await aiClearGraphData();
                    loadGraphData();
                  }
                }}
                style={{ flex: 1, justifyContent: 'center', height: '26px', fontSize: '10px', color: 'var(--text-danger)', display: 'flex', alignItems: 'center', gap: '4px', padding: '0 6px' }}
              >
                <Trash2 size={11} />
                <span>Clear Data</span>
              </button>
            </div>

            {/* Selected Node Inspector */}
            {selectedNode && (
              <div className="kg-details-card animate-fade-in" style={{ marginTop: '12px' }}>
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
                              window.dispatchEvent(new CustomEvent('app:open-note', { detail: { path: selectedNode.note_path } }));
                            }
                            if (onBack) onBack();
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

          {/* Full-Height Graph Canvas Viewport */}
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

      {/* Progress Modal */}
      {showProgressModal && (
        <OverlayDialog
          open={showProgressModal}
          onClose={() => setShowProgressModal(false)}
          title="Rebuilding Knowledge Graph"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', minWidth: '420px', padding: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span>{graphStatus.noteName || 'Extracting entities & relations...'}</span>
              <strong style={{ color: 'var(--brand-primary)' }}>{graphStatus.progress || 0}%</strong>
            </div>

            <div style={{ width: '100%', height: '8px', background: 'var(--border-soft)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${graphStatus.progress || 0}%`, height: '100%', background: 'var(--accent-solid)', transition: 'width 0.2s ease' }} />
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Processed: {graphStatus.current} / {graphStatus.total} notes
            </div>

            <div style={{ marginTop: '8px', maxHeight: '160px', overflowY: 'auto', background: 'var(--surface-muted)', border: '1px solid var(--border-soft)', borderRadius: '6px', padding: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', color: 'var(--text-muted)' }}>Recent Extraction Logs:</div>
              {graphLogs.slice(-6).map((logItem, idx) => (
                <div key={idx} style={{ fontSize: '10px', color: 'var(--text-secondary)', padding: '2px 0' }}>
                  [{new Date(logItem.timestamp).toLocaleTimeString()}] {logItem.message}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowProgressModal(false)}
              >
                Hide Modal (Run in Background)
              </button>
            </div>
          </div>
        </OverlayDialog>
      )}
    </div>
  );
}
