/**
 * Tests for GraphDatabaseConnection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphDatabaseConnection } from '../../src/lib/graph-database.js';
import { existsSync, unlinkSync } from 'fs';
import type { GraphNode, GraphEdge } from '../../src/types/index.js';

describe('GraphDatabaseConnection', () => {
  const testDbPath = 'tests/fixtures/test_db.sqlite';
  let db: GraphDatabaseConnection;

  beforeEach(() => {
    // Clean up test database if it exists
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    if (existsSync(`${testDbPath}-wal`)) {
      unlinkSync(`${testDbPath}-wal`);
    }
    if (existsSync(`${testDbPath}-shm`)) {
      unlinkSync(`${testDbPath}-shm`);
    }

    // Create fresh database
    db = new GraphDatabaseConnection(testDbPath);
  });

  afterEach(() => {
    db.close();

    // Clean up after tests
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    if (existsSync(`${testDbPath}-wal`)) {
      unlinkSync(`${testDbPath}-wal`);
    }
    if (existsSync(`${testDbPath}-shm`)) {
      unlinkSync(`${testDbPath}-shm`);
    }
  });

  describe('Schema Initialization', () => {
    it('should create all required tables', () => {
      const session = db.getSession();
      const tables = session
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);

      // Check base tables
      expect(tableNames).toContain('nodes');
      expect(tableNames).toContain('edges');
      expect(tableNames).toContain('chunks');
      expect(tableNames).toContain('chunks_trigram');

      // Check migration tables
      expect(tableNames).toContain('schema_version');
      expect(tableNames).toContain('repositories');
      expect(tableNames).toContain('cross_references');
    });

    it('should add repo columns to nodes table', () => {
      const session = db.getSession();
      const columns = session.prepare("PRAGMA table_info(nodes)").all() as Array<{ name: string }>;
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('properties');
      expect(columnNames).toContain('repo');
    });

    it('should add repo columns to edges table', () => {
      const session = db.getSession();
      const columns = session.prepare("PRAGMA table_info(edges)").all() as Array<{ name: string }>;
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('source');
      expect(columnNames).toContain('target');
      expect(columnNames).toContain('relationship');
      expect(columnNames).toContain('weight');
      expect(columnNames).toContain('source_repo');
      expect(columnNames).toContain('target_repo');
    });

    it('should create default repository record', () => {
      const session = db.getSession();
      const defaultRepo = session
        .prepare("SELECT * FROM repositories WHERE id = 'default'")
        .get();

      expect(defaultRepo).toBeDefined();
      expect(defaultRepo).toHaveProperty('id', 'default');
      expect(defaultRepo).toHaveProperty('name', 'Default Repository');
    });

    it('should apply migration version 1', () => {
      const session = db.getSession();
      const migrations = session
        .prepare('SELECT version, name FROM schema_version ORDER BY version')
        .all() as Array<{ version: number; name: string }>;

      expect(migrations.length).toBeGreaterThan(0);
      expect(migrations[0].version).toBe(1);
      expect(migrations[0].name).toBe('add_multi_repo_support');
    });
  });

  describe('Node Operations', () => {
    it('should insert a node', () => {
      const node: GraphNode = {
        id: 'test-node-1',
        properties: { name: 'Test Node', type: 'entity' },
      };

      db.insertNode(node);

      const nodes = db.getAllNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('test-node-1');
      expect(nodes[0].properties).toEqual({ name: 'Test Node', type: 'entity' });
    });

    it('should ignore duplicate node inserts', () => {
      const node: GraphNode = {
        id: 'test-node-1',
        properties: { name: 'Test Node' },
      };

      db.insertNode(node);
      db.insertNode(node); // Should be ignored

      const nodes = db.getAllNodes();
      expect(nodes).toHaveLength(1);
    });

    it('should retrieve all nodes', () => {
      const nodes: GraphNode[] = [
        { id: 'node-1', properties: { name: 'Node 1' } },
        { id: 'node-2', properties: { name: 'Node 2' } },
        { id: 'node-3', properties: { name: 'Node 3' } },
      ];

      nodes.forEach((node) => db.insertNode(node));

      const retrieved = db.getAllNodes();
      expect(retrieved).toHaveLength(3);
    });
  });

  describe('Edge Operations', () => {
    beforeEach(() => {
      // Insert nodes for edges to reference
      db.insertNode({ id: 'node-1', properties: {} });
      db.insertNode({ id: 'node-2', properties: {} });
    });

    it('should insert an edge', () => {
      const edge: GraphEdge = {
        source: 'node-1',
        target: 'node-2',
        relationship: 'CONNECTS_TO',
        weight: 1.0,
      };

      db.insertEdge(edge);

      const edges = db.getAllEdges();
      expect(edges).toHaveLength(1);
      expect(edges[0].source).toBe('node-1');
      expect(edges[0].target).toBe('node-2');
      expect(edges[0].relationship).toBe('CONNECTS_TO');
      expect(edges[0].weight).toBe(1.0);
    });

    it('should replace edge on duplicate insert', () => {
      const edge1: GraphEdge = {
        source: 'node-1',
        target: 'node-2',
        relationship: 'CONNECTS_TO',
        weight: 1.0,
      };

      const edge2: GraphEdge = {
        source: 'node-1',
        target: 'node-2',
        relationship: 'CONNECTS_TO',
        weight: 2.0, // Updated weight
      };

      db.insertEdge(edge1);
      db.insertEdge(edge2);

      const edges = db.getAllEdges();
      expect(edges).toHaveLength(1);
      expect(edges[0].weight).toBe(2.0);
    });
  });

  describe('Chunk Operations', () => {
    it('should insert a chunk', () => {
      const chunk = {
        chunk_id: 'chunk-1',
        repo: 'test-repo',
        entity_id: 'entity-1',
        chunk_type: 'text',
        content: 'This is test content',
        metadata: { source: 'test' },
      };

      db.insertChunk(chunk);

      const session = db.getSession();
      const result = session
        .prepare('SELECT * FROM chunks WHERE chunk_id = ?')
        .get('chunk-1');

      expect(result).toBeDefined();
    });

    it('should insert multiple chunks in transaction', () => {
      const chunks = [
        {
          chunk_id: 'chunk-1',
          repo: 'test-repo',
          chunk_type: 'text',
          content: 'Content 1',
        },
        {
          chunk_id: 'chunk-2',
          repo: 'test-repo',
          chunk_type: 'text',
          content: 'Content 2',
        },
        {
          chunk_id: 'chunk-3',
          repo: 'test-repo',
          chunk_type: 'text',
          content: 'Content 3',
        },
      ];

      db.insertChunks(chunks);

      const session = db.getSession();
      const count = session
        .prepare('SELECT COUNT(*) as count FROM chunks')
        .get() as { count: number };

      expect(count.count).toBe(3);
    });

    it('should insert trigrams for fuzzy matching', () => {
      const chunk = {
        chunk_id: 'chunk-1',
        repo: 'test-repo',
        chunk_type: 'text',
        content: 'test content',
      };

      db.insertChunk(chunk);

      const session = db.getSession();
      const trigrams = session
        .prepare('SELECT COUNT(*) as count FROM chunks_trigram WHERE chunk_id = ?')
        .get('chunk-1') as { count: number };

      expect(trigrams.count).toBeGreaterThan(0);
    });
  });

  describe('FTS5 Support', () => {
    it('should detect FTS5 availability', () => {
      const hasFTS5 = db.hasFTS5Support();
      // FTS5 should be available in modern SQLite
      expect(typeof hasFTS5).toBe('boolean');
    });
  });

  describe('Vec Extension Support', () => {
    it('should load vec extension when binary is available', () => {
      const hasVec = db.hasVecExtension();
      // Extension should be loaded since we have vec0.dylib
      expect(hasVec).toBe(true);
    });
  });

  describe('Database Cleanup', () => {
    it('should clear all data', () => {
      // Insert test data
      db.insertNode({ id: 'node-1', properties: {} });
      db.insertNode({ id: 'node-2', properties: {} });
      db.insertEdge({
        source: 'node-1',
        target: 'node-2',
        relationship: 'TEST',
        weight: 1.0,
      });

      // Clear database
      db.clearDatabase();

      // Verify data is gone
      const nodes = db.getAllNodes();
      const edges = db.getAllEdges();

      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);
    });
  });
});