/**
 * Embedding manager for generating and managing vector embeddings
 *
 * Supports multiple embedding models:
 * - IBM Granite Embedding 125M (recommended for code)
 * - Nomic Embed Text v1.5 (general purpose)
 * - BGE Small EN v1.5 (lightweight)
 */

import type {
  Embedding,
  EmbeddingChunk,
  EmbeddingModelConfig,
  EmbeddingOptions,
} from '../types/embedding.js';
import type { Logger } from '../types/index.js';

/**
 * Abstract base class for embedding providers
 */
export abstract class EmbeddingProvider {
  protected logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Generate embedding for a single text
   */
  abstract embed(text: string, options?: EmbeddingOptions): Promise<Embedding>;

  /**
   * Generate embeddings for multiple texts (batched)
   */
  abstract embedBatch(texts: string[], options?: EmbeddingOptions): Promise<Embedding[]>;

  /**
   * Get the dimension of embeddings produced by this model
   */
  abstract getDimension(): number;
}

/**
 * Granite Embedding 125M Provider
 *
 * IBM's Granite embedding model optimized for code and technical content.
 * - 125M parameters
 * - 768 dimensions
 * - Good for: code, documentation, technical text
 *
 * @example
 * ```typescript
 * const provider = new GraniteEmbeddingProvider(logger);
 * await provider.initialize();
 * const embedding = await provider.embed("function hello() { return 'world'; }");
 * ```
 */
export class GraniteEmbeddingProvider extends EmbeddingProvider {
  private pipeline: any;
  private modelName = 'ibm-granite/granite-embedding-125m-english';
  private dimension = 768;

  async initialize(): Promise<void> {
    try {
      // Dynamically import transformers.js
      const { pipeline } = await import('@xenova/transformers');

      this.logger.info(`Loading Granite embedding model: ${this.modelName}`);
      this.pipeline = await pipeline('feature-extraction', this.modelName);
      this.logger.info('Granite embedding model loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load Granite embedding model:', error);
      throw new Error(`Failed to initialize Granite embeddings: ${error}`);
    }
  }

