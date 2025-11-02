import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EdgeEmbedder } from '../../src/lib/edge-embedder.js';
import { GraphDatabaseConnection } from '../../src/lib/graph-database.js';
import type { EmbeddingManager } from '../../src/lib/embedding-manager.js';
import type { Logger } from '../../src/types/index.js';
import type { Embedding } from '../../src/types/embedding.js';
import { existsSync, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';

/**
 * Mock EmbeddingManager for testing
 * Generates deterministic embeddings based on text length
 */
class MockEmbeddingManager implements Pick<EmbeddingManager, 'embedChunk'> {
  async embedChunk(chunk: { id: string; content: string }): Promise<{ embedding: Embedding }> {
    // Generate a simple deterministic embedding based on content
    const embedding = new Array(768).fill(0);
    // Use content length to create unique embeddings
    const index = chunk.content.length % 768;
    embedding[index] = 1.0;
    embedding[(index + 1) % 768] = 0.5;
    return { embedding };
  }
}

/**
 * Simple logger for testing
 */
class TestLogger implements Logger {
  info(message: string, ...args: unknown[]): void {
    // Silent for tests
  }
  debug(message: string, ...args: unknown[]): void {
    // Silent for tests
  }
  warn(message: string, ...args: unknown[]): void {
    console.warn(message, ...args);
  }
  error(message: string, ...args: unknown[]): void {
    console.error(message, ...args);
  }
}

describe('EdgeEmbedder', () => {
  const testDbPath = './tests/fixtures/test-edge-embedder.db';
  let db: GraphDatabaseConnection;
  let embedder: EdgeEmbedder;
  let mockEmbeddingManager: MockEmbeddingManager;
  let logger: TestLogger;

  beforeEach(() => {
    // Ensure fixtures directory exists
    if (!existsSync('./tests/fixtures')) {
      mkdirSync('./tests/fixtures', { recursive: true });
    }

    // Create fresh database
    db = new GraphDatabaseConnection(testDbPath);
    mockEmbeddingManager = new MockEmbeddingManager();
    logger = new TestLogger();
    embedder = new EdgeEmbedder(db, mockEmbeddingManager as unknown as EmbeddingManager, logger);

    // Create sample nodes for testing
    createSampleNodes(db);
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
    // Clean up test database files
    if (existsSync(testDbPath)) {
      await unlink(testDbPath);
    }
    if (existsSync(`${testDbPath}-shm`)) {
      await unlink(`${testDbPath}-shm`);
    }
    if (existsSync(`${testDbPath}-wal`)) {
      await unlink(`${testDbPath}-wal`);
    }
  });

  describe('Edge Formatting', () => {
    it('should format edge with complete node context', async () => {
      // Create edge with complete context
      createEdge(db, {
        source: 'api_gateway',
        target: 'auth_module',
        relationship: 'routes_to',
        weight: 0.8,
        source_repo: 'backend',
        target_repo: 'backend',
      });

      const count = await embedder.generateEdgeEmbeddings('backend');
      expect(count).toBe(1);

      // Verify embedding was stored with correct format
      const result = db.getSession()
        .prepare('SELECT content FROM embeddings WHERE chunk_type = ?')
        .get('edge') as { content: string } | undefined;

      expect(result).toBeDefined();
      // Implementation uses node names (APIGateway), not IDs (api_gateway)
      expect(result!.content).toContain('APIGateway');
      expect(result!.content).toContain('routes_to');
      expect(result!.content).toContain('AuthModule');
      expect(result!.content).toContain('context:');
    });

    it('should format edge with minimal node context', async () => {
      // Create nodes with minimal properties
      const stmt = db.getSession().prepare(`
        INSERT INTO nodes (id, repo, properties)
        VALUES (?, ?, ?)
      `);
      stmt.run('minimal_source', 'test', JSON.stringify({ name: 'MinimalSource' }));
      stmt.run('minimal_target', 'test', JSON.stringify({ name: 'MinimalTarget' }));

      createEdge(db, {
        source: 'minimal_source',
        target: 'minimal_target',
        relationship: 'calls',
        weight: 0.3,
        source_repo: 'test',
        target_repo: 'test',
      });

      const count = await embedder.generateEdgeEmbeddings('test');
      expect(count).toBe(1);

      const result = db.getSession()
        .prepare('SELECT content FROM embeddings WHERE chunk_type = ?')
        .get('edge') as { content: string } | undefined;

      expect(result).toBeDefined();
      expect(result!.content).toContain('MinimalSource');
      expect(result!.content).toContain('MinimalTarget');
    });

    it('should indicate strong relationships (weight > 0.5)', async () => {
      createEdge(db, {
        source: 'api_gateway',
        target: 'auth_module',
        relationship: 'depends_on',
        weight: 0.9,
        source_repo: 'backend',
        target_repo: 'backend',
      });

      await embedder.generateEdgeEmbeddings('backend');

      const result = db.getSession()
        .prepare('SELECT content FROM embeddings WHERE chunk_type = ?')
        .get('edge') as { content: string } | undefined;

      expect(result).toBeDefined();
      expect(result!.content).toContain('strong relationship');
    });

    it('should include node descriptions in context', async () => {
      // Nodes already have descriptions in createSampleNodes
      createEdge(db, {
        source: 'api_gateway',
        target: 'user_service',
        relationship: 'calls',
        weight: 0.6,
        source_repo: 'backend',
        target_repo: 'backend',
      });

      await embedder.generateEdgeEmbeddings('backend');

      const result = db.getSession()
        .prepare('SELECT content FROM embeddings WHERE chunk_type = ?')
        .get('edge') as { content: string } | undefined;

      expect(result).toBeDefined();
      expect(result!.content).toContain('Main entry point');
      expect(result!.content).toContain('Handles user operations');
    });
  });

  describe('SQL JOIN Functionality', () => {
    it('should correctly extract node properties via JOIN', async () => {
      createEdge(db, {
        source: 'api_gateway',
        target: 'auth_module',
        relationship: 'routes_to',
        weight: 0.7,
        source_repo: 'backend',
        target_repo: 'backend',
      });

      await embedder.generateEdgeEmbeddings('backend');

      const result = db.getSession()
        .prepare('SELECT metadata FROM embeddings WHERE chunk_type = ?')
        .get('edge') as { metadata: string } | undefined;

      expect(result).toBeDefined();
      const metadata = JSON.parse(result!.metadata);
      expect(metadata.source).toBe('api_gateway');
      expect(metadata.target).toBe('auth_module');
      expect(metadata.relationship).toBe('routes_to');
      expect(metadata.weight).toBe(0.7);
    });

    it('should handle missing source node gracefully', async () => {
      // Create edge with non-existent source
      // Temporarily disable foreign keys for this test
      db.getSession().exec('PRAGMA foreign_keys = OFF');
      
      db.getSession().prepare(`
        INSERT INTO edges (source, target, relationship, weight, source_repo, target_repo)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('nonexistent', 'auth_module', 'calls', 0.5, 'backend', 'backend');

      // Re-enable foreign keys
      db.getSession().exec('PRAGMA foreign_keys = ON');

      // Should not throw, but should produce no embeddings
      const count = await embedder.generateEdgeEmbeddings('backend');
      expect(count).toBe(0);
    });

    it('should handle multiple edges between same nodes', async () => {
      // Create multiple relationships between same nodes
      createEdge(db, {
        source: 'api_gateway',
        target: 'auth_module',
        relationship: 'routes_to',
        weight: 0.7,
        source_repo: 'backend',
        target_repo: 'backend',
      });
      createEdge(db, {
        source: 'api_gateway',
        target: 'auth_module',
        relationship: 'depends_on',
        weight: 0.8,
        source_repo: 'backend',
        target_repo: 'backend',
      });

      const count = await embedder.generateEdgeEmbeddings('backend');
      expect(count).toBe(2);

      // Verify both edges were embedded
      const results = db.getSession()
        .prepare('SELECT content FROM embeddings WHERE chunk_type = ?')
        .all('edge') as Array<{ content: string }>;

      expect(results.length).toBe(2);
      expect(results[0].content).toContain('routes_to');
      expect(results[1].content).toContain('depends_on');
    });
  });

  describe('Cross-Repository Edges', () => {
    it('should handle edges between different repositories', async () => {
      // Create node in different repository
      db.getSession().prepare(`
        INSERT INTO nodes (id, repo, properties)
        VALUES (?, ?, ?)
      `).run('external_api', 'frontend', JSON.stringify({
        name: 'ExternalAPI',
        type: 'service',
        description: 'External API client',
      }));

      // Create cross-repo edge
      createEdge(db, {
        source: 'api_gateway',
        target: 'external_api',
        relationship: 'integrates_with',
        weight: 0.6,
        source_repo: 'backend',
        target_repo: 'frontend',
      });

      const count = await embedder.generateEdgeEmbeddings('backend');
      expect(count).toBe(1);

      const result = db.getSession()
        .prepare('SELECT content, metadata FROM embeddings WHERE chunk_type = ?')
        .get('edge') as { content: string; metadata: string } | undefined;

      expect(result).toBeDefined();
      expect(result!.content).toContain('cross-repo: backend -> frontend');

      const metadata = JSON.parse(result!.metadata);
      expect(metadata.source_repo).toBe('backend');
      expect(metadata.target_repo).toBe('frontend');
    });

    it('should store embeddings with correct repo field', async () => {
      // Create cross-repo edge
      db.getSession().prepare(`
        INSERT INTO nodes (id, repo, properties)
        VALUES (?, ?, ?)
      `).run('ui_component', 'frontend', JSON.stringify({
        name: 'UIComponent',
        type: 'component',
      }));

      createEdge(db, {
        source: 'api_gateway',
        target: 'ui_component',
        relationship: 'serves',
        weight: 0.5,
        source_repo: 'backend',
        target_repo: 'frontend',
      });

      await embedder.generateEdgeEmbeddings('backend');

      const result = db.getSession()
        .prepare('SELECT repo FROM embeddings WHERE chunk_type = ?')
        .get('edge') as { repo: string } | undefined;

      expect(result).toBeDefined();
      expect(result!.repo).toBe('backend'); // Should use source_repo
    });

    it('should find edges when querying target repository', async () => {
      db.getSession().prepare(`
        INSERT INTO nodes (id, repo, properties)
        VALUES (?, ?, ?)
      `).run('frontend_router', 'frontend', JSON.stringify({
        name: 'FrontendRouter',
        type: 'component',
      }));

      createEdge(db, {
        source: 'api_gateway',
        target: 'frontend_router',
        relationship: 'routes_to',
        weight: 0.7,
        source_repo: 'backend',
        target_repo: 'frontend',
      });

      // Should find edge when querying target repo
      const count = await embedder.generateEdgeEmbeddings('frontend');
      expect(count).toBe(1);
    });
  });

  describe('Batch Processing', () => {
    it('should process 100 edges in a single batch', async () => {
      // Create 100 edges
      for (let i = 0; i < 100; i++) {
        createEdge(db, {
          source: 'api_gateway',
          target: 'auth_module',
          relationship: `relationship_${i}`,
          weight: 0.5,
          source_repo: 'backend',
          target_repo: 'backend',
        });
      }

      const count = await embedder.generateEdgeEmbeddings('backend');
      expect(count).toBe(100);

      // Verify all embeddings stored
      const results = db.getSession()
        .prepare('SELECT COUNT(*) as count FROM embeddings WHERE chunk_type = ?')
        .get('edge') as { count: number };

      expect(results.count).toBe(100);
    });

    it('should process 250 edges across multiple batches', async () => {
      // Create 250 edges (3 batches: 100 + 100 + 50)
      for (let i = 0; i < 250; i++) {
        createEdge(db, {
          source: 'api_gateway',
          target: 'auth_module',
          relationship: `rel_${i}`,
          weight: 0.5,
          source_repo: 'backend',
          target_repo: 'backend',
        });
      }

      const count = await embedder.generateEdgeEmbeddings('backend');
      expect(count).toBe(250);

      const results = db.getSession()
        .prepare('SELECT COUNT(*) as count FROM embeddings WHERE chunk_type = ?')
        .get('edge') as { count: number };

      expect(results.count).toBe(250);
    });

    it('should handle empty repository (no edges)', async () => {
      const count = await embedder.generateEdgeEmbeddings('nonexistent-repo');
      expect(count).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed edge data gracefully', async () => {
      // Insert edge with malformed JSON properties
      db.getSession().prepare(`
        INSERT INTO nodes (id, repo, properties)
        VALUES (?, ?, ?)
      `).run('malformed_node', 'backend', 'invalid json');

      db.getSession().prepare(`
        INSERT INTO edges (source, target, relationship, weight, source_repo, target_repo)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('malformed_node', 'auth_module', 'calls', 0.5, 'backend', 'backend');

      // Should not throw, should handle gracefully
      const count = await embedder.generateEdgeEmbeddings('backend');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should continue processing after individual edge failure', async () => {
      // Create mix of valid and invalid edges
      createEdge(db, {
        source: 'api_gateway',
        target: 'auth_module',
        relationship: 'valid_1',
        weight: 0.5,
        source_repo: 'backend',
        target_repo: 'backend',
      });

      // Invalid edge (missing target node) - temporarily disable foreign keys
      db.getSession().exec('PRAGMA foreign_keys = OFF');
      db.getSession().prepare(`
        INSERT INTO edges (source, target, relationship, weight, source_repo, target_repo)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('api_gateway', 'nonexistent', 'invalid', 0.5, 'backend', 'backend');
      db.getSession().exec('PRAGMA foreign_keys = ON');

      createEdge(db, {
        source: 'api_gateway',
        target: 'user_service',
        relationship: 'valid_2',
        weight: 0.5,
        source_repo: 'backend',
        target_repo: 'backend',
      });

      const count = await embedder.generateEdgeEmbeddings('backend');
      // Should process at least the valid edges
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full flow: nodes → edges → embeddings', async () => {
      // Step 1: Verify nodes exist
      const nodeCount = db.getSession()
        .prepare('SELECT COUNT(*) as count FROM nodes WHERE repo = ?')
        .get('backend') as { count: number };
      expect(nodeCount.count).toBeGreaterThan(0);

      // Step 2: Create edges
      createEdge(db, {
        source: 'api_gateway',
        target: 'auth_module',
        relationship: 'routes_to',
        weight: 0.8,
        source_repo: 'backend',
        target_repo: 'backend',
      });

      const edgeCount = db.getSession()
        .prepare('SELECT COUNT(*) as count FROM edges WHERE source_repo = ?')
        .get('backend') as { count: number };
      expect(edgeCount.count).toBe(1);

      // Step 3: Generate embeddings
      const embeddingCount = await embedder.generateEdgeEmbeddings('backend');
      expect(embeddingCount).toBe(1);

      // Step 4: Verify embedding storage
      const result = db.getSession()
        .prepare('SELECT * FROM embeddings WHERE chunk_type = ?')
        .get('edge') as {
          chunk_id: string;
          repo: string;
          chunk_type: string;
          content: string;
          metadata: string;
        } | undefined;

      expect(result).toBeDefined();
      expect(result!.chunk_id).toContain('::edge::');
      expect(result!.repo).toBe('backend');
      expect(result!.chunk_type).toBe('edge');
      expect(result!.content).toContain('routes_to');

      const metadata = JSON.parse(result!.metadata);
      expect(metadata.source).toBe('api_gateway');
      expect(metadata.target).toBe('auth_module');
    });

    it('should support repository filtering in queries', async () => {
      // Create edges in multiple repos
      createEdge(db, {
        source: 'api_gateway',
        target: 'auth_module',
        relationship: 'calls',
        weight: 0.7,
        source_repo: 'backend',
        target_repo: 'backend',
      });

      db.getSession().prepare(`
        INSERT INTO nodes (id, repo, properties)
        VALUES (?, ?, ?)
      `).run('frontend_app', 'frontend', JSON.stringify({ name: 'FrontendApp' }));
      db.getSession().prepare(`
        INSERT INTO nodes (id, repo, properties)
        VALUES (?, ?, ?)
      `).run('frontend_lib', 'frontend', JSON.stringify({ name: 'FrontendLib' }));

      createEdge(db, {
        source: 'frontend_app',
        target: 'frontend_lib',
        relationship: 'imports',
        weight: 0.6,
        source_repo: 'frontend',
        target_repo: 'frontend',
      });

      await embedder.generateEdgeEmbeddings('backend');
      await embedder.generateEdgeEmbeddings('frontend');

      // Query backend embeddings only
      const backendResults = db.getSession()
        .prepare('SELECT COUNT(*) as count FROM embeddings WHERE repo = ? AND chunk_type = ?')
        .get('backend', 'edge') as { count: number };

      expect(backendResults.count).toBe(1);

      // Query all edge embeddings
      const allResults = db.getSession()
        .prepare('SELECT COUNT(*) as count FROM embeddings WHERE chunk_type = ?')
        .get('edge') as { count: number };

      expect(allResults.count).toBe(2);
    });
  });
});

/**
 * Helper: Create sample nodes for testing
 */
function createSampleNodes(db: GraphDatabaseConnection): void {
  const stmt = db.getSession().prepare(`
    INSERT INTO nodes (id, repo, properties)
    VALUES (?, ?, ?)
  `);

  stmt.run('api_gateway', 'backend', JSON.stringify({
    name: 'APIGateway',
    type: 'service',
    kind: 'class',
    description: 'Main entry point for all API requests',
  }));

  stmt.run('auth_module', 'backend', JSON.stringify({
    name: 'AuthModule',
    type: 'module',
    kind: 'class',
    description: 'Handles authentication and authorization',
  }));

  stmt.run('user_service', 'backend', JSON.stringify({
    name: 'UserService',
    type: 'service',
    kind: 'class',
    description: 'Handles user operations',
  }));
}

/**
 * Helper: Create an edge in the database
 */
function createEdge(
  db: GraphDatabaseConnection,
  edge: {
    source: string;
    target: string;
    relationship: string;
    weight: number;
    source_repo: string;
    target_repo: string;
  }
): void {
  db.getSession().prepare(`
    INSERT INTO edges (source, target, relationship, weight, source_repo, target_repo)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    edge.source,
    edge.target,
    edge.relationship,
    edge.weight,
    edge.source_repo,
    edge.target_repo
  );
}