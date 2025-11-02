import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GraphDatabaseConnection } from '../../src/lib/graph-database.js';
import { existsSync, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';

describe('End-to-End: sqlite-vec Integration', () => {
  const testDbPath = './tests/fixtures/test-e2e-vec.db';
  let db: GraphDatabaseConnection;

  beforeAll(() => {
    // Ensure fixtures directory exists
    if (!existsSync('./tests/fixtures')) {
      mkdirSync('./tests/fixtures', { recursive: true });
    }
    db = new GraphDatabaseConnection(testDbPath);
  });

  afterAll(async () => {
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

  it('should have loaded sqlite-vec extension', () => {
    expect(db.hasVecExtension()).toBe(true);
  });

  it('should create and query embeddings end-to-end', () => {
    if (!db.hasVecExtension()) {
      console.log('Skipping test: sqlite-vec not available');
      return;
    }

    // Simulate embedding generation for sample content
    const sampleContent = [
      {
        id: 'react::hooks::useState',
        content: 'useState is a React Hook that lets you add state to functional components',
        category: 'react-hooks',
      },
      {
        id: 'react::hooks::useEffect',
        content: 'useEffect is a React Hook for side effects like data fetching and subscriptions',
        category: 'react-hooks',
      },
      {
        id: 'sqlite::vec::distance',
        content: 'vec_distance_cosine calculates cosine distance between two vectors',
        category: 'sqlite',
      },
    ];

    // Insert embeddings (using simple embeddings for testing)
    const stmt = db.getSession().prepare(`
      INSERT INTO embeddings (chunk_id, repo, entity_id, chunk_type, content, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < sampleContent.length; i++) {
      const embedding = new Array(768).fill(0);
      // Create distinct embeddings by setting different indices
      embedding[i * 10] = 1.0;
      embedding[(i * 10) + 1] = 0.5;

      stmt.run(
        sampleContent[i].id,
        'test',
        '',
        'documentation',
        sampleContent[i].content,
        JSON.stringify(embedding),
        JSON.stringify({ category: sampleContent[i].category })
      );
    }

    // Query for similar embeddings
    const queryEmbedding = new Array(768).fill(0);
    queryEmbedding[0] = 1.0; // Similar to first item
    queryEmbedding[1] = 0.5;

    const results = db.getSession().prepare(`
      SELECT
        chunk_id,
        content,
        vec_distance_cosine(embedding, ?) as distance
      FROM embeddings
      ORDER BY distance ASC
      LIMIT 3
    `).all(JSON.stringify(queryEmbedding)) as Array<{
      chunk_id: string;
      content: string;
      distance: number;
    }>;

    // Verify results
    expect(results.length).toBe(3);
    expect(results[0].chunk_id).toBe('react::hooks::useState'); // Closest match
    expect(results[0].distance).toBeLessThan(0.1); // Very similar
    expect(results[1].distance).toBeGreaterThan(results[0].distance); // Further away
  });

  it('should support repository filtering in vector search', () => {
    if (!db.hasVecExtension()) {
      console.log('Skipping test: sqlite-vec not available');
      return;
    }

    // Insert embeddings for different repos
    const embedding = new Array(768).fill(0);
    embedding[0] = 1.0;

    db.getSession().prepare(`
      INSERT INTO embeddings (chunk_id, repo, entity_id, chunk_type, content, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('repo1::item', 'repo1', '', 'entity', 'repo1 content', JSON.stringify(embedding), '{}');

    const embedding2 = new Array(768).fill(0);
    embedding2[0] = 1.0;

    db.getSession().prepare(`
      INSERT INTO embeddings (chunk_id, repo, entity_id, chunk_type, content, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('repo2::item', 'repo2', '', 'entity', 'repo2 content', JSON.stringify(embedding2), '{}');

    // Query with repository filter
    const results = db.getSession().prepare(`
      SELECT chunk_id, repo
      FROM embeddings
      WHERE repo = ?
      AND vec_distance_cosine(embedding, ?) < 0.5
    `).all('repo1', JSON.stringify(embedding)) as Array<{ chunk_id: string; repo: string }>;

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.repo === 'repo1')).toBe(true);
  });

  it('should verify vec_version function is available', () => {
    if (!db.hasVecExtension()) {
      console.log('Skipping test: sqlite-vec not available');
      return;
    }

    const result = db.getSession()
      .prepare('SELECT vec_version() as version')
      .get() as { version: string };

    expect(result.version).toMatch(/^v\d+\.\d+\.\d+/); // e.g., v0.1.6
  });
});
