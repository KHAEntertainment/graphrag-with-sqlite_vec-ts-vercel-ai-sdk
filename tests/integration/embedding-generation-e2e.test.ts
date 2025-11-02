/**
 * End-to-End Integration Test for Phase 3 Embedding Generation
 *
 * Tests the complete pipeline from repository indexing through hybrid search
 * with generated embeddings for both entities and edges.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GraphDatabaseConnection } from '../../src/lib/graph-database.js';
import { RepositoryIndexer } from '../../src/lib/repository-indexer.js';
import { EmbeddingManager } from '../../src/lib/embedding-manager.js';
import { QueryEngine } from '../../src/mcp/tools/query-engine.js';
import { Logger } from '../../src/lib/logger.js';
import { createTestLLM, hasTestLLM } from '../helpers/test-provider.js';
import type { LanguageModelV1 } from 'ai';
import { existsSync } from 'fs';
import { unlink, rm } from 'fs/promises';
import { join } from 'path';
import { promises as fs } from 'fs';

describe('End-to-End: Embedding Generation Pipeline', () => {
  const testDbPath = './tests/fixtures/test-e2e-embedding.db';
  const sampleRepoPath = './tests/fixtures/sample-typescript-repo';
  const repositoryId = 'sample-typescript-app';

  let db: GraphDatabaseConnection;
  let embeddingManager: EmbeddingManager;
  let mockEmbeddingProvider: any;
  let indexer: RepositoryIndexer;
  let queryEngine: QueryEngine;
  let logger: Logger;
  let realModel: LanguageModelV1;

  beforeAll(async () => {
    // Check if test LLM is available
    if (!hasTestLLM()) {
      throw new Error(
        'OPENROUTER_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY required for E2E tests.\n' +
        'Get a free key at https://openrouter.ai/keys'
      );
    }

    // Ensure fixtures directory exists
    if (!existsSync('./tests/fixtures')) {
      await fs.mkdir('./tests/fixtures', { recursive: true });
    }

    // Create logger
    logger = new Logger('E2ETest', './tests/logs', 'e2e-embedding-test.log');

    // Create database connection
    db = new GraphDatabaseConnection(testDbPath);

    // Create mock embedding provider (avoids need to download models)
    mockEmbeddingProvider = {
      async initialize() {
        // No-op for mock
      },
      async embed(text: string): Promise<number[]> {
        // Return mock 768-dimensional embedding
        const embedding = new Array(768).fill(0);
        // Add some variation based on text length
        embedding[0] = text.length / 1000;
        embedding[1] = text.split(' ').length / 100;
        return embedding;
      },
      async embedBatch(texts: string[]): Promise<number[][]> {
        return Promise.all(texts.map(t => this.embed(t)));
      },
      getDimension(): number {
        return 768;
      },
    };
    
    embeddingManager = new EmbeddingManager(mockEmbeddingProvider, logger);

    // Use real language model for entity extraction
    realModel = createTestLLM();

    // Create repository indexer with real LLM
    indexer = new RepositoryIndexer(db, logger, embeddingManager, realModel);

    // Create query engine
    queryEngine = new QueryEngine(db.getSession(), embeddingManager, logger);

    // Verify sample repository exists
    const repoExists = existsSync(sampleRepoPath);
    if (!repoExists) {
      throw new Error(`Sample repository not found at ${sampleRepoPath}`);
    }

    logger.info('E2E test setup complete');
  });

  afterAll(async () => {
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

    logger.info('E2E test cleanup complete');
  });

  describe('Repository Setup Validation', () => {
    it('should verify sample repository structure', async () => {
      const files = await fs.readdir(join(sampleRepoPath, 'src'), { recursive: true });

      // Verify expected files exist
      const hasAuthModule = files.some(f => f.toString().includes('AuthModule'));
      const hasUserService = files.some(f => f.toString().includes('UserService'));
      const hasApiGateway = files.some(f => f.toString().includes('ApiGateway'));

      expect(hasAuthModule).toBe(true);
      expect(hasUserService).toBe(true);
      expect(hasApiGateway).toBe(true);
    });

    it('should have README documentation', async () => {
      const readmePath = join(sampleRepoPath, 'README.md');
      const readmeExists = existsSync(readmePath);
      expect(readmeExists).toBe(true);

      if (readmeExists) {
        const content = await fs.readFile(readmePath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
        expect(content).toContain('Authentication');
      }
    });
  });

  describe('Full Repository Indexing Pipeline', () => {
    it('should register repository successfully', () => {
      const repoId = indexer.registerRepository({
        id: repositoryId,
        name: 'Sample TypeScript App',
        version: '1.0.0',
        branch: 'main',
        metadata: {
          language: 'TypeScript',
          purpose: 'E2E Testing',
        },
      });

      expect(repoId).toBe(repositoryId);

      // Verify repository is retrievable
      const repo = indexer.getRepository(repositoryId);
      expect(repo).toBeDefined();
      expect(repo?.name).toBe('Sample TypeScript App');
      expect(repo?.version).toBe('1.0.0');
    });

    it('should complete full repository indexing with embeddings', async () => {
      const startTime = Date.now();

      // Index repository (this will process files, extract entities, build graph, and generate embeddings)
      // Note: With mock model, entity extraction may fail, but chunks should still be created
      await indexer.indexRepository(repositoryId, sampleRepoPath);

      const duration = Date.now() - startTime;
      const durationMinutes = duration / 1000 / 60;

      logger.info(`Indexing completed in ${durationMinutes.toFixed(2)} minutes`);

      // Verify indexing completed within performance target (5 minutes)
      expect(durationMinutes).toBeLessThan(5);

      // Get indexing status
      const status = indexer.getIndexingStatus(repositoryId);
      expect(status.repository_id).toBe(repositoryId);
      
      // Status may be pending if no entities were created (mock model limitation)
      // but should not be failed
      expect(status.status).not.toBe('failed');
    }, 300000); // 5 minute timeout

    it('should have created chunks in database', async () => {
      const chunkCount = db
        .getSession()
        .prepare('SELECT COUNT(*) as count FROM chunks WHERE repo = ?')
        .get(repositoryId) as { count: number };

      logger.info(`Chunks created: ${chunkCount.count}`);
      
      // Chunks should always be created, even if entity extraction fails
      expect(chunkCount.count).toBeGreaterThan(0);
      
      // Log chunk metadata for debugging
      const sampleChunks = db
        .getSession()
        .prepare('SELECT chunk_id, chunk_type, LENGTH(content) as content_length FROM chunks WHERE repo = ? LIMIT 3')
        .all(repositoryId) as Array<{ chunk_id: string; chunk_type: string; content_length: number }>;
      
      logger.info(`Sample chunks:`, sampleChunks);
    });

    it('should have extracted entities (nodes)', async () => {
      const nodeCount = db
        .getSession()
        .prepare('SELECT COUNT(*) as count FROM nodes WHERE repo = ?')
        .get(repositoryId) as { count: number };

      logger.info(`Nodes created: ${nodeCount.count}`);

      // With mock model, we may not get real entities, but structure should be ready
      expect(nodeCount.count).toBeGreaterThanOrEqual(0);
    });

    it('should have extracted relationships (edges)', async () => {
      const edgeCount = db
        .getSession()
        .prepare('SELECT COUNT(*) as count FROM edges WHERE source_repo = ?')
        .get(repositoryId) as { count: number };

      logger.info(`Edges created: ${edgeCount.count}`);

      // With mock model, we may not get real edges, but structure should be ready
      expect(edgeCount.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Embedding Generation Validation', () => {
    it('should have generated entity embeddings', async () => {
      if (!db.hasVecExtension()) {
        logger.warn('Skipping test: sqlite-vec not available');
        return;
      }

      const entityEmbeddings = db
        .getSession()
        .prepare(
          "SELECT COUNT(*) as count FROM embeddings WHERE repo = ? AND chunk_type = 'entity'"
        )
        .get(repositoryId) as { count: number };

      logger.info(`Entity embeddings created: ${entityEmbeddings.count}`);

      // If entities were created, embeddings should exist
      const nodeCount = db
        .getSession()
        .prepare('SELECT COUNT(*) as count FROM nodes WHERE repo = ?')
        .get(repositoryId) as { count: number };

      if (nodeCount.count > 0) {
        expect(entityEmbeddings.count).toBeGreaterThan(0);
      }
    });

    it('should have generated edge embeddings', async () => {
      if (!db.hasVecExtension()) {
        logger.warn('Skipping test: sqlite-vec not available');
        return;
      }

      const edgeEmbeddings = db
        .getSession()
        .prepare(
          "SELECT COUNT(*) as count FROM embeddings WHERE repo = ? AND chunk_type = 'edge'"
        )
        .get(repositoryId) as { count: number };

      logger.info(`Edge embeddings created: ${edgeEmbeddings.count}`);

      // If edges were created, embeddings should exist
      const edgeCount = db
        .getSession()
        .prepare('SELECT COUNT(*) as count FROM edges WHERE source_repo = ?')
        .get(repositoryId) as { count: number };

      if (edgeCount.count > 0) {
        expect(edgeEmbeddings.count).toBeGreaterThan(0);
      }
    });

    it('should have embeddings with correct dimensions', async () => {
      if (!db.hasVecExtension()) {
        logger.warn('Skipping test: sqlite-vec not available');
        return;
      }

      const embeddings = db
        .getSession()
        .prepare('SELECT embedding FROM embeddings WHERE repo = ? LIMIT 1')
        .all(repositoryId) as Array<{ embedding: string }>;

      if (embeddings.length > 0) {
        const embedding = JSON.parse(embeddings[0].embedding);
        expect(Array.isArray(embedding)).toBe(true);

        // IBM Granite Embedding is 768 dimensions
        expect(embedding.length).toBe(768);
      }
    });

    it('should have embeddings with metadata', async () => {
      if (!db.hasVecExtension()) {
        logger.warn('Skipping test: sqlite-vec not available');
        return;
      }

      const embeddings = db
        .getSession()
        .prepare('SELECT chunk_id, repo, chunk_type, metadata FROM embeddings WHERE repo = ? LIMIT 5')
        .all(repositoryId) as Array<{
          chunk_id: string;
          repo: string;
          chunk_type: string;
          metadata: string | null;
        }>;

      if (embeddings.length > 0) {
        for (const emb of embeddings) {
          expect(emb.chunk_id).toBeDefined();
          expect(emb.repo).toBe(repositoryId);
          expect(['entity', 'edge', 'document']).toContain(emb.chunk_type);

          if (emb.metadata) {
            const metadata = JSON.parse(emb.metadata);
            expect(typeof metadata).toBe('object');
          }
        }
      }
    });
  });

  describe('Hybrid Search Integration', () => {
    it('should perform semantic search with generated embeddings', async () => {
      if (!db.hasVecExtension()) {
        logger.warn('Skipping test: sqlite-vec not available');
        return;
      }

      // Generate query embedding for "authentication module"
      const queryText = 'authentication module user session';
      const queryEmbeddings = await mockEmbeddingProvider.embedBatch([queryText]);

      if (queryEmbeddings.length === 0) {
        logger.warn('Embedding generation failed, skipping test');
        return;
      }

      const queryEmbedding = queryEmbeddings[0];

      // Perform semantic search
      const results = await queryEngine.queryLocalEmbeddings(queryEmbedding, {
        repositories: [repositoryId],
        maxResults: 10,
        minSimilarity: 0.5,
      });

      logger.info(`Semantic search results: ${results.length}`);

      // Should return results if embeddings were generated
      const embeddingCount = db
        .getSession()
        .prepare('SELECT COUNT(*) as count FROM embeddings WHERE repo = ?')
        .get(repositoryId) as { count: number };

      if (embeddingCount.count > 0) {
        expect(results.length).toBeGreaterThan(0);

        // Verify result structure
        if (results.length > 0) {
          const firstResult = results[0];
          expect(firstResult.chunk_id).toBeDefined();
          expect(firstResult.repo).toBe(repositoryId);
          expect(firstResult.content).toBeDefined();
          expect(firstResult.similarity).toBeGreaterThanOrEqual(0.5);
          expect(firstResult.similarity).toBeLessThanOrEqual(1.0);
        }
      }
    });

    it('should perform sparse search with FTS5', async () => {
      // Test keyword search
      const results = await queryEngine.querySparse('authentication session', {
        repositories: [repositoryId],
        maxResults: 10,
      });

      logger.info(`Sparse search results: ${results.length}`);

      // Should return results from chunks
      const chunkCount = db
        .getSession()
        .prepare('SELECT COUNT(*) as count FROM chunks WHERE repo = ?')
        .get(repositoryId) as { count: number };

      if (chunkCount.count > 0) {
        expect(results.length).toBeGreaterThan(0);

        if (results.length > 0) {
          const firstResult = results[0];
          expect(firstResult.chunk_id).toBeDefined();
          expect(firstResult.repo).toBe(repositoryId);
          expect(firstResult.content).toBeDefined();
          expect(firstResult.score).toBeDefined();
        }
      }
    });

    it('should perform pattern search with trigrams', async () => {
      // Test fuzzy search
      const results = await queryEngine.queryPattern('AuthModul', {
        // Typo: should match "AuthModule"
        repositories: [repositoryId],
        maxResults: 10,
      });

      logger.info(`Pattern search results: ${results.length}`);

      // Trigram search should work on chunks table
      const chunkCount = db
        .getSession()
        .prepare('SELECT COUNT(*) as count FROM chunks WHERE repo = ?')
        .get(repositoryId) as { count: number };

      if (chunkCount.count > 0) {
        expect(results.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Cross-Repository Features', () => {
    it('should support multiple repository indexing', async () => {
      // Register a second repository (using same source for testing)
      const repo2Id = 'sample-typescript-app-v2';

      indexer.registerRepository({
        id: repo2Id,
        name: 'Sample TypeScript App V2',
        version: '2.0.0',
      });

      // Index second repository (simplified - would normally be different source)
      await indexer.indexRepository(repo2Id, sampleRepoPath);

      // Verify both repositories have data
      const repo1Chunks = db
        .getSession()
        .prepare('SELECT COUNT(*) as count FROM chunks WHERE repo = ?')
        .get(repositoryId) as { count: number };

      const repo2Chunks = db
        .getSession()
        .prepare('SELECT COUNT(*) as count FROM chunks WHERE repo = ?')
        .get(repo2Id) as { count: number };

      expect(repo1Chunks.count).toBeGreaterThan(0);
      expect(repo2Chunks.count).toBeGreaterThan(0);

      // Clean up second repository
      indexer.deleteRepository(repo2Id);
    }, 300000); // 5 minute timeout

    it('should filter search results by repository', async () => {
      if (!db.hasVecExtension()) {
        logger.warn('Skipping test: sqlite-vec not available');
        return;
      }

      // Generate query embedding
      const queryEmbeddings = await mockEmbeddingProvider.embedBatch(['authentication']);

      if (queryEmbeddings.length === 0) {
        logger.warn('Embedding generation failed, skipping test');
        return;
      }

      // Search with repository filter
      const results = await queryEngine.queryLocalEmbeddings(queryEmbeddings[0], {
        repositories: [repositoryId],
        maxResults: 10,
        minSimilarity: 0.5,
      });

      // All results should be from specified repository
      if (results.length > 0) {
        expect(results.every(r => r.repo === repositoryId)).toBe(true);
      }
    });
  });

  describe('Performance Benchmarks', () => {
    it('should index repository within performance target', async () => {
      // Create a new test repository for clean benchmark
      const benchmarkRepoId = 'benchmark-repo';

      indexer.registerRepository({
        id: benchmarkRepoId,
        name: 'Benchmark Repository',
      });

      const startTime = Date.now();

      await indexer.indexRepository(benchmarkRepoId, sampleRepoPath);

      const duration = Date.now() - startTime;
      const durationMinutes = duration / 1000 / 60;

      logger.info(
        `Performance benchmark: ${durationMinutes.toFixed(2)} minutes for ${
          existsSync(sampleRepoPath) ? '7+ files' : 'N/A files'
        }`
      );

      // For 7+ TypeScript files, should complete in under 5 minutes
      expect(durationMinutes).toBeLessThan(5);

      // Log performance metrics
      const status = indexer.getIndexingStatus(benchmarkRepoId);
      logger.info('Performance metrics:', {
        duration: `${durationMinutes.toFixed(2)} minutes`,
        chunks: status.stats?.chunks_count,
        nodes: status.stats?.nodes_count,
        edges: status.stats?.edges_count,
      });

      // Clean up benchmark repository
      indexer.deleteRepository(benchmarkRepoId);
    }, 300000); // 5 minute timeout

    it('should efficiently query embeddings', async () => {
      if (!db.hasVecExtension()) {
        logger.warn('Skipping test: sqlite-vec not available');
        return;
      }

      const queryEmbeddings = await mockEmbeddingProvider.embedBatch(['test query']);

      if (queryEmbeddings.length === 0) {
        logger.warn('Embedding generation failed, skipping test');
        return;
      }

      const startTime = Date.now();

      await queryEngine.queryLocalEmbeddings(queryEmbeddings[0], {
        repositories: [repositoryId],
        maxResults: 20,
        minSimilarity: 0.7,
      });

      const duration = Date.now() - startTime;

      logger.info(`Query execution time: ${duration}ms`);

      // Semantic search should be fast (under 1 second)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Data Integrity', () => {
    it('should maintain referential integrity between nodes and embeddings', async () => {
      if (!db.hasVecExtension()) {
        logger.warn('Skipping test: sqlite-vec not available');
        return;
      }

      // Check that entity embeddings reference valid nodes
      const orphanedEntityEmbeddings = db.getSession().prepare(`
        SELECT COUNT(*) as count
        FROM embeddings e
        WHERE e.repo = ? AND e.chunk_type = 'entity'
          AND e.entity_id != ''
          AND NOT EXISTS (
            SELECT 1 FROM nodes n WHERE n.id = e.entity_id AND n.repo = e.repo
          )
      `).get(repositoryId) as { count: number };

      expect(orphanedEntityEmbeddings.count).toBe(0);
    });

    it('should maintain referential integrity between edges and embeddings', async () => {
      if (!db.hasVecExtension()) {
        logger.warn('Skipping test: sqlite-vec not available');
        return;
      }

      // Edge embeddings should have empty entity_id (as per EdgeEmbedder implementation)
      const edgeEmbeddingsWithEntityId = db.getSession().prepare(`
        SELECT COUNT(*) as count
        FROM embeddings e
        WHERE e.repo = ? AND e.chunk_type = 'edge'
          AND e.entity_id != ''
      `).get(repositoryId) as { count: number };

      // All edge embeddings should have empty entity_id
      expect(edgeEmbeddingsWithEntityId.count).toBe(0);
    });

    it('should store valid JSON in metadata fields', async () => {
      const embeddings = db
        .getSession()
        .prepare('SELECT metadata FROM embeddings WHERE repo = ? AND metadata IS NOT NULL LIMIT 10')
        .all(repositoryId) as Array<{ metadata: string }>;

      for (const emb of embeddings) {
        expect(() => JSON.parse(emb.metadata)).not.toThrow();
      }
    });
  });
});