/**
 * Query Engine for Local GraphRAG Database
 *
 * This module provides query capabilities against the local SQLite database
 * with sqlite-vec for semantic search and graph querying.
 */

import type { Database } from "better-sqlite3";
import type { Embedding } from "../../types/embedding.js";
import { Logger } from "../../lib/logger.js";

/**
 * Query result from semantic search
 */
export interface SemanticResult {
  chunk_id: string;
  repo: string;
  content: string;
  distance: number;
  metadata?: Record<string, unknown>;
}

/**
 * Query result from graph database
 */
export interface GraphResult {
  id: string;
  repo: string;
  properties: Record<string, unknown>;
  relationship?: string;
  weight?: number;
}

/**
 * Cross-reference between repositories
 */
export interface CrossReference {
  from_repo: string;
  from_entity: string;
  to_repo: string;
  to_entity: string;
  type: string;
  strength: number;
}

/**
 * Combined query results
 */
export interface CombinedResults {
  semantic: SemanticResult[];
  graph: GraphResult[];
  crossRefs: CrossReference[];
  totalTokens: number;
}

/**
 * Query options
 */
export interface QueryOptions {
  repositories?: string[] | undefined;
  maxResults?: number;
  minSimilarity?: number;
}

/**
 * Query Engine for local database
 */
export class QueryEngine {
  private logger: Logger;

  constructor(private db: Database) {
    this.logger = new Logger();
  }

  /**
   * Check if sqlite-vec extension is available
   */
  private hasVecExtension(): boolean {
    try {
      const result = this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'"
        )
        .get();
      return !!result;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if cross_references table exists
   */
  private hasCrossReferencesTable(): boolean {
    try {
      const result = this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='cross_references'"
        )
        .get();
      return !!result;
    } catch (error) {
      return false;
    }
  }

