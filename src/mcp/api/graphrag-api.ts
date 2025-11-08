/**
 * GraphRAG API Wrapper for Code Execution Sandbox
 *
 * This module exposes simplified GraphRAG operations as plain async functions
 * that can be safely called from within the isolated-vm sandbox.
 *
 * All functions:
 * - Return plain serializable objects (no class instances)
 * - Are async (return Promises)
 * - Accept simple object parameters
 * - Handle errors gracefully
 */

import type { Database } from 'better-sqlite3';
import { GraphDatabaseConnection } from '../../lib/graph-database.js';
import { HybridSearchEngine } from '../tools/hybrid-search.js';
import { QueryEngine } from '../tools/query-engine.js';
import { Logger } from '../../lib/logger.js';
import type {
  QueryRepositoriesOptions,
  QueryDependencyOptions,
  GetCrossReferencesOptions,
  SmartQueryOptions,
  QueryResult,
  RepositoryMetadata,
  DependencyResult,
  CrossReferenceResult,
} from '../../types/code-execution.js';

/**
 * GraphRAG API for sandbox execution
 *
 * Provides simple, serializable functions for querying the GraphRAG system.
 */
export class GraphRAGAPI {
  private db: GraphDatabaseConnection;
  private hybridSearch: HybridSearchEngine;
  private queryEngine: QueryEngine;
  private logger: Logger;
  private dbSession: Database;

  constructor(dbPath: string) {
    this.logger = new Logger();
    this.db = new GraphDatabaseConnection(dbPath);
    this.dbSession = this.db.getSession();
    this.hybridSearch = new HybridSearchEngine(this.dbSession);
    this.queryEngine = new QueryEngine(this.dbSession);
  }

  /**
   * Query across multiple repositories with hybrid search
   *
   * Combines semantic, keyword, pattern, and graph search with dynamic weighting.
   *
   * @param options Query options
   * @returns Query results with analysis and metrics
   */
  async queryRepositories(options: QueryRepositoriesOptions): Promise<QueryResult> {
    try {
      this.logger.info(`[API] query_repositories: "${options.query}"`);

      const result = await this.hybridSearch.search(options.query, {
        repositories: options.repositories,
        maxResults: 20,
        explain: options.explain || false,
      });

      // Return serializable object (remove any non-serializable properties)
      return {
        results: result.results.map((r) => ({
          id: r.id,
          repo: r.repo,
          content: r.content,
          score: r.score,
          sources: r.sources,
          metadata: r.metadata || {},
        })),
        analysis: result.analysis,
        metrics: result.metrics,
        coverage: result.coverage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[API] query_repositories error:', errorMessage);
      throw new Error(`query_repositories failed: ${errorMessage}`);
    }
  }

  /**
   * Find information about a specific dependency or entity
   *
   * Searches the knowledge graph for entities and optionally their relationships.
   *
   * @param options Dependency query options
   * @returns Entities and optional relationships
   */
  async queryDependency(options: QueryDependencyOptions): Promise<DependencyResult> {
    try {
      this.logger.info(`[API] query_dependency: "${options.dependency}"`);

      const entities = await this.queryEngine.searchEntity(options.dependency, {
        repositories: options.repositories,
      });

      let relationships: any[] = [];
      if (
        (options.aspect === 'relationships' || options.aspect === 'all') &&
        entities.length > 0
      ) {
        // Get relationships for top 3 entities
        for (const entity of entities.slice(0, 3)) {
          const rels = await this.queryEngine.getEntityRelationships(entity.id, {
            repositories: options.repositories,
          });
          relationships.push(...rels);
        }
      }

      return {
        entities: entities.map((e) => ({
          id: e.id,
          repo: e.repo,
          properties: e.properties,
          relationship: e.relationship,
          weight: e.weight,
        })),
        relationships: relationships.map((r) => ({
          id: r.id,
          repo: r.repo,
          properties: r.properties,
          relationship: r.relationship,
          weight: r.weight,
        })),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[API] query_dependency error:', errorMessage);
      throw new Error(`query_dependency failed: ${errorMessage}`);
    }
  }

  /**
   * Find cross-repository references for an entity
   *
   * Discovers how different projects reference each other.
   *
   * @param options Cross-reference query options
   * @returns Cross-repository references
   */
  async getCrossReferences(
    options: GetCrossReferencesOptions
  ): Promise<CrossReferenceResult[]> {
    try {
      this.logger.info(`[API] get_cross_references: "${options.entity}"`);

      // Find entity's repo if not provided
      let entityRepo = options.sourceRepo;
      if (!entityRepo) {
        const entities = await this.queryEngine.searchEntity(options.entity);
        if (entities.length > 0 && entities[0]) {
          entityRepo = entities[0].repo;
        }
      }

      // Get all repositories
      const repos = await this.listRepositories();
      const repoIds = repos.map((r) => r.id);

      if (repoIds.length < 2) {
        // No cross-references possible with less than 2 repos
        return [];
      }

      // Query cross-references
      const crossRefs = await this.queryEngine.queryCrossReferences(
        repoIds,
        options.minStrength || 0.7
      );

      // Filter for this entity
      const filtered = crossRefs.filter(
        (ref) =>
          ref.from_entity.includes(options.entity) ||
          ref.to_entity.includes(options.entity) ||
          (entityRepo && (ref.from_repo === entityRepo || ref.to_repo === entityRepo))
      );

      return filtered.map((ref) => ({
        from_repo: ref.from_repo,
        from_entity: ref.from_entity,
        to_repo: ref.to_repo,
        to_entity: ref.to_entity,
        type: ref.type,
        strength: ref.strength,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[API] get_cross_references error:', errorMessage);
      throw new Error(`get_cross_references failed: ${errorMessage}`);
    }
  }

  /**
   * List all indexed repositories
   *
   * Returns metadata about all repositories in the local database.
   *
   * @returns Array of repository metadata
   */
  async listRepositories(): Promise<RepositoryMetadata[]> {
    try {
      this.logger.info('[API] list_repositories');

      // Check if repositories table exists
      const tableCheck = this.dbSession
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='repositories'")
        .get();

      if (!tableCheck) {
        this.logger.warn('[API] Repositories table not found');
        return [];
      }

      const repos = this.dbSession.prepare('SELECT * FROM repositories').all() as any[];

      return repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        indexed_at: repo.indexed_at,
        version: repo.version,
        branch: repo.branch,
        metadata: repo.metadata,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[API] list_repositories error:', errorMessage);
      throw new Error(`list_repositories failed: ${errorMessage}`);
    }
  }

  /**
   * Smart query with automatic attendant selection
   *
   * Natural language query with intelligent result filtering.
   * This is a convenience wrapper around queryRepositories.
   *
   * @param options Smart query options
   * @returns Query results
   */
  async smartQuery(options: SmartQueryOptions): Promise<QueryResult> {
    try {
      this.logger.info(`[API] smart_query: "${options.question}"`);

      // Use query_repositories as the backend
      // Note: Attendant filtering would be applied by the MCP server layer
      const result = await this.queryRepositories({
        query: options.question,
        attendant: options.forceAttendant || 'granite-micro',
        maxTokens: options.maxTokens || 500,
        explain: false,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[API] smart_query error:', errorMessage);
      throw new Error(`smart_query failed: ${errorMessage}`);
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
