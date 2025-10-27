/**
 * Reciprocal Rank Fusion (RRF)
 *
 * Combines ranked lists from multiple search strategies into a single
 * unified ranking. RRF is rank-based (not score-based), making it ideal
 * for combining results with incomparable scoring systems (cosine distance,
 * BM25, edit distance, etc.).
 *
 * Formula: RRF_score(d) = sum over all rankings r: weight_r / (k + rank_r(d))
 * where k is a constant (typically 60) and rank_r(d) is the rank of document d in ranking r
 */

import type {
  SemanticResult,
  SparseResult,
  PatternResult,
  GraphResult,
} from '../mcp/tools/query-engine.js';
import type { SearchWeights } from '../types/query-analysis.js';

/**
 * Unified result after fusion
 */
export interface FusedResult {
  /** Unique identifier for the chunk/entity */
  id: string;
  /** Repository containing this result */
  repo: string;
  /** Content text */
  content: string;
  /** RRF combined score */
  score: number;
  /** Which search strategies contributed to this result */
  sources: {
    dense?: number;    // Rank in dense search (1-based)
    sparse?: number;   // Rank in sparse search
    pattern?: number;  // Rank in pattern search
    graph?: number;    // Rank in graph search
  };
  /** Original metadata if available */
  metadata?: Record<string, unknown>;
}

/**
 * Input results for RRF fusion
 */
export interface RRFInput {
  semantic: SemanticResult[];
  sparse: SparseResult[];
  pattern: PatternResult[];
  graph: GraphResult[];
}

/**
 * Reciprocal Rank Fusion with weighted strategies
 */
export class ReciprocalRankFusion {
  /** RRF constant (higher = more emphasis on top results) */
  private k: number;

  constructor(k: number = 60) {
    this.k = k;
  }