  async embed(text: string, options?: EmbeddingOptions): Promise<Embedding> {
    if (!this.pipeline) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    try {
      const output = await this.pipeline(text, {
        pooling: options?.pooling || 'mean',
        normalize: options?.normalize ?? true,
      });

      return Array.from(output.data) as Embedding;
    } catch (error) {
      this.logger.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<Embedding[]> {
    if (!this.pipeline) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    const embeddings: Embedding[] = [];
    for (const text of texts) {
      const embedding = await this.embed(text, options);
      embeddings.push(embedding);
    }
    return embeddings;
  }

  getDimension(): number {
    return this.dimension;
  }
}

/**
 * Nomic Embed Text Provider
 *
 * High-quality general-purpose embedding model.
 * - 137M parameters
 * - 768 dimensions
 * - Good for: general text, mixed content
 *
 * @example
 * ```typescript
 * const provider = new NomicEmbeddingProvider(logger);
 * await provider.initialize();
 * const embedding = await provider.embed("What is the meaning of life?");
 * ```
 */
export class NomicEmbeddingProvider extends EmbeddingProvider {
  private pipeline: any;
  private modelName = 'nomic-ai/nomic-embed-text-v1.5';
  private dimension = 768;

  async initialize(): Promise<void> {
    try {
      const { pipeline } = await import('@xenova/transformers');

      this.logger.info(`Loading Nomic embedding model: ${this.modelName}`);
      this.pipeline = await pipeline('feature-extraction', this.modelName);
      this.logger.info('Nomic embedding model loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load Nomic embedding model:', error);
      throw new Error(`Failed to initialize Nomic embeddings: ${error}`);
    }
  }

  async embed(text: string, options?: EmbeddingOptions): Promise<Embedding> {
    if (!this.pipeline) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    const output = await this.pipeline(text, {
      pooling: options?.pooling || 'mean',
      normalize: options?.normalize ?? true,
    });

    return Array.from(output.data) as Embedding;
  }

  async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<Embedding[]> {
    const embeddings: Embedding[] = [];
    for (const text of texts) {
      const embedding = await this.embed(text, options);
      embeddings.push(embedding);
    }
    return embeddings;
  }

  getDimension(): number {
    return this.dimension;
  }
}

/**
 * BGE Small Embedding Provider
 *
 * Ultra-lightweight embedding model.
 * - 33M parameters
 * - 384 dimensions
 * - Good for: resource-constrained environments, fast inference
 *
 * @example
 * ```typescript
 * const provider = new BGEEmbeddingProvider(logger);
 * await provider.initialize();
 * const embedding = await provider.embed("lightweight and fast");
 * ```
 */
export class BGEEmbeddingProvider extends EmbeddingProvider {
  private pipeline: any;
  private modelName = 'BAAI/bge-small-en-v1.5';
  private dimension = 384;

  async initialize(): Promise<void> {
    try {
      const { pipeline } = await import('@xenova/transformers');

      this.logger.info(`Loading BGE embedding model: ${this.modelName}`);
      this.pipeline = await pipeline('feature-extraction', this.modelName);
      this.logger.info('BGE embedding model loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load BGE embedding model:', error);
      throw new Error(`Failed to initialize BGE embeddings: ${error}`);
    }
  }

  async embed(text: string, options?: EmbeddingOptions): Promise<Embedding> {
    if (!this.pipeline) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    const output = await this.pipeline(text, {
      pooling: options?.pooling || 'mean',
      normalize: options?.normalize ?? true,
    });

    return Array.from(output.data) as Embedding;
  }

  async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<Embedding[]> {
    const embeddings: Embedding[] = [];
    for (const text of texts) {
      const embedding = await this.embed(text, options);
      embeddings.push(embedding);
    }
    return embeddings;
  }

  getDimension(): number {
    return this.dimension;
  }
}

/**
 * Factory function to create embedding provider based on configuration
 */
export async function createEmbeddingProvider(
  config: EmbeddingModelConfig,
  logger: Logger
): Promise<EmbeddingProvider> {
  let provider: EmbeddingProvider;

  switch (config.type) {
    case 'granite':
      provider = new GraniteEmbeddingProvider(logger);
      break;
    case 'nomic':
      provider = new NomicEmbeddingProvider(logger);
      break;
    case 'bge':
      provider = new BGEEmbeddingProvider(logger);
      break;
    default:
      throw new Error(`Unsupported embedding model type: ${config.type}`);
  }

  await provider.initialize();
  return provider;
}

/**
 * EmbeddingManager handles embedding generation and chunk management
 */
export class EmbeddingManager {
  private provider: EmbeddingProvider;
  private logger: Logger;

  constructor(provider: EmbeddingProvider, logger: Logger) {
    this.provider = provider;
    this.logger = logger;
  }

  /**
   * Generate embedding for a single chunk
   */
  async embedChunk(chunk: EmbeddingChunk, options?: EmbeddingOptions): Promise<EmbeddingChunk> {
    this.logger.debug(`Generating embedding for chunk: ${chunk.id}`);

    const embedding = await this.provider.embed(chunk.content, options);

    return {
      ...chunk,
      embedding,
    };
  }

  /**
   * Generate embeddings for multiple chunks
   */
  async embedChunks(
    chunks: EmbeddingChunk[],
    options?: EmbeddingOptions
  ): Promise<EmbeddingChunk[]> {
    this.logger.info(`Generating embeddings for ${chunks.length} chunks`);

    const embeddedChunks: EmbeddingChunk[] = [];

    for (const chunk of chunks) {
      const embedded = await this.embedChunk(chunk, options);
      embeddedChunks.push(embedded);
    }

    this.logger.info(`Successfully generated ${embeddedChunks.length} embeddings`);
    return embeddedChunks;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: Embedding, b: Embedding): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += (a[i] ?? 0) * (b[i] ?? 0);
      normA += (a[i] ?? 0) * (a[i] ?? 0);
      normB += (b[i] ?? 0) * (b[i] ?? 0);
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get embedding dimension
   */
  getDimension(): number {
    return this.provider.getDimension();
  }
}
