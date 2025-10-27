/**
 * Graph database connection and management using SQLite
 */

import Database from 'better-sqlite3';
import type { GraphNode, GraphEdge } from '../types/index.js';

export class GraphDatabaseConnection {
  private db: Database.Database;

  constructor(dbPath: string = 'data/graph_database.sqlite') {
    if (!dbPath) {
      throw new Error('Database path must be provided to initialize the DatabaseConnection.');
    }

    this.db = new Database(dbPath);

    // Use WAL mode for better performance
    this.db.pragma('journal_mode = WAL');

    this.initializeSchema();
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

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS source_idx ON edges(source)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS target_idx ON edges(target)
    `);
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
  }

  /**
   * Insert a node into the database
   */
  insertNode(node: GraphNode): void {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO nodes (id, properties) VALUES (?, ?)'
    );
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
    return rows.map(row => ({
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
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
