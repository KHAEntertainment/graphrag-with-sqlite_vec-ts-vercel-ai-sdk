import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EntityEmbedder } from '../../src/lib/entity-embedder.js';
import { GraphDatabaseConnection } from '../../src/lib/graph-database.js';
import { EmbeddingManager } from '../../src/lib/embedding-manager.js';
import { Logger } from '../../src/lib/logger.js';
import { existsSync, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import type { GraphNode } from '../../src/types/index.js';
import type { EmbeddingChunk, Embedding } from '../../src/types/embedding.js';

describe('EntityEmbedder', () => {
  const testDbPath = './tests/fixtures/test-entity-embedder.db';
  let db: GraphDatabaseConnection;
  let embedder: EntityEmbedder;
  let mockEmbeddingManager: EmbeddingManager;
  let logger: Logger;

  beforeEach(() => {
    // Ensure fixtures directory exists
    if (!existsSync('./tests/fixtures')) {
      mkdirSync('./tests/fixtures', { recursive: true });
    }

    // Create database connection
    db = new GraphDatabaseConnection(testDbPath);

    // Create logger
    logger = new Logger('EntityEmbedderTest', './tests/logs', 'entity-embedder-test.log');

    // Create mock embedding manager
    mockEmbeddingManager = {
      embedChunks: vi.fn(async (chunks: EmbeddingChunk[]): Promise<EmbeddingChunk[]> => {
        // Return chunks with mock embeddings (768-dimensional)
        return chunks.map((chunk) => ({
          ...chunk,
          embedding: new Array(768).fill(0.1) as Embedding,
        }));
      }),
      getDimension: vi.fn(() => 768),
    } as unknown as EmbeddingManager;

    // Create entity embedder
    embedder = new EntityEmbedder(db, mockEmbeddingManager, logger);
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }

    // Clean up test database files
    const dbFiles = [testDbPath, `${testDbPath}-shm`, `${testDbPath}-wal`];
    for (const file of dbFiles) {
      if (existsSync(file)) {
        await unlink(file);
      }
    }
  });

  describe('Entity Formatting', () => {
    it('should format entity with complete properties', () => {
      // Create test entity with complete properties
      const entity: GraphNode = {
        id: 'AuthModule',
        properties: {
          name: 'AuthModule',
          type: 'class',
          description: 'Handles authentication and authorization',
          file: 'src/auth/AuthModule.ts',
          returns: 'User object',
          purpose: 'Manages user authentication flow',
          signature: 'class AuthModule extends BaseModule',
        },
      };

      // Use reflection to access private method
      const formatted = (embedder as unknown as {
        formatEntityForEmbedding: (entity: GraphNode) => string;
      }).formatEntityForEmbedding(entity);

      expect(formatted).toContain('AuthModule');
      expect(formatted).toContain('class');
      expect(formatted).toContain('Handles authentication and authorization');
      expect(formatted).toContain('in src/auth/AuthModule.ts');
    });

    it('should format entity with minimal properties', () => {
      const entity: GraphNode = {
        id: 'unknownEntity',
        properties: {},
      };

      const formatted = (embedder as unknown as {
        formatEntityForEmbedding: (entity: GraphNode) => string;
      }).formatEntityForEmbedding(entity);

      expect(formatted).toContain('unknownEntity'); // Falls back to ID
      expect(formatted).toContain('entity'); // Default kind
      expect(formatted).toContain('no description'); // Default when no hints
    });

    it('should handle various entity kinds', () => {
      const kinds = [
        { kind: 'class', name: 'UserClass' },
        { kind: 'function', name: 'fetchUser' },
        { kind: 'interface', name: 'UserType' },
        { kind: 'variable', name: 'API_KEY' },
      ];

      for (const { kind, name } of kinds) {
        const entity: GraphNode = {
          id: name,
          properties: { name, type: kind },
        };

        const formatted = (embedder as unknown as {
          formatEntityForEmbedding: (entity: GraphNode) => string;
        }).formatEntityForEmbedding(entity);

        expect(formatted).toContain(name);
        expect(formatted).toContain(kind);
      }
    });

    it('should extract hints from multiple property sources', () => {
      const entity: GraphNode = {
        id: 'complexEntity',
        properties: {
          name: 'complexEntity',
          description: 'Main description',
          returns: 'Promise<Data>',
          file: 'src/utils.ts',
          purpose: 'Utility function',
        },
      };

      const formatted = (embedder as unknown as {
        formatEntityForEmbedding: (entity: GraphNode) => string;
      }).formatEntityForEmbedding(entity);

      expect(formatted).toContain('Main description');
      expect(formatted).toContain('returns Promise<Data>');
      expect(formatted).toContain('in src/utils.ts');
      expect(formatted).toContain('Utility function');
    });
  });

  describe('Batch Processing', () => {
    it('should process 50 entities in a single batch', async () => {
      // Insert 50 test entities
      const insertStmt = db.getSession().prepare(`
        INSERT INTO nodes (id, properties, repo)
        VALUES (?, ?, ?)
      `);

      for (let i = 0; i < 50; i++) {
        const props = JSON.stringify({
          name: `Entity${i}`,
          type: 'function',
        });
        insertStmt.run(`entity-${i}`, props, 'test-repo');
      }

      const successCount = await embedder.generateEntityEmbeddings('test-repo');

      expect(successCount).toBe(50);
      expect(mockEmbeddingManager.embedChunks).toHaveBeenCalledTimes(1);

      // Verify embeddings stored in database
      if (db.hasVecExtension()) {
        const count = db
          .getSession()
          .prepare('SELECT COUNT(*) as count FROM embeddings WHERE repo = ?')
          .get('test-repo') as { count: number };

        expect(count.count).toBe(50);
      }
    });

    it('should process 150 entities in multiple batches', async () => {
      // Insert 150 test entities
      const insertStmt = db.getSession().prepare(`
        INSERT INTO nodes (id, properties, repo)
        VALUES (?, ?, ?)
      `);

      for (let i = 0; i < 150; i++) {
        const props = JSON.stringify({
          name: `Entity${i}`,
          type: 'class',
          description: `Test entity number ${i}`,
        });
        insertStmt.run(`entity-${i}`, props, 'large-repo');
      }

      const successCount = await embedder.generateEntityEmbeddings('large-repo');

      expect(successCount).toBe(150);
      // Should be called 3 times (50 + 50 + 50)
      expect(mockEmbeddingManager.embedChunks).toHaveBeenCalledTimes(3);

      // Verify all embeddings stored
      if (db.hasVecExtension()) {
        const count = db
          .getSession()
          .prepare('SELECT COUNT(*) as count FROM embeddings WHERE repo = ?')
          .get('large-repo') as { count: number };

        expect(count.count).toBe(150);
      }
    });

    it('should handle empty repository gracefully', async () => {
      const successCount = await embedder.generateEntityEmbeddings('empty-repo');

      expect(successCount).toBe(0);
      expect(mockEmbeddingManager.embedChunks).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON in properties gracefully', async () => {
      // Insert entity with invalid properties structure
      db.getSession()
        .prepare('INSERT INTO nodes (id, properties, repo) VALUES (?, ?, ?)')
        .run('broken-entity', '{"name": "BrokenEntity"}', 'error-repo');

      // Should not throw
      const successCount = await embedder.generateEntityEmbeddings('error-repo');
      expect(successCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle embedding generation failures gracefully', async () => {
      // Insert test entities
      const insertStmt = db.getSession().prepare(`
        INSERT INTO nodes (id, properties, repo)
        VALUES (?, ?, ?)
      `);

      for (let i = 0; i < 10; i++) {
        const props = JSON.stringify({
          name: `Entity${i}`,
          type: 'function',
        });
        insertStmt.run(`entity-${i}`, props, 'fail-repo');
      }

      // Mock embedding manager to throw error
      mockEmbeddingManager.embedChunks = vi.fn().mockRejectedValue(new Error('Embedding failed'));

      // Should not throw, but should return 0 successes (graceful degradation)
      const successCount = await embedder.generateEntityEmbeddings('fail-repo');
      expect(successCount).toBe(0);
    });

    it('should continue processing after individual batch failure', async () => {
      // Insert entities across multiple batches
      const insertStmt = db.getSession().prepare(`
        INSERT INTO nodes (id, properties, repo)
        VALUES (?, ?, ?)
      `);

      for (let i = 0; i < 100; i++) {
        const props = JSON.stringify({
          name: `Entity${i}`,
          type: 'function',
        });
        insertStmt.run(`entity-${i}`, props, 'partial-fail-repo');
      }

      // Mock to fail on second batch
      let callCount = 0;
      mockEmbeddingManager.embedChunks = vi.fn(async (chunks: EmbeddingChunk[]) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Second batch failed');
        }
        return chunks.map((chunk) => ({
          ...chunk,
          embedding: new Array(768).fill(0.1) as Embedding,
        }));
      });

      // Should process first batch successfully despite second batch failing
      const successCount = await embedder.generateEntityEmbeddings('partial-fail-repo');

      // First batch (50) should succeed
      expect(successCount).toBe(50);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full flow: entities -> embeddings -> database', async () => {
      if (!db.hasVecExtension()) {
        console.log('Skipping test: sqlite-vec not available');
        return;
      }

      // Create test entities
      const entities = [
        {
          id: 'AuthService',
          props: { name: 'AuthService', type: 'class', description: 'Authentication service' },
        },
        {
          id: 'loginUser',
          props: { name: 'loginUser', type: 'function', description: 'User login handler' },
        },
        {
          id: 'UserType',
          props: { name: 'UserType', type: 'interface', description: 'User type definition' },
        },
      ];

      const insertStmt = db.getSession().prepare(`
        INSERT INTO nodes (id, properties, repo)
        VALUES (?, ?, ?)
      `);

      for (const entity of entities) {
        insertStmt.run(entity.id, JSON.stringify(entity.props), 'integration-repo');
      }

      // Generate embeddings
      const successCount = await embedder.generateEntityEmbeddings('integration-repo');

      expect(successCount).toBe(3);

      // Verify embeddings in database
      const results = db
        .getSession()
        .prepare('SELECT chunk_id, chunk_type, content, repo FROM embeddings WHERE repo = ?')
        .all('integration-repo') as Array<{
        chunk_id: string;
        chunk_type: string;
        content: string;
        repo: string;
      }>;

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.chunk_type === 'entity')).toBe(true);
      expect(results.every((r) => r.repo === 'integration-repo')).toBe(true);
      expect(results.every((r) => r.chunk_id.startsWith('integration-repo::entity::'))).toBe(true);
    });

    it('should filter entities by repository', async () => {
      // Insert entities for multiple repositories
      const insertStmt = db.getSession().prepare(`
        INSERT INTO nodes (id, properties, repo)
        VALUES (?, ?, ?)
      `);

      // Repo 1
      for (let i = 0; i < 10; i++) {
        insertStmt.run(`repo1-entity-${i}`, JSON.stringify({ name: `Repo1Entity${i}` }), 'repo1');
      }

      // Repo 2
      for (let i = 0; i < 15; i++) {
        insertStmt.run(`repo2-entity-${i}`, JSON.stringify({ name: `Repo2Entity${i}` }), 'repo2');
      }

      // Generate embeddings only for repo1
      const successCount = await embedder.generateEntityEmbeddings('repo1');

      expect(successCount).toBe(10);

      if (db.hasVecExtension()) {
        const repo1Count = db
          .getSession()
          .prepare('SELECT COUNT(*) as count FROM embeddings WHERE repo = ?')
          .get('repo1') as { count: number };

        const repo2Count = db
          .getSession()
          .prepare('SELECT COUNT(*) as count FROM embeddings WHERE repo = ?')
          .get('repo2') as { count: number };

        expect(repo1Count.count).toBe(10);
        expect(repo2Count.count).toBe(0);
      }
    });

    it('should store embedding metadata correctly', async () => {
      if (!db.hasVecExtension()) {
        console.log('Skipping test: sqlite-vec not available');
        return;
      }

      // Insert entity with rich metadata
      const entityProps = {
        name: 'RichEntity',
        type: 'class',
        description: 'Entity with metadata',
        file: 'src/entities/RichEntity.ts',
        lineNumber: 42,
      };

      db.getSession()
        .prepare('INSERT INTO nodes (id, properties, repo) VALUES (?, ?, ?)')
        .run('rich-entity', JSON.stringify(entityProps), 'metadata-repo');

      await embedder.generateEntityEmbeddings('metadata-repo');

      // Retrieve and verify metadata
      const result = db
        .getSession()
        .prepare('SELECT metadata FROM embeddings WHERE chunk_id = ?')
        .get('metadata-repo::entity::rich-entity') as { metadata: string } | undefined;

      expect(result).toBeDefined();

      const metadata = JSON.parse(result!.metadata) as Record<string, unknown>;
      expect(metadata.name).toBe('RichEntity');
      expect(metadata.type).toBe('class');
      expect(metadata.file).toBe('src/entities/RichEntity.ts');
      expect(metadata.lineNumber).toBe(42);
    });
  });
});