  /**
   * Query local embeddings using sqlite-vec
   * NOTE: Requires sqlite-vec extension and embeddings table
   */
  async queryLocalEmbeddings(
    queryEmbedding: Embedding,
    options: QueryOptions = {}
  ): Promise<SemanticResult[]> {
    if (!this.hasVecExtension()) {
      this.logger.warn(
        "sqlite-vec extension not available, skipping semantic search"
      );
      return [];
    }

    const {
      repositories,
      maxResults = 20,
      minSimilarity = 0.7,
    } = options;

    try {
      let sql = `
        SELECT
          chunk_id,
          repo,
          content,
          vec_distance_cosine(embedding, ?) as distance,
          metadata
        FROM embeddings
        WHERE distance < ?
      `;

      const params: any[] = [
        JSON.stringify(queryEmbedding),
        1 - minSimilarity, // Convert similarity to distance
      ];

      if (repositories && repositories.length > 0) {
        sql += ` AND repo IN (${repositories.map(() => "?").join(",")})`;
        params.push(...repositories);
      }

      sql += ` ORDER BY distance ASC LIMIT ?`;
      params.push(maxResults);

      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params) as any[];

      return results.map((row) => ({
        chunk_id: row.chunk_id,
        repo: row.repo,
        content: row.content,
        distance: row.distance,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Error querying embeddings:", errorMessage);
      return [];
    }
  }

  /**
   * Query local graph database
   */
  async queryLocalGraph(
    entities: string[],
    options: QueryOptions = {}
  ): Promise<GraphResult[]> {
    if (entities.length === 0) {
      return [];
    }

    const { repositories } = options;

    try {
      let sql = `
        SELECT
          n.id,
          n.repo,
          n.properties,
          e.relationship,
          e.weight
        FROM nodes n
        LEFT JOIN edges e ON n.id = e.source OR n.id = e.target
        WHERE 1=1
      `;

      const params: any[] = [];

      // Search for entities by ID or within properties
      const entityConditions = entities.map(() => {
        return "(n.id LIKE ? OR n.properties LIKE ?)";
      });

      if (entityConditions.length > 0) {
        sql += ` AND (${entityConditions.join(" OR ")})`;
        for (const entity of entities) {
          params.push(`%${entity}%`, `%${entity}%`);
        }
      }

      if (repositories && repositories.length > 0) {
        sql += ` AND n.repo IN (${repositories.map(() => "?").join(",")})`;
        params.push(...repositories);
      }

      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params) as any[];

      return results.map((row) => ({
        id: row.id,
        repo: row.repo || "unknown",
        properties: row.properties ? JSON.parse(row.properties) : {},
        relationship: row.relationship,
        weight: row.weight,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Error querying graph:", errorMessage);
      return [];
    }
  }

  /**
   * Query cross-repository references
   */
  async queryCrossReferences(
    involvedRepos: string[],
    minStrength: number = 0.7
  ): Promise<CrossReference[]> {
    if (!this.hasCrossReferencesTable()) {
      this.logger.warn("cross_references table not found");
      return [];
    }

    if (involvedRepos.length === 0) {
      return [];
    }

    try {
      let sql = `
        SELECT
          from_repo,
          from_entity,
          to_repo,
          to_entity,
          type,
          strength
        FROM cross_references
        WHERE strength >= ?
      `;

      const params: any[] = [minStrength];

      if (involvedRepos.length > 0) {
        sql += ` AND (
          from_repo IN (${involvedRepos.map(() => "?").join(",")})
          OR to_repo IN (${involvedRepos.map(() => "?").join(",")})
        )`;
        params.push(...involvedRepos, ...involvedRepos);
      }

      sql += ` ORDER BY strength DESC`;

      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params) as CrossReference[];

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Error querying cross-references:", errorMessage);
      return [];
    }
  }

  /**
   * Find cross-references based on semantic and graph results
   */
  async findCrossReferencesFromResults(
    semanticResults: SemanticResult[],
    graphResults: GraphResult[]
  ): Promise<CrossReference[]> {
    const involvedRepos = new Set<string>();

    // Collect repos from semantic results
    for (const result of semanticResults) {
      involvedRepos.add(result.repo);
    }

    // Collect repos from graph results
    for (const result of graphResults) {
      involvedRepos.add(result.repo);
    }

    if (involvedRepos.size < 2) {
      // No cross-references possible with less than 2 repos
      return [];
    }

    return this.queryCrossReferences(Array.from(involvedRepos));
  }

  /**
   * Search for a specific entity across repositories
   */
  async searchEntity(
    entityName: string,
    options: QueryOptions = {}
  ): Promise<GraphResult[]> {
    const { repositories } = options;

    try {
      let sql = `
        SELECT
          n.id,
          n.repo,
          n.properties,
          e.relationship,
          e.weight
        FROM nodes n
        LEFT JOIN edges e ON n.id = e.source OR n.id = e.target
        WHERE n.id LIKE ? OR n.properties LIKE ?
      `;

      const params: any[] = [`%${entityName}%`, `%${entityName}%`];

      if (repositories && repositories.length > 0) {
        sql += ` AND n.repo IN (${repositories.map(() => "?").join(",")})`;
        params.push(...repositories);
      }

      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params) as any[];

      return results.map((row) => ({
        id: row.id,
        repo: row.repo || "unknown",
        properties: row.properties ? JSON.parse(row.properties) : {},
        relationship: row.relationship,
        weight: row.weight,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Error searching entity:", errorMessage);
      return [];
    }
  }

  /**
   * Get relationships for a specific entity
   */
  async getEntityRelationships(
    entityId: string,
    options: QueryOptions = {}
  ): Promise<GraphResult[]> {
    const { repositories } = options;

    try {
      let sql = `
        SELECT
          n.id,
          n.repo,
          n.properties,
          e.relationship,
          e.weight
        FROM edges e
        JOIN nodes n ON (n.id = e.target OR n.id = e.source)
        WHERE (e.source = ? OR e.target = ?)
          AND n.id != ?
      `;

      const params: any[] = [entityId, entityId, entityId];

      if (repositories && repositories.length > 0) {
        sql += ` AND n.repo IN (${repositories.map(() => "?").join(",")})`;
        params.push(...repositories);
      }

      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params) as any[];

      return results.map((row) => ({
        id: row.id,
        repo: row.repo || "unknown",
        properties: row.properties ? JSON.parse(row.properties) : {},
        relationship: row.relationship,
        weight: row.weight,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Error getting entity relationships:", errorMessage);
      return [];
    }
  }

  /**
   * Estimate token count for results
   * Simple heuristic: ~4 chars per token
   */
  estimateTokens(results: CombinedResults): number {
    let charCount = 0;

    // Semantic results
    for (const result of results.semantic) {
      charCount += result.content.length;
      charCount += JSON.stringify(result.metadata || {}).length;
    }

    // Graph results
    for (const result of results.graph) {
      charCount += result.id.length;
      charCount += JSON.stringify(result.properties).length;
    }

    // Cross-references
    for (const ref of results.crossRefs) {
      charCount += ref.from_entity.length + ref.to_entity.length;
      charCount += ref.type.length;
    }

    return Math.ceil(charCount / 4);
  }

  /**
   * Extract entities from query text
   * Simple implementation - can be enhanced with NLP
   */
  extractEntities(query: string): string[] {
    // Remove common words and split
    const commonWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "from",
      "how",
      "what",
      "where",
      "when",
      "why",
      "who",
      "use",
      "using",
      "used",
      "get",
      "set",
      "do",
      "does",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
    ]);

    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => {
        // Remove punctuation
        const cleaned = word.replace(/[^\w]/g, "");
        // Keep if not common word and length > 2
        return cleaned.length > 2 && !commonWords.has(cleaned);
      });

    return [...new Set(words)]; // Remove duplicates
  }
}
