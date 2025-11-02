/**
 * Hybrid Search Engine
 *
 * Unified search interface that combines all search strategies:
 * - Dense (semantic embeddings)
 * - Sparse (BM25 keyword)
 * - Pattern (fuzzy/exact matching)
 * - Graph (entity relationships)
 *
 * Uses LLM-based query analysis to dynamically weight strategies
 * and Reciprocal Rank Fusion to combine results.
 *
 * Embedding Pattern (when sqlite-vec integrated):
 * - Entities: "name :: kind :: hints" → Granite Embedding → vec0
 * - Edges: "S <predicate> O :: context:..." → Granite Embedding → vec0
 * - Enables similarity search for both entities AND relationships
 * - Use SciPhi/Triplex for extracting triples from code/docs
 * - Query analysis via IBM Granite 4.0 Micro
 *
 * @see CONSTITUTION.md - Canonical model specifications
 * @see docs/SQLITE-VEC-INTEGRATION-PLAN.md#model-recommendations
 */

import type { Database } from 'better-sqlite3';
import type { LanguageModelV1 } from 'ai';
import { QueryEngine } from './query-engine.js';
import type { SemanticResult, SparseResult, PatternResult, GraphResult } from './query-engine.js';
import { QueryAnalyzer, createQueryAnalyzer } from '../../lib/query-analyzer.js';
import { ReciprocalRankFusion, createRRF } from '../../lib/reciprocal-rank-fusion.js';
import type { FusedResult } from '../../lib/reciprocal-rank-fusion.js';
import type { QueryAnalysis, SearchWeights } from '../../types/query-analysis.js';
import { Logger } from '../../lib/logger.js';

/**
 * Hybrid search options
 */
export interface HybridSearchOptions {
  /** Force specific query type (skip LLM analysis) */
  forceQueryType?: QueryAnalysis['query_type'];
  /** Override automatic weights */
  forceWeights?: SearchWeights;
  /** Repositories to search */
  repositories?: string[];
  /** Maximum results to return */
  maxResults?: number;
  /** Enable explain mode (includes ranking explanations) */
  explain?: boolean;
  /** Minimum source diversity (1-4) */
  minDiversity?: number;
  /** RRF k constant */
  rrfK?: number;
}

/**
 * Hybrid search result with metadata
 */
export interface HybridSearchResult {
  /** Fused and ranked results */
  results: FusedResult[];
  /** Query analysis (type classification and weights) */
  analysis: QueryAnalysis;
  /** Search performance metrics */
  metrics: {
    denseTime: number;
    sparseTime: number;
    patternTime: number;
    graphTime: number;
    fusionTime: number;
    totalTime: number;
  };
  /** Coverage statistics */
  coverage: {
    dense: number;
    sparse: number;
    pattern: number;
    graph: number;
  };
  /** Ranking explanations (if explain mode enabled) */
  explanations?: string[];
}

/**
 * Hybrid Search Engine - Combines all search strategies
 */
export class HybridSearchEngine {
  private queryEngine: QueryEngine;
  private queryAnalyzer: QueryAnalyzer;
  private rrf: ReciprocalRankFusion;
  private logger: Logger;
  private embeddingProvider?: { embed: (text: string) => Promise<number[]> };

  constructor(
    db: Database,
    model?: LanguageModelV1,
    embeddingProvider?: { embed: (text: string) => Promise<number[]> }
  ) {
    this.queryEngine = new QueryEngine(db);
    this.queryAnalyzer = createQueryAnalyzer(model);
    this.rrf = createRRF();
    this.logger = new Logger();
    this.embeddingProvider = embeddingProvider;
  }

  /**
   * Perform hybrid search with dynamic strategy weighting
   */
  async search(query: string, options: HybridSearchOptions = {}): Promise<HybridSearchResult> {
    const startTime = Date.now();

    // Step 1: Analyze query to determine weights
    const analysis = await this.analyzeQuery(query, options);

    this.logger.info(
      `Query type: ${analysis.query_type}, Confidence: ${analysis.confidence?.toFixed(2)}`
    );
    this.logger.info(
      `Weights: dense=${analysis.weights.dense}, sparse=${analysis.weights.sparse}, ` +
        `pattern=${analysis.weights.pattern}, graph=${analysis.weights.graph}`
    );

    // Step 2: Execute all search strategies in parallel
    const { semantic, sparse, pattern, graph, metrics } = await this.executeSearches(
      query,
      analysis.weights,
      options
    );

    // Step 3: Fuse results with RRF
    const fusionStart = Date.now();

    // Set custom RRF k if provided
    if (options.rrfK) {
      this.rrf.setK(options.rrfK);
    }

    let fusedResults = this.rrf.fuse(
      { semantic, sparse, pattern, graph },
      analysis.weights,
      options.maxResults || 20
    );

    // Apply diversity filter if requested
    if (options.minDiversity && options.minDiversity > 1) {
      fusedResults = this.rrf.filterByDiversity(fusedResults, options.minDiversity);
    }

    const fusionTime = Date.now() - fusionStart;

    // Step 4: Calculate coverage
    const coverage = this.rrf.calculateCoverage(fusedResults);

    // Step 5: Generate explanations if requested
    let explanations: string[] | undefined;
    if (options.explain) {
      explanations = fusedResults.map(
        (result) =>
          `Fused score=${result.score.toFixed(4)}\n` +
          this.rrf.explainRanking(result, analysis.weights)
      );
    }

    const totalTime = Date.now() - startTime;

    return {
      results: fusedResults,
      analysis,
      metrics: {
        ...metrics,
        fusionTime,
        totalTime,
      },
      coverage,
      explanations,
    };
  }

