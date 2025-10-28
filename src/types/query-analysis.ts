/**
 * Query Analysis Types
 *
 * Type definitions for LLM-based query classification and weight determination
 */

/**
 * Query type classification
 */
export type QueryType =
  | 'conceptual'      // Broad questions about concepts ("How do I stream AI responses?")
  | 'identifier'      // Specific code identifiers ("Find StreamingTextResponse class")
  | 'relationship'    // Dependency questions ("What uses useChat hook?")
  | 'fuzzy'           // Contains typos or partial matches ("StreamingTxtResp")
  | 'pattern'         // Pattern-based searches ("Find API keys like sk-proj-xxxx")
  | 'mixed';          // Combination of multiple types

/**
 * Search strategy weights
 * All weights must sum to 1.0
 */
export interface SearchWeights {
  /** Dense (semantic) search weight (0.0-1.0) */
  dense: number;
  /** Sparse (BM25 keyword) search weight (0.0-1.0) */
  sparse: number;
  /** Pattern (fuzzy/exact) search weight (0.0-1.0) */
  pattern: number;
  /** Graph (relationship) search weight (0.0-1.0) */
  graph: number;
}

/**
 * Query analysis result from LLM
 */
export interface QueryAnalysis {
  /** Classified query type */
  query_type: QueryType;
  /** Optimal search strategy weights */
  weights: SearchWeights;
  /** Reasoning behind the classification */
  reasoning: string;
  /** Detected code identifiers in the query */
  detected_identifiers?: string[];
  /** Whether query contains potential typos */
  has_typos?: boolean;
  /** Confidence in the analysis (0.0-1.0) */
  confidence?: number;
}

/**
 * Pre-defined weight profiles for common query types
 */
export const WEIGHT_PROFILES: Record<QueryType, SearchWeights> = {
  conceptual: {
    dense: 0.7,
    sparse: 0.2,
    pattern: 0.0,
    graph: 0.1,
  },
  identifier: {
    dense: 0.1,
    sparse: 0.5,
    pattern: 0.3,
    graph: 0.1,
  },
  relationship: {
    dense: 0.1,
    sparse: 0.2,
    pattern: 0.1,
    graph: 0.6,
  },
  fuzzy: {
    dense: 0.1,
    sparse: 0.2,
    pattern: 0.6,
    graph: 0.1,
  },
  pattern: {
    dense: 0.0,
    sparse: 0.2,
    pattern: 0.7,
    graph: 0.1,
  },
  mixed: {
    dense: 0.3,
    sparse: 0.3,
    pattern: 0.2,
    graph: 0.2,
  },
};
Object.freeze(WEIGHT_PROFILES);

/**
 * Validate that weights sum to 1.0 (within epsilon)
 */
export function validateWeights(weights: SearchWeights): boolean {
  const sum = weights.dense + weights.sparse + weights.pattern + weights.graph;
  const epsilon = 0.01; // Allow 1% tolerance
  return Math.abs(sum - 1.0) < epsilon;
}

/**
 * Normalize weights to sum to exactly 1.0
 */
export function normalizeWeights(weights: SearchWeights): SearchWeights {
  const sum = weights.dense + weights.sparse + weights.pattern + weights.graph;

  if (sum === 0) {
    // Equal weights if all are zero
    return {
      dense: 0.25,
      sparse: 0.25,
      pattern: 0.25,
      graph: 0.25,
    };
  }

  return {
    dense: weights.dense / sum,
    sparse: weights.sparse / sum,
    pattern: weights.pattern / sum,
    graph: weights.graph / sum,
  };
}

/**
 * Query analysis options
 */
export interface QueryAnalysisOptions {
  /** Force a specific query type (skip LLM classification) */
  forceType?: QueryType;
  /** Use fallback heuristics if LLM unavailable */
  useFallback?: boolean;
  /** Available repositories for context */
  repositories?: string[];
}