  /**
   * Fuse results from all search strategies
   */
  fuse(
    results: RRFInput,
    weights: SearchWeights,
    maxResults: number = 20
  ): FusedResult[] {
    const scores = new Map<string, {
      score: number;
      repo: string;
      content: string;
      sources: FusedResult['sources'];
      metadata?: Record<string, unknown>;
    }>();

    // Process dense (semantic) results
    results.semantic.forEach((result, index) => {
      const rank = index + 1; // 1-based ranking
      const rrfScore = weights.dense / (this.k + rank);
      const id = result.chunk_id;

      const existing = scores.get(id);
      if (existing) {
        existing.score += rrfScore;
        existing.sources.dense = rank;
      } else {
        scores.set(id, {
          score: rrfScore,
          repo: result.repo,
          content: result.content,
          sources: { dense: rank },
          metadata: result.metadata,
        });
      }
    });

    // Process sparse (keyword) results
    results.sparse.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = weights.sparse / (this.k + rank);
      const id = result.chunk_id;

      const existing = scores.get(id);
      if (existing) {
        existing.score += rrfScore;
        existing.sources.sparse = rank;
      } else {
        scores.set(id, {
          score: rrfScore,
          repo: result.repo,
          content: result.content,
          sources: { sparse: rank },
          metadata: result.metadata,
        });
      }
    });

    // Process pattern (fuzzy) results
    results.pattern.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = weights.pattern / (this.k + rank);
      const id = result.chunk_id;

      const existing = scores.get(id);
      if (existing) {
        existing.score += rrfScore;
        existing.sources.pattern = rank;
      } else {
        scores.set(id, {
          score: rrfScore,
          repo: result.repo,
          content: result.content,
          sources: { pattern: rank },
          metadata: result.metadata,
        });
      }
    });

    // Process graph results
    results.graph.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = weights.graph / (this.k + rank);
      const id = result.id;

      const existing = scores.get(id);
      if (existing) {
        existing.score += rrfScore;
        existing.sources.graph = rank;
      } else {
        // For graph results, content is derived from properties
        const content = JSON.stringify(result.properties);
        scores.set(id, {
          score: rrfScore,
          repo: result.repo,
          content,
          sources: { graph: rank },
        });
      }
    });

    // Convert to array and sort by score
    const fusedResults = Array.from(scores.entries())
      .map(([id, data]) => ({
        id,
        repo: data.repo,
        content: data.content,
        score: data.score,
        sources: data.sources,
        metadata: data.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return fusedResults;
  }

  /**
   * Explain why a result was ranked where it is
   */
  explainRanking(result: FusedResult, weights: SearchWeights): string {
    const explanations: string[] = [];
    let totalScore = 0;

    if (result.sources.dense !== undefined) {
      const contribution = weights.dense / (this.k + result.sources.dense);
      totalScore += contribution;
      explanations.push(
        `Dense (semantic): rank ${result.sources.dense} → score ${contribution.toFixed(4)} (weight: ${weights.dense})`
      );
    }

    if (result.sources.sparse !== undefined) {
      const contribution = weights.sparse / (this.k + result.sources.sparse);
      totalScore += contribution;
      explanations.push(
        `Sparse (keyword): rank ${result.sources.sparse} → score ${contribution.toFixed(4)} (weight: ${weights.sparse})`
      );
    }

    if (result.sources.pattern !== undefined) {
      const contribution = weights.pattern / (this.k + result.sources.pattern);
      totalScore += contribution;
      explanations.push(
        `Pattern (fuzzy): rank ${result.sources.pattern} → score ${contribution.toFixed(4)} (weight: ${weights.pattern})`
      );
    }

    if (result.sources.graph !== undefined) {
      const contribution = weights.graph / (this.k + result.sources.graph);
      totalScore += contribution;
      explanations.push(
        `Graph (relationships): rank ${result.sources.graph} → score ${contribution.toFixed(4)} (weight: ${weights.graph})`
      );
    }

    return `Total RRF score: ${totalScore.toFixed(4)}\n` + explanations.map(e => `  - ${e}`).join('\n');
  }

  /**
   * Get diversity of sources (how many search types contributed)
   */
  getSourceDiversity(result: FusedResult): number {
    let count = 0;
    if (result.sources.dense !== undefined) count++;
    if (result.sources.sparse !== undefined) count++;
    if (result.sources.pattern !== undefined) count++;
    if (result.sources.graph !== undefined) count++;
    return count;
  }

  /**
   * Filter results by minimum source diversity
   * (e.g., only show results that appeared in at least 2 search types)
   */
  filterByDiversity(
    results: FusedResult[],
    minDiversity: number
  ): FusedResult[] {
    return results.filter(
      result => this.getSourceDiversity(result) >= minDiversity
    );
  }

  /**
   * Get results by repository
   */
  groupByRepository(results: FusedResult[]): Map<string, FusedResult[]> {
    const grouped = new Map<string, FusedResult[]>();

    for (const result of results) {
      const existing = grouped.get(result.repo) || [];
      existing.push(result);
      grouped.set(result.repo, existing);
    }

    return grouped;
  }

  /**
   * Calculate coverage (percentage of results from each search type)
   */
  calculateCoverage(results: FusedResult[]): {
    dense: number;
    sparse: number;
    pattern: number;
    graph: number;
  } {
    if (results.length === 0) {
      return { dense: 0, sparse: 0, pattern: 0, graph: 0 };
    }

    let denseCount = 0;
    let sparseCount = 0;
    let patternCount = 0;
    let graphCount = 0;

    for (const result of results) {
      if (result.sources.dense !== undefined) denseCount++;
      if (result.sources.sparse !== undefined) sparseCount++;
      if (result.sources.pattern !== undefined) patternCount++;
      if (result.sources.graph !== undefined) graphCount++;
    }

    return {
      dense: denseCount / results.length,
      sparse: sparseCount / results.length,
      pattern: patternCount / results.length,
      graph: graphCount / results.length,
    };
  }

  /**
   * Set the k constant
   */
  setK(k: number): void {
    this.k = k;
  }

  /**
   * Get the k constant
   */
  getK(): number {
    return this.k;
  }
}

/**
 * Create a default RRF instance
 */
export function createRRF(k: number = 60): ReciprocalRankFusion {
  return new ReciprocalRankFusion(k);
}
