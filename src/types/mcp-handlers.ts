/**
 * Type definitions for MCP server tool handler arguments
 */

import type { AttendantMode } from '../mcp/server.js';

/**
 * Arguments for query_repositories tool
 */
export interface QueryRepositoriesArgs {
  query: string;
  repositories?: string[];
  attendant?: AttendantMode;
  maxTokens?: number;
}

/**
 * Arguments for query_dependency tool
 */
export interface QueryDependencyArgs {
  entity: string;
  depth?: number;
  repositories?: string[];
}

/**
 * Arguments for get_cross_references tool
 */
export interface GetCrossReferencesArgs {
  entity: string;
  repositories?: string[];
}

/**
 * Arguments for smart_query tool
 */
export interface SmartQueryArgs {
  query: string;
  repositories?: string[];
  attendant?: AttendantMode;
  explain?: boolean;
}

/**
 * Hybrid search result for formatting
 */
export interface HybridResultData {
  results: Array<{
    chunk_id: string;
    repo: string;
    content: string;
    score: number;
    sources: {
      dense?: number;
      sparse?: number;
      pattern?: number;
      graph?: number;
    };
    metadata?: Record<string, unknown>;
  }>;
  analysis: {
    query_type: string;
    weights: Record<string, number>;
    reasoning: string;
  };
  metrics: {
    denseTime: number;
    sparseTime: number;
    patternTime: number;
    graphTime: number;
    fusionTime: number;
    totalTime: number;
  };
  coverage: {
    dense: number;
    sparse: number;
    pattern: number;
    graph: number;
  };
}

/**
 * Raw query results for formatting
 */
export interface RawQueryResultData {
  results: Array<{
    chunk_id: string;
    repo: string;
    content: string;
    [key: string]: unknown;
  }>;
}
