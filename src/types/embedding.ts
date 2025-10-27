/**
 * Types for embedding and vector operations
 */

/**
 * Vector embedding representation
 */
export type Embedding = number[];

/**
 * Document chunk with metadata
 */
export interface EmbeddingChunk {
  id: string;
  content: string;
  embedding?: Embedding;
  metadata?: Record<string, unknown>;
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  chunkId: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

/**
 * Embedding model configuration
 */
export type EmbeddingModelConfig =
  | {
      type: 'granite';
      model: 'ibm-granite/granite-embedding-125m-english';
    }
  | {
      type: 'nomic';
      model: 'nomic-ai/nomic-embed-text-v1.5';
    }
  | {
      type: 'bge';
      model: 'BAAI/bge-small-en-v1.5';
    }
  | {
      type: 'custom';
      model: string;
    };

/**
 * Embedding generation options
 */
export interface EmbeddingOptions {
  normalize?: boolean;
  pooling?: 'mean' | 'cls' | 'max';
  maxLength?: number;
}

/**
 * Vector search options
 */
export interface VectorSearchOptions {
  topK?: number;
  threshold?: number;
  filter?: Record<string, unknown>;
}
