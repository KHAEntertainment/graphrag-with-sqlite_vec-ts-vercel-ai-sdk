/**
 * Migration runner for database schema versioning
 */

import type Database from 'better-sqlite3';
import type { Migration, MigrationRecord } from './types.js';
import { DatabaseSchemaError } from '../../types/errors.js';

export class MigrationRunner {
  constructor(private db: Database.Database) {
    this.initializeSchemaVersionTable();
  }

  /**
   * Create schema_version table if it doesn't exist
   */
  private initializeSchemaVersionTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  /**
   * Get current schema version
   */
  getCurrentVersion(): number {
    const result = this.db
      .prepare('SELECT MAX(version) as version FROM schema_version')
      .get() as { version: number | null };

    return result.version ?? 0;
  }

  /**
   * Get all applied migrations
   */
  getAppliedMigrations(): MigrationRecord[] {
    return this.db
      .prepare('SELECT version, name, applied_at FROM schema_version ORDER BY version')
      .all() as MigrationRecord[];
  }

  /**
   * Apply a single migration
   */
  private applyMigration(migration: Migration): void {
    const currentVersion = this.getCurrentVersion();

    if (migration.version <= currentVersion) {
      // Migration already applied
      return;
    }

    try {
      // Run migration in transaction
      const transaction = this.db.transaction(() => {
        migration.up(this.db);

        // Record migration
        this.db
          .prepare(
            `INSERT INTO schema_version (version, name) VALUES (?, ?)`
          )
          .run(migration.version, migration.name);
      });

      transaction();

      console.log(`✅ Applied migration ${migration.version}: ${migration.name}`);
    } catch (error) {
      throw new DatabaseSchemaError(
        'schema_version',
        `Migration ${migration.version} (${migration.name}): ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Rollback a single migration
   */
  rollbackMigration(migration: Migration): void {
    const currentVersion = this.getCurrentVersion();

    if (migration.version > currentVersion) {
      // Migration not applied
      return;
    }

    try {
      // Run rollback in transaction
      const transaction = this.db.transaction(() => {
        migration.down(this.db);

        // Remove migration record
        this.db.prepare('DELETE FROM schema_version WHERE version = ?').run(migration.version);
      });

      transaction();

      console.log(`↩️  Rolled back migration ${migration.version}: ${migration.name}`);
    } catch (error) {
      throw new DatabaseSchemaError(
        'schema_version',
        `Rollback migration ${migration.version} (${migration.name}): ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Apply all pending migrations
   */
  runMigrations(migrations: Migration[]): void {
    const currentVersion = this.getCurrentVersion();
    const pendingMigrations = migrations
      .filter((m) => m.version > currentVersion)
      .sort((a, b) => a.version - b.version);

    if (pendingMigrations.length === 0) {
      console.log('✨ Database schema is up to date');
      return;
    }

    console.log(`📦 Applying ${pendingMigrations.length} pending migrations...`);

    for (const migration of pendingMigrations) {
      this.applyMigration(migration);
    }

    console.log('✅ All migrations applied successfully');
  }

  /**
   * Rollback to a specific version
   */
  rollbackTo(targetVersion: number, migrations: Migration[]): void {
    const currentVersion = this.getCurrentVersion();

    if (targetVersion >= currentVersion) {
      console.log('Nothing to rollback');
      return;
    }

    const migrationsToRollback = migrations
      .filter((m) => m.version > targetVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version); // Rollback in reverse order

    console.log(`↩️  Rolling back ${migrationsToRollback.length} migrations to version ${targetVersion}...`);

    for (const migration of migrationsToRollback) {
      this.rollbackMigration(migration);
    }

    console.log('✅ Rollback completed');
  }
}