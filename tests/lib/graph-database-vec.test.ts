import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphDatabaseConnection } from '../../src/lib/graph-database.js';
import { existsSync, mkdirSync } from 'fs';
import { unlink, rm } from 'fs/promises';

describe('GraphDatabaseConnection - sqlite-vec Extension', () => {
  const testDbPath = './tests/fixtures/test-vec-extension.db';
  let db: GraphDatabaseConnection;

  beforeEach(() => {
    // Ensure fixtures directory exists
    if (!existsSync('./tests/fixtures')) {
      mkdirSync('./tests/fixtures', { recursive: true });
    }
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
    // Clean up test database
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

  it('should load sqlite-vec extension on initialization', () => {
    db = new GraphDatabaseConnection(testDbPath);

    // Check if extension loaded
    const hasVec = db.hasVecExtension();

    // If vec0.dylib exists, should be true; otherwise gracefully false
    if (existsSync('./lib/sqlite-vec/vec0.dylib')) {
      expect(hasVec).toBe(true);
    } else {
      expect(hasVec).toBe(false);
    }
  });

  it('should create embeddings table when extension loaded', () => {
    db = new GraphDatabaseConnection(testDbPath);

    if (db.hasVecExtension()) {
      const result = db.getSession()
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'")
        .get() as { name: string } | undefined;

      expect(result).toBeDefined();
      expect(result?.name).toBe('embeddings');
    }
  });

  it('should not fail when extension is unavailable', () => {
    // Test graceful degradation
    expect(() => {
      db = new GraphDatabaseConnection(testDbPath);
    }).not.toThrow();

    // System should still function without vec extension
    expect(db).toBeDefined();
    expect(db.getSession()).toBeDefined();
  });

  it('should insert and query embeddings when extension available', () => {
    db = new GraphDatabaseConnection(testDbPath);

    if (!db.hasVecExtension()) {
      console.log('Skipping test: sqlite-vec not available');
      return;
    }

    // Create a simple 768-dimensional embedding (all zeros except first element)
    const testEmbedding = new Array(768).fill(0);
    testEmbedding[0] = 1.0;

    // Insert test embedding
    const stmt = db.getSession().prepare(`
      INSERT INTO embeddings (chunk_id, repo, entity_id, chunk_type, content, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      'test::entity::hello',
      'test',
      '',  // Use empty string instead of null
      'entity',
      'function hello() { return "world"; }',
      JSON.stringify(testEmbedding),
      '{}'
    );

    // Verify insertion
    const result = db.getSession()
      .prepare('SELECT chunk_id, repo, content FROM embeddings WHERE chunk_id = ?')
      .get('test::entity::hello') as { chunk_id: string; repo: string; content: string } | undefined;

    expect(result).toBeDefined();
    expect(result?.chunk_id).toBe('test::entity::hello');
    expect(result?.repo).toBe('test');
  });

  it('should calculate cosine distance correctly', () => {
    db = new GraphDatabaseConnection(testDbPath);

    if (!db.hasVecExtension()) {
      console.log('Skipping test: sqlite-vec not available');
      return;
    }

    // Insert two embeddings
    const embedding1 = new Array(768).fill(0);
    embedding1[0] = 1.0;

    const embedding2 = new Array(768).fill(0);
    embedding2[0] = 0.9;
    embedding2[1] = 0.1;

    db.getSession().prepare(`
      INSERT INTO embeddings (chunk_id, repo, entity_id, chunk_type, content, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('test::1', 'test', '', 'entity', 'test1', JSON.stringify(embedding1), '{}');

    db.getSession().prepare(`
      INSERT INTO embeddings (chunk_id, repo, entity_id, chunk_type, content, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('test::2', 'test', '', 'entity', 'test2', JSON.stringify(embedding2), '{}');

    // Query with embedding1
    const results = db.getSession().prepare(`
      SELECT
        chunk_id,
        vec_distance_cosine(embedding, ?) as distance
      FROM embeddings
      ORDER BY distance ASC
    `).all(JSON.stringify(embedding1)) as Array<{ chunk_id: string; distance: number }>;

    expect(results.length).toBe(2);
    expect(results[0].chunk_id).toBe('test::1'); // Closest to itself
    expect(results[0].distance).toBeLessThan(0.01); // Very similar
    expect(results[1].chunk_id).toBe('test::2');
    expect(results[1].distance).toBeGreaterThan(0); // Different
  });

  it('should handle large batch inserts efficiently', () => {
    db = new GraphDatabaseConnection(testDbPath);

    if (!db.hasVecExtension()) {
      console.log('Skipping test: sqlite-vec not available');
      return;
    }

    // Insert 100 embeddings
    const stmt = db.getSession().prepare(`
      INSERT INTO embeddings (chunk_id, repo, entity_id, chunk_type, content, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.getSession().transaction((embeddings: Array<Array<unknown>>) => {
      for (const emb of embeddings) {
        stmt.run(...emb);
      }
    });

    const embeddings: Array<Array<unknown>> = [];
    for (let i = 0; i < 100; i++) {
      const embedding = new Array(768).fill(0);
      embedding[i % 768] = 1.0;
      embeddings.push([
        `test::batch::${i}`,
        'test',
        '',  // Use empty string instead of null
        'entity',
        `test content ${i}`,
        JSON.stringify(embedding),
        '{}'
      ]);
    }

    transaction(embeddings);

    // Verify count
    const count = db.getSession()
      .prepare('SELECT COUNT(*) as count FROM embeddings')
      .get() as { count: number };

    expect(count.count).toBe(100);
  });
});