  /**
   * Analyze query to determine search strategy weights
   */
  private async analyzeQuery(query: string, options: HybridSearchOptions): Promise<QueryAnalysis> {
    if (options.forceWeights) {
      return {
        query_type: options.forceQueryType || 'mixed',
        weights: options.forceWeights,
        reasoning: 'Weights manually specified',
        confidence: 1.0,
      };
    }

    return this.queryAnalyzer.analyze(query, {
      forceType: options.forceQueryType,
      repositories: options.repositories,
    });
  }

  /**
   * Execute all search strategies in parallel
   */
  private async executeSearches(
    query: string,
    weights: SearchWeights,
    options: HybridSearchOptions
  ): Promise<[SemanticResult[], SparseResult[], PatternResult[], GraphResult[]]> {
    const promises: [
      Promise<SemanticResult[]>,
      Promise<SparseResult[]>,
      Promise<PatternResult[]>,
      Promise<GraphResult[]>,
    ] = [Promise.resolve([]), Promise.resolve([]), Promise.resolve([]), Promise.resolve([])];
    const timings: number[] = [];

    // Dense (semantic) search
    promises[0] = (async (): Promise<SemanticResult[]> => {
      const cutoff = 0.05;
      if ((weights.dense ?? 0) < cutoff || !this.embeddingProvider) {
        return [];
      }

      const start = Date.now();
      try {
        const embedding = await this.embeddingProvider.embed(query);
        const results = await this.queryEngine.queryLocalEmbeddings(embedding, {
          repositories: options.repositories,
          maxResults: options.maxResults ?? 20,
        });
        timings[0] = Date.now() - start;
        return results;
      } catch (error) {
        this.logger.warn('Dense search failed:', error);
        timings[0] = Date.now() - start;
        return [];
      }
    })();

    // Sparse (keyword) search
    promises[1] = (async (): Promise<SparseResult[]> => {
      const cutoff = 0.05;
      if ((weights.sparse ?? 0) < cutoff) {
        return [];
      }

      const start = Date.now();
      try {
        const results = await this.queryEngine.querySparse(query, {
          repositories: options.repositories,
          maxResults: options.maxResults ?? 20,
        });
        timings[1] = Date.now() - start;
        return results;
      } catch (error) {
        this.logger.warn('Sparse search failed:', error);
        timings[1] = Date.now() - start;
        return [];
      }
    })();

    // Pattern (fuzzy) search
    promises[2] = (async (): Promise<PatternResult[]> => {
      const cutoff = 0.05;
      if ((weights.pattern ?? 0) < cutoff) {
        return [];
      }

      const start = Date.now();
      try {
        // Use fuzzy search for better results
        const results = await this.queryEngine.queryFuzzy(query, {
          repositories: options.repositories,
          maxResults: options.maxResults ?? 20,
          threshold: 0.6,
        });
        timings[2] = Date.now() - start;
        return results;
      } catch (error) {
        this.logger.warn('Pattern search failed:', error);
        timings[2] = Date.now() - start;
        return [];
      }
    })();

    // Graph (relationship) search
    promises[3] = (async (): Promise<GraphResult[]> => {
      const cutoff = 0.05;
      if ((weights.graph ?? 0) < cutoff) {
        return [];
      }

      const start = Date.now();
      try {
        const entities = this.queryEngine.extractEntities(query);
        const results = await this.queryEngine.queryLocalGraph(entities, {
          repositories: options.repositories,
        });
        const limited =
          options.maxResults && results.length > options.maxResults
            ? results.slice(0, options.maxResults)
            : results;
        timings[3] = Date.now() - start;
        return limited;
      } catch (error) {
        this.logger.warn('Graph search failed:', error);
        timings[3] = Date.now() - start;
        return [];
      }
    })();

    const [semantic, sparse, pattern, graph] = await Promise.all(promises);

    this.logger.info(
      `Search results: dense=${semantic.length}, sparse=${sparse.length}, ` +
        `pattern=${pattern.length}, graph=${graph.length}`
    );

    return {
      semantic,
      sparse,
      pattern,
      graph,
      metrics: {
        denseTime: timings[0] || 0,
        sparseTime: timings[1] || 0,
        patternTime: timings[2] || 0,
        graphTime: timings[3] || 0,
        fusionTime: 0, // Set later
        totalTime: 0, // Set later
      },
    };
  }

  /**
   * Set embedding provider
   */
  setEmbeddingProvider(provider: { embed: (text: string) => Promise<number[]> }): void {
    this.embeddingProvider = provider;
  }

  /**
   * Set language model for query analysis
   */
  setModel(model: LanguageModelV1): void {
    this.queryAnalyzer.setModel(model);
  }

  /**
   * Get query analyzer (for testing/inspection)
   */
  getQueryAnalyzer(): QueryAnalyzer {
    return this.queryAnalyzer;
  }

  /**
   * Get RRF instance (for testing/inspection)
   */
  getRRF(): ReciprocalRankFusion {
    return this.rrf;
  }
}

/**
 * Create a hybrid search engine
 */
export function createHybridSearchEngine(
  db: Database,
  model?: LanguageModelV1,
  embeddingProvider?: { embed: (text: string) => Promise<number[]> }
): HybridSearchEngine {
  return new HybridSearchEngine(db, model, embeddingProvider);
}
