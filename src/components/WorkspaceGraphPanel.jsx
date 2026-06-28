import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, RefreshCw, Zap } from "lucide-react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getSemanticGraph } from "../services/electronService.js";
import "./WorkspaceGraphPanel.css";

// ── Colour palette ────────────────────────────────────────────────────────────
const PALETTE = [
  "#a8d5ba", "#f4c7a8", "#aac4e0", "#e8b4b8", "#c5b8e8",
  "#f6e49a", "#b8dce8", "#e8d0a9", "#b8e8d0", "#e8c5b8",
  "#c8e8a8", "#e8b8d0", "#a8c8e8", "#e8e0a8", "#b8a8e8",
];

function folderColor(folder, folderIndex) {
  const idx = folderIndex % PALETTE.length;
  return PALETTE[idx];
}

const CLUSTER_COLORS = [
  "rgba(168, 213, 186, 0.08)", "rgba(244, 199, 168, 0.08)", "rgba(170, 196, 224, 0.08)",
  "rgba(232, 180, 184, 0.08)", "rgba(197, 184, 232, 0.08)", "rgba(246, 228, 154, 0.08)",
];

function clusterBgColor(idx) {
  return CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
}

// ── Custom node component ─────────────────────────────────────────────────────
function GraphNode({ data }) {
  const { label, color, selected, dimmed, nodeType } = data;
  const isMedia = nodeType === "media";
  
  return (
    <div
      className={`wgp-node${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}${isMedia ? " media-node" : ""}`}
      style={{ background: isMedia ? "rgba(200, 200, 200, 0.1)" : color, border: isMedia ? "1px dashed #999" : undefined }}
      title={isMedia ? `Media: ${label}` : label}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      {isMedia && <span style={{ marginRight: "4px", fontSize: "0.65em" }}>📎</span>}
      {label}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { graphNode: GraphNode };

// ── Layout: arrange nodes by folder in a grid ─────────────────────────────────
const NODE_WIDTH = 190;
const NODE_HEIGHT = 58;
const FOLDER_COLS = 4;
const H_GAP = 70;
const V_GAP = 50;
const FOLDER_H_GAP = 120;
const FOLDER_V_GAP = 140;

function computeLayout(rawNodes, folderColorMap) {
  // Group by folder
  const folderMap = new Map();
  for (const node of rawNodes) {
    const f = node.folder || ".";
    if (!folderMap.has(f)) folderMap.set(f, []);
    folderMap.get(f).push(node);
  }

  const folders = Array.from(folderMap.entries());
  const positioned = [];

  // Arrange folders left-to-right, then top-to-bottom
  // Each folder block occupies a grid cell in a layout-columns × ∞ grid
  const LAYOUT_COLS = Math.max(1, Math.ceil(Math.sqrt(folders.length)));

  // First pass: compute folder block heights
  const folderBlockHeights = folders.map(([, nodes]) => {
    const rows = Math.ceil(nodes.length / FOLDER_COLS);
    return rows * (NODE_HEIGHT + V_GAP) - V_GAP;
  });
  const folderBlockWidths = folders.map(([, nodes]) => {
    const cols = Math.min(nodes.length, FOLDER_COLS);
    return cols * (NODE_WIDTH + H_GAP) - H_GAP;
  });

  // Compute folder grid origins
  const cellW = Math.max(...folderBlockWidths, 0) + FOLDER_H_GAP;
  const rowHeights = [];
  for (let i = 0; i < folders.length; i++) {
    const row = Math.floor(i / LAYOUT_COLS);
    if (!rowHeights[row]) rowHeights[row] = 0;
    rowHeights[row] = Math.max(rowHeights[row], folderBlockHeights[i]);
  }

  const folderOrigins = folders.map(([, ], fi) => {
    const col = fi % LAYOUT_COLS;
    const row = Math.floor(fi / LAYOUT_COLS);
    let ox = col * cellW;
    let oy = 0;
    for (let r = 0; r < row; r++) {
      oy += (rowHeights[r] || 0) + FOLDER_V_GAP;
    }
    return { ox, oy };
  });

  for (let fi = 0; fi < folders.length; fi++) {
    const [folder, nodes] = folders[fi];
    const color = folderColorMap.get(folder) || PALETTE[0];
    const { ox, oy } = folderOrigins[fi];

    nodes.forEach((node, ni) => {
      const col = ni % FOLDER_COLS;
      const row = Math.floor(ni / FOLDER_COLS);
      positioned.push({
        id: node.id,
        type: "graphNode",
        position: {
          x: ox + col * (NODE_WIDTH + H_GAP),
          y: oy + row * (NODE_HEIGHT + V_GAP),
        },
        data: {
          label: node.label,
          color,
          filePath: node.filePath,
          folder: node.folder,
          relativePath: node.relativePath,
          nodeType: node.nodeType || "note",
          selected: false,
          dimmed: false,
        },
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });
  }

  return positioned;
}

// ── Semantic cluster visualization ────────────────────────────────────────────
function ClusterBackground({ clusters, nodes, clusterIdx }) {
  if (!clusters || !nodes || clusters.length === 0) return null;

  const cluster = clusters[clusterIdx];
  if (!cluster) return null;

  // Find bounding box of all cluster members
  const memberNodes = nodes.filter((n) => cluster.members.includes(n.id));
  if (memberNodes.length === 0) return null;

  const xs = memberNodes.map((n) => n.position.x);
  const ys = memberNodes.map((n) => n.position.y);
  const minX = Math.min(...xs) - 15;
  const minY = Math.min(...ys) - 15;
  const maxX = Math.max(...xs) + NODE_WIDTH + 15;
  const maxY = Math.max(...ys) + NODE_HEIGHT + 15;
  const width = maxX - minX;
  const height = maxY - minY;

  return (
    <div
      style={{
        position: "absolute",
        left: minX,
        top: minY,
        width,
        height,
        background: clusterBgColor(clusterIdx),
        border: `1px dashed rgba(100, 130, 140, 0.3)`,
        borderRadius: 4,
        pointerEvents: "none",
        zIndex: -1,
      }}
      title={`Semantic cluster: ${cluster.members.length} notes, strength ${(cluster.strength * 100).toFixed(0)}%`}
    />
  );
}

// ── Inner graph (needs ReactFlowProvider context) ─────────────────────────────
function GraphCanvas({ rawData, filter, onOpenDocument, clusters }) {
  const { fitView } = useReactFlow();
  const [selectedId, setSelectedId] = useState(null);
  const initialised = useRef(false);

  // Build folder → color map
  const folderColorMap = useMemo(() => {
    const folders = [...new Set((rawData?.nodes || []).map((n) => n.folder || "."))];
    const map = new Map();
    folders.forEach((f, i) => map.set(f, folderColor(f, i)));
    return map;
  }, [rawData]);

  // Filtered raw nodes
  const filteredRaw = useMemo(() => {
    if (!rawData?.nodes) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return rawData.nodes;
    return rawData.nodes.filter(
      (n) => n.label.toLowerCase().includes(q) || n.folder.toLowerCase().includes(q)
    );
  }, [rawData, filter]);

  const filteredIds = useMemo(() => new Set(filteredRaw.map((n) => n.id)), [filteredRaw]);

  // Build flow nodes
  const baseNodes = useMemo(() => computeLayout(filteredRaw, folderColorMap), [filteredRaw, folderColorMap]);

  // Build flow edges (only between visible nodes)
  const baseEdges = useMemo(() => {
    if (!rawData?.edges) return [];
    return rawData.edges
      .filter((e) => filteredIds.has(e.source) && filteredIds.has(e.target))
      .map((e) => ({
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#a0aca8" },
        style: { stroke: "#a0aca8", strokeWidth: 1.5 },
      }));
  }, [rawData, filteredIds]);

  const [nodes, setNodes, onNodesChange] = useNodesState(baseNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges);

  // Sync when filtered data changes
  useEffect(() => {
    setNodes(baseNodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        selected: n.id === selectedId,
        dimmed: selectedId ? n.id !== selectedId && !isConnectedTo(baseEdges, selectedId, n.id) : false,
      },
    })));
    setEdges(baseEdges.map((e) => ({
      ...e,
      style: selectedId
        ? (e.source === selectedId || e.target === selectedId)
          ? { stroke: "#2f5d62", strokeWidth: 2 }
          : { stroke: "#d0cbc0", strokeWidth: 1 }
        : { stroke: "#a0aca8", strokeWidth: 1.5 },
    })));
  }, [baseNodes, baseEdges, selectedId, setNodes, setEdges]);

  // Fit view when data first loads
  useEffect(() => {
    if (baseNodes.length && !initialised.current) {
      initialised.current = true;
      setTimeout(() => fitView({ padding: 0.1, duration: 300 }), 50);
    }
  }, [baseNodes.length, fitView]);

  const handleNodeClick = useCallback((_, node) => {
    setSelectedId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const handleNodeDoubleClick = useCallback((_, node) => {
    // Only open note files, not media
    if (node.data?.filePath && node.data?.nodeType !== 'media') {
      onOpenDocument(node.data.filePath);
    }
  }, [onOpenDocument]);

  const handlePaneClick = useCallback(() => setSelectedId(null), []);

  const selectedNode = selectedId ? baseNodes.find((n) => n.id === selectedId) : null;

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={handlePaneClick}
        fitView
        minZoom={0.05}
        maxZoom={2}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="#d0cbc0" />
        {/* Render semantic cluster backgrounds */}
        {clusters && clusters.map((_, idx) => (
          <ClusterBackground key={idx} clusters={clusters} nodes={baseNodes} clusterIdx={idx} />
        ))}
        <Controls />
        <MiniMap
          nodeColor={(n) => n.data?.color || "#ccc"}
          maskColor="rgba(244,241,234,0.7)"
          style={{ width: 140, height: 90 }}
        />
      </ReactFlow>
      {selectedNode && (
        <div className="wgp-tooltip">
          <strong>{selectedNode.data.label}</strong>
          {selectedNode.data.folder !== "." && (
            <> &mdash; <span style={{ opacity: 0.7 }}>{selectedNode.data.folder}</span></>
          )}
          <br />
          <span style={{ opacity: 0.6, fontSize: "0.72rem" }}>
            Double-click to open &nbsp;·&nbsp; {selectedNode.data.relativePath}
          </span>
        </div>
      )}
    </>
  );
}

function isConnectedTo(edges, nodeId, otherId) {
  return edges.some(
    (e) => (e.source === nodeId && e.target === otherId) || (e.target === nodeId && e.source === otherId)
  );
}

// ── Public panel component ────────────────────────────────────────────────────
export function WorkspaceGraphPanel({ onClose, onOpenDocument }) {
  const [rawData, setRawData] = useState(null);
  const [clusters, setClusters] = useState(null);
  const [loading, setLoading] = useState(true);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [embeddingsAvailable, setEmbeddingsAvailable] = useState(false);
  const [embeddingStaleness, setEmbeddingStaleness] = useState(null);

  // Load base graph data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const api = window.notesApi;
        if (!api?.getWorkspaceGraph) throw new Error("Workspace graph API unavailable.");
        const data = await api.getWorkspaceGraph();
        if (!cancelled) setRawData(data);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load workspace graph.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load semantic graph (clusters)
  useEffect(() => {
    if (!rawData) return;
    let cancelled = false;
    setSemanticLoading(true);
    (async () => {
      try {
        const data = await getSemanticGraph();
        if (!cancelled) {
          setClusters(data.clusters || []);
          setEmbeddingsAvailable(data.clusters.length > 0);
          setEmbeddingStaleness(data.staleness || null);
        }
      } catch (err) {
        // Embeddings unavailable is not an error, just graceful degradation
        if (!cancelled) {
          console.log('Semantic clustering unavailable:', err.message);
          setClusters([]);
          setEmbeddingsAvailable(false);
          setEmbeddingStaleness(null);
        }
      } finally {
        if (!cancelled) setSemanticLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rawData]);

  // Refresh semantic clusters
  const handleRefreshSemantic = useCallback(async () => {
    setSemanticLoading(true);
    try {
      const data = await getSemanticGraph();
      setClusters(data.clusters || []);
      setEmbeddingsAvailable(data.clusters.length > 0);
    } catch (err) {
      console.error('Failed to refresh semantic clusters:', err.message);
    } finally {
      setSemanticLoading(false);
    }
  }, []);

  // Keyboard: Escape closes
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const folders = useMemo(() => {
    if (!rawData?.nodes) return [];
    const folderSet = new Set(rawData.nodes.filter(n => n.nodeType !== 'media').map((n) => n.folder || "."));
    return Array.from(folderSet).sort();
  }, [rawData]);

  const folderColorMap = useMemo(() => {
    const map = new Map();
    folders.forEach((f, i) => map.set(f, folderColor(f, i)));
    return map;
  }, [folders]);

  const noteCount = rawData?.nodes?.filter(n => n.nodeType !== 'media')?.length ?? 0;
  const mediaCount = rawData?.nodes?.filter(n => n.nodeType === 'media')?.length ?? 0;
  const edgeCount = rawData?.edges?.length ?? 0;
  const clusterCount = clusters?.filter((c) => c.members && c.members.length > 1).length ?? 0;

  return (
    <div className="workspace-graph-overlay" role="dialog" aria-modal="true" aria-label="Workspace Graph">
      {/* Header */}
      <div className="workspace-graph-header">
        <h2>Workspace Graph</h2>
        {!loading && !error && (
          <span className="workspace-graph-meta">
            {noteCount} note{noteCount !== 1 ? "s" : ""} &nbsp;·&nbsp; {mediaCount} media &nbsp;·&nbsp; {edgeCount} link{edgeCount !== 1 ? "s" : ""} &nbsp;·&nbsp; {folders.length} folder{folders.length !== 1 ? "s" : ""}{clusterCount > 0 ? ` &nbsp;·&nbsp; ${clusterCount} clusters` : ""}{embeddingStaleness ? ` &nbsp;·&nbsp; ${embeddingStaleness.message}` : ""}
          </span>
        )}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {embeddingsAvailable && !loading && (
            <button
              className="small-button"
              onClick={handleRefreshSemantic}
              disabled={semanticLoading}
              title="Refresh semantic clustering"
            >
              <RefreshCw size={14} />
            </button>
          )}
          {!embeddingsAvailable && !loading && !error && (
            <span className="embedding-status-badge" title="Semantic clustering unavailable">
              <Zap size={12} /> Embeddings off
            </span>
          )}
          <button className="workspace-graph-close" onClick={onClose} title="Close (Esc)">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      {!loading && !error && (
        <div className="workspace-graph-toolbar">
          <input
            className="workspace-graph-filter-input"
            type="search"
            placeholder="Filter notes…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
          />
          {folders.length > 0 && (
            <div className="workspace-graph-legend" aria-label="Folder legend">
              {folders.map((f) => (
                <span key={f} className="workspace-graph-legend-item">
                  <span className="workspace-graph-legend-dot" style={{ background: folderColorMap.get(f) }} />
                  {f === "." ? "root" : f}
                </span>
              ))}
              {mediaCount > 0 && (
                <span className="workspace-graph-legend-item">
                  <span className="workspace-graph-legend-dot" style={{ background: "rgba(200,200,200,0.3)", border: "1px dashed #999" }} />
                  media
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Canvas */}
      <div className="workspace-graph-canvas">
        {loading && (
          <div className="workspace-graph-status">
            <div className="workspace-graph-spinner" />
            Scanning workspace…
          </div>
        )}
        {!loading && error && (
          <div className="workspace-graph-status">{error}</div>
        )}
        {!loading && !error && noteCount === 0 && (
          <div className="workspace-graph-status">No markdown notes or media found in the active workspace.</div>
        )}
        {!loading && !error && noteCount > 0 && (
          <ReactFlowProvider>
            <GraphCanvas rawData={rawData} filter={filter} onOpenDocument={onOpenDocument} clusters={clusters} />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
