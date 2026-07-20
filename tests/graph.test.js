import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import GraphDB from '../ai/graph/GraphDB';

describe('SQLite Knowledge Graph DB and CTE Traversals', () => {
  const tempWorkspace = path.join(__dirname, '../scratch/temp-graph-test-workspace');
  let graphDb;

  beforeEach(() => {
    // Ensure clean workspace directory
    if (!fs.existsSync(tempWorkspace)) {
      fs.mkdirSync(tempWorkspace, { recursive: true });
    }
    
    // Initialize GraphDB targeting the temp workspace
    graphDb = new GraphDB(tempWorkspace);
    graphDb.initialize();
  });

  afterEach(() => {
    // Close handle and clean files
    if (graphDb) {
      graphDb.close();
    }
    try {
      if (fs.existsSync(tempWorkspace)) {
        fs.rmSync(tempWorkspace, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn('Cleanup warning:', err.message);
    }
  });

  it('should initialize tables correctly', () => {
    const status = graphDb.getStatus();
    expect(status.nodeCount).toBe(0);
    expect(status.edgeCount).toBe(0);
    expect(status.sizeBytes).toBeGreaterThan(0);
  });

  it('should upsert and retrieve entities', () => {
    // Upsert a Note node
    graphDb.upsertEntity({
      id: 'note-1',
      type: 'Note',
      name: 'Welcome to Notely',
      note_path: 'welcome.md',
      properties: { size: 100 }
    });

    // Upsert a Person node
    graphDb.upsertEntity({
      id: 'person-1',
      type: 'Person',
      name: 'Alice Smith',
      properties: { role: 'Lead Architect' }
    });

    const status = graphDb.getStatus();
    expect(status.nodeCount).toBe(2);

    const all = graphDb.getAll();
    expect(all.entities).toHaveLength(2);
    
    const noteNode = all.entities.find(e => e.id === 'note-1');
    expect(noteNode).toBeDefined();
    expect(noteNode.type).toBe('Note');
    expect(noteNode.name).toBe('Welcome to Notely');
    expect(noteNode.properties.size).toBe(100);

    const personNode = all.entities.find(e => e.id === 'person-1');
    expect(personNode.properties.role).toBe('Lead Architect');
  });

  it('should perform recursive CTE depth-3 neighbor lookups', () => {
    // Establish a chain: A -> B -> C -> D -> E
    graphDb.upsertEntity({ id: 'node-a', type: 'Note', name: 'Node A' });
    graphDb.upsertEntity({ id: 'node-b', type: 'Project', name: 'Node B' });
    graphDb.upsertEntity({ id: 'node-c', type: 'Person', name: 'Node C' });
    graphDb.upsertEntity({ id: 'node-d', type: 'Concept', name: 'Node D' });
    graphDb.upsertEntity({ id: 'node-e', type: 'Task', name: 'Node E' });

    graphDb.upsertRelationship({ source_id: 'node-a', target_id: 'node-b', type: 'REFERENCES' });
    graphDb.upsertRelationship({ source_id: 'node-b', target_id: 'node-c', type: 'USES' });
    graphDb.upsertRelationship({ source_id: 'node-c', target_id: 'node-d', type: 'MENTIONS' });
    graphDb.upsertRelationship({ source_id: 'node-d', target_id: 'node-e', type: 'DEPENDS_ON' });

    // Fetch neighbors of node-a up to depth 3
    const result = graphDb.getNeighbors('node-a', 3);

    // Expect node-a, node-b, node-c, and node-d to be fetched (depths 0, 1, 2, 3)
    // node-e is depth 4, so it should be excluded
    const nodeIds = result.nodes.map(n => n.id);
    expect(nodeIds).toContain('node-a');
    expect(nodeIds).toContain('node-b');
    expect(nodeIds).toContain('node-c');
    expect(nodeIds).toContain('node-d');
    expect(nodeIds).not.toContain('node-e');

    // Should contain relationships between the visible nodes
    expect(result.edges.length).toBe(3);
    const hasAB = result.edges.some(e => e.source_id === 'node-a' && e.target_id === 'node-b');
    expect(hasAB).toBe(true);
  });

  it('should find path between entities using CTE', () => {
    graphDb.upsertEntity({ id: 'node-a', type: 'Note', name: 'Node A' });
    graphDb.upsertEntity({ id: 'node-b', type: 'Project', name: 'Node B' });
    graphDb.upsertEntity({ id: 'node-c', type: 'Person', name: 'Node C' });

    graphDb.upsertRelationship({ source_id: 'node-a', target_id: 'node-b', type: 'REFERENCES' });
    graphDb.upsertRelationship({ source_id: 'node-b', target_id: 'node-c', type: 'USES' });

    const pathResult = graphDb.findPath('node-a', 'node-c');
    expect(pathResult).toEqual(['node-a', 'node-b', 'node-c']);

    // Non-existent path
    const noPath = graphDb.findPath('node-a', 'node-xyz');
    expect(noPath).toBeNull();
  });
});
