/**
 * Graph database connection and management using SQLite
 *
 * Database includes:
 * - nodes: Graph entities
 * - edges: Graph relationships
 * - chunks: Text content for hybrid search (FTS5 + trigram)
 * - chunks_fts: Full-text search index (BM25)
 * - chunks_trigram: Fuzzy matching with Levenshtein distance
 *
 * Future: sqlite-vec integration for entity & edge embeddings
 * - Entities: "name :: kind :: hints" → Granite Embedding
 * - Edges: "S <predicate> O :: context:..." → Granite Embedding
 * - Triple extraction via SciPhi/Triplex
 *
 * See: docs/SQLITE-VEC-INTEGRATION-PLAN.md
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import type { GraphNode, GraphEdge } from '../types/index.js';
import { generateTrigrams } from '../utils/trigram.js';
import { MigrationRunner, allMigrations } from './migrations/index.js';

export class GraphDatabaseConnection {
  private db: Database.Database;
  private vecExtensionLoaded: boolean = false;

  constructor(dbPath: string = 'data/graph_database.sqlite') {
    if (!dbPath) {
      throw new Error('Database path must be provided to initialize the DatabaseConnection.');
    }

    this.db = new Database(dbPath);

    // Use WAL mode for better performance
    this.db.pragma('journal_mode = WAL');

    // Enforce foreign keys (needed for declared FKs and cascades)
    this.db.pragma('foreign_keys = ON');

    // Load sqlite-vec extension before schema initialization
    this.loadVecExtension();

    // Initialize base schema first
    this.initializeSchema();

    // Run migrations after base schema exists
    this.runMigrations();
  }

  /**
   * Load sqlite-vec extension for vector operations
   */
  private loadVecExtension(): void {
    try {
      // Platform detection
      const platform = process.platform;
      const arch = process.arch;
      
      // Note: better-sqlite3 automatically adds the platform-specific extension (.dylib/.dll/.so)
      // so we pass 'vec0' without extension
      const extensionBaseName = 'vec0';
      
      // Try multiple possible locations
      // Handle both development (src/lib/) and production (build/lib/) paths
      const possiblePaths = [
        // Production build (from build/lib/graph-database.js)
        join(process.cwd(), 'lib/sqlite-vec', extensionBaseName),
        // Development with tsx (from src/lib/graph-database.ts)
        join(process.cwd(), 'lib/sqlite-vec', extensionBaseName),
        // Platform-specific subdirectory
        join(process.cwd(), 'lib/sqlite-vec', `${platform}-${arch}`, extensionBaseName),
        join(process.cwd(), 'lib/sqlite-vec', `${platform}-${arch}`, extensionBaseName),
      ];
      
      let loaded = false;
      for (const path of possiblePaths) {
        try {
          this.db.loadExtension(path);
          this.vecExtensionLoaded = true;
          loaded = true;
          console.log(`✓ Loaded sqlite-vec extension from: ${path}`);
          break;
        } catch (err) {
          // Try next path
          continue;
        }
      }
      
      if (!loaded) {
        console.warn('sqlite-vec extension not found in expected locations');
        console.warn('Semantic search will be disabled');
        this.vecExtensionLoaded = false;
      }
    } catch (error) {
      console.warn('Failed to load sqlite-vec extension:', error);
      console.warn('Semantic search will be disabled');
      this.vecExtensionLoaded = false;
    }
  }

  /**
   * Run database migrations
   */
  private runMigrations(): void {
    const migrationRunner = new MigrationRunner(this.db);
    migrationRunner.runMigrations(allMigrations);
  }

  /**
   * Initialize the database schema
   */
  private initializeSchema(): void {
    // Create nodes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        properties TEXT
      )
    `);

    // Create edges table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS edges (
        source TEXT,
        target TEXT,
        relationship TEXT,
        weight REAL,
        PRIMARY KEY (source, target, relationship),
        FOREIGN KEY (source) REFERENCES nodes(id),
        FOREIGN KEY (target) REFERENCES nodes(id)
      )
    `);

    // Create chunks table for text content
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        chunk_id TEXT PRIMARY KEY,
        repo TEXT,
        entity_id TEXT,
        chunk_type TEXT,
        content TEXT NOT NULL,
        metadata TEXT
      )
    `);

    // Create FTS5 virtual table for sparse retrieval
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
          chunk_id UNINDEXED,
          repo UNINDEXED,
          entity_id UNINDEXED,
          content,
          tokenize='porter unicode61'
        )
      `);
    } catch {
      // FTS5 not available - sparse search will be disabled
    }

    // Create trigram table for fuzzy matching
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks_trigram (
        chunk_id TEXT NOT NULL,
        trigram TEXT NOT NULL,
        position INTEGER NOT NULL,
        FOREIGN KEY (chunk_id) REFERENCES chunks(chunk_id)
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS source_idx ON edges(source)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS target_idx ON edges(target)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS chunks_repo_idx ON chunks(repo)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS chunks_entity_idx ON chunks(entity_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS chunks_trigram_idx ON chunks_trigram(trigram)
    `);

    // Create embeddings virtual table (only if sqlite-vec loaded)
    if (this.vecExtensionLoaded) {
      try {
        console.log('Creating embeddings virtual table with vec0...');
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
            chunk_id TEXT PRIMARY KEY,
            repo TEXT,
            entity_id TEXT,
            chunk_type TEXT CHECK(chunk_type IN ('entity', 'edge', 'documentation', 'code', 'comment')),
            content TEXT,
            embedding FLOAT[768],
            metadata TEXT
          )
        `);
        
        console.log('✓ Embeddings table created successfully');
      } catch (error) {
        console.warn('Failed to create embeddings virtual table:', error);
        console.warn('Semantic search will be disabled');
        this.vecExtensionLoaded = false;
      }
    }
  }

  /**
   * Get the database connection
   */
  getSession(): Database.Database {
    return this.db;
  }

  /**
   * Clear all data from the database
   */
  clearDatabase(): void {
    this.db.exec('DELETE FROM edges');
    this.db.exec('DELETE FROM nodes');
    this.db.exec('DELETE FROM chunks');
    try {
      this.db.exec('DELETE FROM chunks_fts');
    } catch {
      /* ignore if FTS5 absent */
    }
    this.db.exec('DELETE FROM chunks_trigram');
  }

  /**
   * Insert a node into the database
   */
  insertNode(node: GraphNode): void {
    const stmt = this.db.prepare('INSERT OR IGNORE INTO nodes (id, properties) VALUES (?, ?)');
    stmt.run(node.id, JSON.stringify(node.properties));
  }

  /**
   * Insert an edge into the database
   */
  insertEdge(edge: GraphEdge): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO edges (source, target, relationship, weight) VALUES (?, ?, ?, ?)'
    );
    stmt.run(edge.source, edge.target, edge.relationship, edge.weight);
  }

  /**
   * Get all nodes
   */
  getAllNodes(): GraphNode[] {
    const stmt = this.db.prepare('SELECT id, properties FROM nodes');
    const rows = stmt.all() as Array<{ id: string; properties: string }>;
    return rows.map((row) => ({
      id: row.id,
      properties: JSON.parse(row.properties),
    }));
  }

  /**
   * Get all edges
   */
  getAllEdges(): GraphEdge[] {
    const stmt = this.db.prepare('SELECT source, target, relationship, weight FROM edges');
    return stmt.all() as GraphEdge[];
  }

  /**
   * Check if FTS5 table exists and is usable
   */
  hasFTS5Support(): boolean {
    try {
      const result = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_fts'")
        .get();
      return !!result;
    } catch {
      return false;
    }
  }

  /**
   * Check if sqlite-vec extension is loaded
   */
  hasVecExtension(): boolean {
    return this.vecExtensionLoaded;
  }

  /**
   * Insert a chunk into the database
   */
  insertChunk(chunk: {
    chunk_id: string;
    repo: string;
    entity_id?: string;
    chunk_type: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): void {
    // Insert into chunks table
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chunks
      (chunk_id, repo, entity_id, chunk_type, content, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      chunk.chunk_id,
      chunk.repo,
      chunk.entity_id || null,
      chunk.chunk_type,
      chunk.content,
      chunk.metadata ? JSON.stringify(chunk.metadata) : null
    );

    // Insert into FTS5 table if available
    if (this.hasFTS5Support()) {
      try {
        const ftsStmt = this.db.prepare(`
          INSERT OR REPLACE INTO chunks_fts
          (chunk_id, repo, entity_id, content)
          VALUES (?, ?, ?, ?)
        `);

        ftsStmt.run(chunk.chunk_id, chunk.repo, chunk.entity_id || null, chunk.content);
      } catch {
        // FTS5 insert failed - continue without sparse indexing
      }
    }

    // Insert trigrams for pattern matching
    try {
      const trigrams = generateTrigrams(chunk.content);
      const trigramStmt = this.db.prepare(`
        INSERT INTO chunks_trigram (chunk_id, trigram, position)
        VALUES (?, ?, ?)
      `);

      trigrams.forEach((trigram, position) => {
        trigramStmt.run(chunk.chunk_id, trigram, position);
      });
    } catch {
      // Trigram insert failed - continue without fuzzy matching
    }
  }

  /**
   * Insert multiple chunks in a transaction
   */
  insertChunks(
    chunks: Array<{
      chunk_id: string;
      repo: string;
      entity_id?: string;
      chunk_type: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>
  ): void {
    const transaction = this.db.transaction(() => {
      for (const chunk of chunks) {
        this.insertChunk(chunk);
      }
    });

    transaction();
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}