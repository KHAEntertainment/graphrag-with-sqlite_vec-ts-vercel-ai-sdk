/**
 * Database result types for SQLite queries
 */

/**
 * Base database row type for chunks table
 */
export interface ChunkRow {
  chunk_id: string;
  repo: string;
  entity_id?: string | null;
  chunk_type: string;
  content: string;
  metadata?: string | null;
}

/**
 * Semantic search result with distance score
 */
export interface SemanticSearchRow extends ChunkRow {
  distance: number;
}

/**
 * Sparse (BM25) search result with score
 */
export interface SparseSearchRow extends ChunkRow {
  score: number;
}

/**
 * Pattern search result
 */
export interface PatternSearchRow extends ChunkRow {
  // May include match position or other pattern-specific data
}

/**
 * Graph search result with properties
 */
export interface GraphSearchRow {
  id: string;
  repo: string;
  properties: string; // JSON string
}

/**
 * Cross-reference result
 */
export interface CrossReferenceRow {
  id: number;
  from_repo: string;
  from_entity: string;
  to_repo: string;
  to_entity: string;
  type: string;
  strength: number;
  context?: string | null;
}

/**
 * Repository metadata row
 */
export interface RepositoryRow {
  id: string;
  name: string;
  indexed_at: string;
  version?: string | null;
  branch?: string | null;
  commit_hash?: string | null;
  metadata?: string | null;
  embedding_model?: string | null;
}

/**
 * Node (entity) row
 */
export interface NodeRow {
  id: string;
  properties: string; // JSON string
}

/**
 * Edge (relationship) row
 */
export interface EdgeRow {
  source: string;
  target: string;
  relationship: string;
  weight: number;
}

/**
 * SQL parameter types
 */
export type SqlParameter = string | number | Buffer | null;
