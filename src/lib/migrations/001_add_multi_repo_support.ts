/**
 * Migration 001: Add Multi-Repository Support
 *
 * This migration adds:
 * 1. repositories table for tracking indexed repositories
 * 2. cross_references table for inter-repository entity links
 * 3. repo columns to nodes and edges tables
 * 4. Indexes for repo-based filtering
 * 5. Migration of existing data to 'default' repository
 */

import type Database from 'better-sqlite3';
import type { Migration } from './types.js';

export const migration001: Migration = {
  version: 1,
  name: 'add_multi_repo_support',

  up: (db: Database.Database) => {
    console.log('  Creating repositories table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
        version TEXT,
        branch TEXT,
        commit_hash TEXT,
        metadata TEXT,
        embedding_model TEXT
      )
    `);

    console.log('  Creating cross_references table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS cross_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_repo TEXT NOT NULL,
        from_entity TEXT NOT NULL,
        to_repo TEXT NOT NULL,
        to_entity TEXT NOT NULL,
        type TEXT NOT NULL,
        strength REAL DEFAULT 1.0,
        context TEXT,
        FOREIGN KEY (from_repo) REFERENCES repositories(id),
        FOREIGN KEY (to_repo) REFERENCES repositories(id)
      )
    `);

    console.log('  Adding repo column to nodes table...');
    // Check if repo column already exists
    const nodeColumns = db.prepare("PRAGMA table_info(nodes)").all() as Array<{ name: string }>;
    if (!nodeColumns.some(col => col.name === 'repo')) {
      db.exec(`ALTER TABLE nodes ADD COLUMN repo TEXT DEFAULT 'default'`);
    }

    console.log('  Adding repo columns to edges table...');
    // Check if source_repo column already exists
    const edgeColumns = db.prepare("PRAGMA table_info(edges)").all() as Array<{ name: string }>;
    if (!edgeColumns.some(col => col.name === 'source_repo')) {
      db.exec(`ALTER TABLE edges ADD COLUMN source_repo TEXT DEFAULT 'default'`);
    }
    if (!edgeColumns.some(col => col.name === 'target_repo')) {
      db.exec(`ALTER TABLE edges ADD COLUMN target_repo TEXT DEFAULT 'default'`);
    }

    console.log('  Creating indexes for repo columns...');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_repo ON nodes(repo)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_edges_source_repo ON edges(source_repo)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_edges_target_repo ON edges(target_repo)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cross_refs_from_repo ON cross_references(from_repo)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cross_refs_to_repo ON cross_references(to_repo)`);

    console.log('  Migrating existing data...');
    // Update existing nodes to have 'default' repo
    const nodeCount = db.prepare("UPDATE nodes SET repo = 'default' WHERE repo IS NULL").run();
    console.log(`    Updated ${nodeCount.changes} nodes to 'default' repository`);

    // Update existing edges to have 'default' repo
    const edgeCount = db.prepare("UPDATE edges SET source_repo = 'default', target_repo = 'default' WHERE source_repo IS NULL").run();
    console.log(`    Updated ${edgeCount.changes} edges to 'default' repository`);

    console.log('  Creating default repository record...');
    // Insert default repository if it doesn't exist
    db.prepare(`
      INSERT OR IGNORE INTO repositories (id, name, metadata)
      VALUES ('default', 'Default Repository', '{"migrated": true, "created_by": "migration_001"}')
    `).run();

    console.log('  Adding NOT NULL constraints...');
    // Note: SQLite doesn't support ALTER COLUMN, so we document the constraint
    // New inserts should enforce NOT NULL via application logic
  },

  down: (db: Database.Database) => {
    console.log('  Rolling back multi-repository support...');

    // Drop indexes
    db.exec(`DROP INDEX IF EXISTS idx_cross_refs_to_repo`);
    db.exec(`DROP INDEX IF EXISTS idx_cross_refs_from_repo`);
    db.exec(`DROP INDEX IF EXISTS idx_edges_target_repo`);
    db.exec(`DROP INDEX IF EXISTS idx_edges_source_repo`);
    db.exec(`DROP INDEX IF EXISTS idx_nodes_repo`);

    // Drop tables
    db.exec(`DROP TABLE IF EXISTS cross_references`);
    db.exec(`DROP TABLE IF EXISTS repositories`);

    // Note: SQLite doesn't support DROP COLUMN, so columns remain but unused
    // This is acceptable for rollback - columns will be ignored by old code
    console.log('  Note: repo columns remain in nodes/edges tables (SQLite limitation)');
  },
};
