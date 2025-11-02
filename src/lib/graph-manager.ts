/**
 * Graph manager for building and analyzing the knowledge graph
 */

import type { GraphDatabaseConnection } from './graph-database.js';
import type { Logger, CentralityData, ElementSummary } from '../types/index.js';

export class GraphManager {
  private logger: Logger;
  private dbConnection: GraphDatabaseConnection;

  constructor(dbConnection: GraphDatabaseConnection, logger: Logger) {
    this.dbConnection = dbConnection;
    this.logger = logger;
  }

  /**
   * Build the graph from document summaries
   */
  buildGraph(summaries: ElementSummary[]): void {
    const entities: Map<string, string> = new Map();
    const db = this.dbConnection.getSession();

    for (const summary of summaries) {
      const lines = summary.split('\n');
      let entitiesSection = false;
      let relationshipsSection = false;

      for (const line of lines) {
        // Check for section headers
        if (
          line.startsWith('### Entities:') ||
          line.startsWith('**Entities:**') ||
          line.startsWith('Entities:')
        ) {
          entitiesSection = true;
          relationshipsSection = false;
          continue;
        } else if (
          line.startsWith('### Relationships:') ||
          line.startsWith('**Relationships:**') ||
          line.startsWith('Relationships:')
        ) {
          entitiesSection = false;
          relationshipsSection = true;
          continue;
        }

        // Process entities
        if (entitiesSection && line.trim()) {
          let entityName: string;
          if (line[0]?.match(/\d/) && line.includes('.')) {
            entityName = line.split('.', 2)[1]?.trim() || '';
          } else {
            entityName = line.trim();
          }
          entityName = this.normalizeEntityName(entityName.replace(/\*\*/g, ''));
          this.logger.debug(`Creating node: ${entityName}`);

          const stmt = db.prepare('INSERT OR IGNORE INTO nodes (id, properties) VALUES (?, ?)');
          stmt.run(entityName, '{}');
          entities.set(entityName, entityName);
        }

        // Process relationships
        else if (relationshipsSection && line.trim()) {
          const parts = line.split('->').map((p) => p.trim());
          if (parts.length === 3) {
            const source = this.normalizeEntityName(parts[0] || '');
            const relationshipPart = parts[1] || '';
            const target = this.normalizeEntityName(parts[2] || '');

            const relationName = this.sanitizeRelationshipName(
              (relationshipPart.split('[')[0] || '').trim()
            );

            const strengthMatch = relationshipPart.match(/\[strength:\s*([0-9]*\.?[0-9]+)\]/i);
            const weight = strengthMatch ? parseFloat(strengthMatch[1] || '1') : 1.0;

            this.logger.debug(
              `Parsed relationship: ${source} -> ${relationName} -> ${target} [weight: ${weight}]`
            );

            if (entities.has(source) && entities.has(target)) {
              const stmt = db.prepare(
                'INSERT OR REPLACE INTO edges (source, target, relationship, weight) VALUES (?, ?, ?, ?)'
              );
              stmt.run(source, target, relationName, weight);
            } else {
              this.logger.debug(
                `Skipping relationship: ${source} -> ${relationName} -> ${target} (one or both entities not found)`
              );
            }
          } else {
            this.logger.warn('Skipping relationship with unexpected format:', line);
          }
        }
      }
    }
  }

  /**
   * Reproject the graph (verify weights in SQLite context)
   */
  reprojectGraph(): void {
    this.verifyRelationshipWeights();
  }

  /**
   * Calculate centrality measures for the graph
   */
  calculateCentralityMeasures(): CentralityData {
    const db = this.dbConnection.getSession();

    // Degree centrality: count incoming/outgoing edges for each node
    const degreeCentralityQuery = `
      SELECT id,
             (SELECT COUNT(*) FROM edges WHERE source = nodes.id) +
             (SELECT COUNT(*) FROM edges WHERE target = nodes.id) as degree
      FROM nodes
      ORDER BY degree DESC
      LIMIT 10
    `;

    this.logger.debug('Starting degree centrality query');
    const startTime = performance.now();
    const degreeCentralityResult = db.prepare(degreeCentralityQuery).all() as Array<{
      id: string;
      degree: number;
    }>;
    const endTime = performance.now();
    this.logger.debug(
      `Degree centrality query completed in ${(endTime - startTime).toFixed(8)} seconds`
    );

    // SQLite does not have graph-native support for betweenness and closeness
    const centralityData: CentralityData = {
      degree: degreeCentralityResult.map((row) => ({
        entityName: row.id,
        score: row.degree,
      })),
      betweenness: [],
      closeness: [],
    };

    return centralityData;
  }

  /**
   * Summarize centrality measures into human-readable format
   */
  summarizeCentralityMeasures(centralityData: CentralityData): string {
    let summary = '### Centrality Measures Summary:\n';

    summary += '#### Top Degree Centrality Nodes (most connected):\n';
    for (const record of centralityData.degree) {
      summary += ` - ${record.entityName} with score ${record.score}\n`;
    }

    summary += '\n#### Top Betweenness Centrality Nodes (influential intermediaries):\n';
    summary += '(Not calculated)\n';

    summary += '\n#### Top Closeness Centrality Nodes (closest to all others):\n';
    summary += '(Not calculated)\n';

    return summary;
  }

  /**
   * Verify that all relationships have weights
   */
  private verifyRelationshipWeights(): void {
    const db = this.dbConnection.getSession();
    const query = 'SELECT * FROM edges WHERE weight IS NULL LIMIT 5';

    this.logger.debug('Starting verify relationship weights query');
    const startTime = performance.now();
    const missingWeights = db.prepare(query).all();
    const endTime = performance.now();
    this.logger.debug(
      `Verify relationship weights query completed in ${(endTime - startTime).toFixed(8)} seconds`
    );

    if (missingWeights.length > 0) {
      this.logger.warn('Warning: Some relationships do not have weights assigned.', missingWeights);
    }
  }

  /**
   * Get all relationship types in the graph
   */
  getRelationshipTypes(): string[] {
    const db = this.dbConnection.getSession();
    const query = 'SELECT DISTINCT relationship FROM edges';

    this.logger.debug('Starting get relationship types query');
    const startTime = performance.now();
    const result = db.prepare(query).all() as Array<{ relationship: string }>;
    const endTime = performance.now();
    this.logger.debug(
      `Get relationship types query completed in ${(endTime - startTime).toFixed(8)} seconds`
    );

    return result.map((record) => record.relationship);
  }

  /**
   * Normalize entity name (lowercase and trim)
   */
  private normalizeEntityName(name: string): string {
    return name.trim().toLowerCase();
  }

  /**
   * Sanitize relationship name (replace non-word characters with underscores)
   */
  private sanitizeRelationshipName(name: string): string {
    return name.trim().toLowerCase().replace(/\W+/g, '_');
  }
}
