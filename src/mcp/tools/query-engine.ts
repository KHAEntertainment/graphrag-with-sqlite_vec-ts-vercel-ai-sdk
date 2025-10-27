/**
 * Query Engine for Local GraphRAG Database
 *
 * This module provides query capabilities against the local SQLite database
 * with sqlite-vec for semantic search and graph querying.
 */

import type { Database } from "better-sqlite3";
import type { Embedding } from "../../types/embedding.js";
import { Logger } from "../../lib/logger.js";
import { generateTrigrams, levenshteinDistance } from "../../utils/trigram.js";

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
 * Query result from sparse (keyword) search
 */
export interface SparseResult {
  chunk_id: string;
  repo: string;
  content: string;
  score: number;  // BM25 score
  metadata?: Record<string, unknown>;
}

/**
 * Query result from pattern matching search
 */
export interface PatternResult {
  chunk_id: string;
  repo: string;
  content: string;
  match_type: 'exact' | 'fuzzy' | 'regex';
  score: number;
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
  sparse: SparseResult[];
  pattern: PatternResult[];
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
        WHERE vec_distance_cosine(embedding, ?) < ?
      `;

      const params: any[] = [
        JSON.stringify(queryEmbedding),
        JSON.stringify(queryEmbedding), // Repeat for WHERE clause
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
   * Check if FTS5 is available
   */
  private hasFTS5Support(): boolean {
    try {
      const result = this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_fts'"
        )
        .get();
      return !!result;
    } catch (error) {
      return false;
    }
  }

  /**
   * Query using sparse retrieval (FTS5 with BM25)
   */
  async querySparse(
    query: string,
    options: QueryOptions = {}
  ): Promise<SparseResult[]> {
    if (!this.hasFTS5Support()) {
      this.logger.warn(
        "FTS5 not available, skipping sparse search"
      );
      return [];
    }

    const {
      repositories,
      maxResults = 20,
    } = options;

    try {
      let sql = `
        SELECT
          chunk_id,
          repo,
          content,
          bm25(chunks_fts) as score
        FROM chunks_fts
        WHERE content MATCH ?
      `;

      const params: any[] = [query];

      if (repositories && repositories.length > 0) {
        sql += ` AND repo IN (${repositories.map(() => "?").join(",")})`;
        params.push(...repositories);
      }

      sql += ` ORDER BY score ASC LIMIT ?`;
      params.push(maxResults);

      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params) as any[];

      return results.map((row) => ({
        chunk_id: row.chunk_id,
        repo: row.repo,
        content: row.content,
        score: row.score,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Error in sparse search:", errorMessage);
      return [];
    }
  }

  /**
   * Query using pattern matching (substring/wildcard)
   */
  async queryPattern(
    pattern: string,
    options: QueryOptions = {}
  ): Promise<PatternResult[]> {
    const {
      repositories,
      maxResults = 20,
    } = options;

    try {
      let sql = `
        SELECT
          chunk_id,
          repo,
          content,
          metadata
        FROM chunks
        WHERE content LIKE ?
      `;

      // Wrap pattern in wildcards for substring matching
      const params: any[] = [`%${pattern}%`];

      if (repositories && repositories.length > 0) {
        sql += ` AND repo IN (${repositories.map(() => "?").join(",")})`;
        params.push(...repositories);
      }

      sql += ` LIMIT ?`;
      params.push(maxResults);

      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params) as any[];

      return results.map((row) => ({
        chunk_id: row.chunk_id,
        repo: row.repo,
        content: row.content,
        match_type: 'exact' as const,
        score: 1.0, // Exact match gets perfect score
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Error in pattern search:", errorMessage);
      return [];
    }
  }

  /**
   * Query using fuzzy matching with trigrams and Levenshtein distance
   */
  async queryFuzzy(
    pattern: string,
    options: QueryOptions & { threshold?: number } = {}
  ): Promise<PatternResult[]> {
    const {
      repositories,
      maxResults = 20,
      threshold = 0.7,
    } = options;

    try {
      // Generate trigrams from pattern
      const patternTrigrams = generateTrigrams(pattern);

      // Find chunks with matching trigrams
      let sql = `
        SELECT DISTINCT
          c.chunk_id,
          c.repo,
          c.content,
          c.metadata,
          COUNT(DISTINCT t.trigram) as trigram_matches
        FROM chunks c
        JOIN chunks_trigram t ON c.chunk_id = t.chunk_id
        WHERE t.trigram IN (${patternTrigrams.map(() => "?").join(",")})
      `;

      const params: any[] = [...patternTrigrams];

      if (repositories && repositories.length > 0) {
        sql += ` AND c.repo IN (${repositories.map(() => "?").join(",")})`;
        params.push(...repositories);
      }

      sql += ` GROUP BY c.chunk_id, c.repo, c.content, c.metadata
               HAVING trigram_matches >= ?
               ORDER BY trigram_matches DESC
               LIMIT ?`;

      // Require at least 30% of trigrams to match
      const minTrigramMatches = Math.ceil(patternTrigrams.length * 0.3);
      params.push(minTrigramMatches, maxResults * 3); // Get more for Levenshtein filtering

      const stmt = this.db.prepare(sql);
      const candidates = stmt.all(...params) as any[];

      // Calculate Levenshtein distance for each candidate
      const results = candidates
        .map((row) => {
          // Find best match substring in content
          const content = row.content.toLowerCase();
          const patternLower = pattern.toLowerCase();
          let bestDistance = Infinity;

          // Check pattern appears in content (exact or near)
          for (let i = 0; i <= content.length - pattern.length; i++) {
            const substring = content.slice(i, i + pattern.length);
            const distance = levenshteinDistance(substring, patternLower);

            if (distance < bestDistance) {
              bestDistance = distance;
            }
          }

          // Calculate similarity score
          const maxLength = Math.max(pattern.length, pattern.length);
          const similarity = 1 - (bestDistance / maxLength);

          return {
            chunk_id: row.chunk_id,
            repo: row.repo,
            content: row.content,
            match_type: 'fuzzy' as const,
            score: similarity,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
          };
        })
        .filter(result => result.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Error in fuzzy search:", errorMessage);
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
