/**
 * Markdown Indexer
 *
 * Provides standalone markdown ingestion for the GraphRAG system.
 * Accepts raw markdown strings (no file system required) and processes
 * them through the complete GraphRAG pipeline:
 * - Smart markdown-aware chunking
 * - Entity and relationship extraction
 * - Graph building
 * - Entity and edge embedding generation
 * - Storage in sqlite-vec for hybrid search
 *
 * Designed for integration with Legilimens CLI but usable standalone.
 */

import crypto from 'crypto';
import { GraphDatabaseConnection } from './graph-database.js';
import { DocumentProcessor } from './document-processor.js';
import { GraphManager } from './graph-manager.js';
import { EntityEmbedder } from './entity-embedder.js';
import { EdgeEmbedder } from './edge-embedder.js';
import { MarkdownChunker, type ChunkOptions } from '../utils/markdown-chunker.js';
import type { EmbeddingProvider } from '../types/embedding.js';
import type { LanguageModelV1 } from 'ai';
import { Logger } from './logger.js';

export interface MarkdownIndexOptions {
  /** Source of the markdown (for metadata) */
  source: 'context7' | 'deepwiki' | 'github' | 'local' | 'api' | string;
  /** URL where markdown was fetched from */
  url?: string;
  /** Additional metadata to store with chunks */
  metadata?: Record<string, unknown>;
  /** Chunking options */
  chunkOptions?: ChunkOptions;
  /** Skip embedding generation (for testing) */
  skipEmbeddings?: boolean;
}

export interface IndexResult {
  /** Repository ID that was indexed */
  repositoryId: string;
  /** Number of chunks created */
  chunksCreated: number;
  /** Number of entities extracted */
  entitiesExtracted: number;
  /** Number of relationships extracted */
  relationshipsExtracted: number;
  /** Number of entity embeddings generated */
  entityEmbeddings: number;
  /** Number of edge embeddings generated */
  edgeEmbeddings: number;
  /** Timestamp of indexing */
  indexedAt: Date;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Standalone markdown indexer for GraphRAG
 */
export class MarkdownIndexer {
  private readonly db: GraphDatabaseConnection;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly llmModel: LanguageModelV1;
  private readonly logger: Logger;
  private readonly documentProcessor: DocumentProcessor;
  private readonly graphManager: GraphManager;

  constructor(
    db: GraphDatabaseConnection,
    embeddingProvider: EmbeddingProvider,
    llmModel: LanguageModelV1,
    logger: Logger
  ) {
    this.db = db;
    this.embeddingProvider = embeddingProvider;
    this.llmModel = llmModel;
    this.logger = logger;
    this.documentProcessor = new DocumentProcessor(llmModel, logger);
    this.graphManager = new GraphManager(db, logger);
  }

  /**
   * Index raw markdown content into GraphRAG
   */
  async indexMarkdown(
    repositoryId: string,
    markdown: string,
    options: MarkdownIndexOptions
  ): Promise<IndexResult> {
    const startTime = Date.now();

    this.logger.info(`Starting markdown indexing for repository: ${repositoryId}`);
    this.logger.info(`Markdown size: ${markdown.length} characters (${Math.round(markdown.length / 4)} tokens approx)`);

    try {
      // Step 1: Smart markdown chunking
      this.logger.info('Step 1/6: Chunking markdown with structural awareness...');
      const chunks = await this.chunkMarkdown(markdown, options.chunkOptions);
      this.logger.info(`Created ${chunks.length} chunks`);

      // Step 2: Extract entities and relationships
      this.logger.info('Step 2/6: Extracting entities and relationships...');
      const elements = await this.extractElements(chunks);
      this.logger.info(`Extracted ${elements.entities} entities and ${elements.relationships} relationships`);

      // Step 3: Build knowledge graph
      this.logger.info('Step 3/6: Building knowledge graph...');
      await this.buildGraph(elements.extractedElements);
      this.logger.info('Graph built successfully');

      // Step 4: Store chunks for hybrid search
      this.logger.info('Step 4/6: Storing chunks for hybrid search...');
      await this.storeChunks(repositoryId, chunks, options);
      this.logger.info(`Stored ${chunks.length} chunks`);

      // Step 5: Generate entity embeddings
      let entityEmbeddings = 0;
      let edgeEmbeddings = 0;

      if (!options.skipEmbeddings) {
        this.logger.info('Step 5/6: Generating entity embeddings...');
        entityEmbeddings = await this.generateEntityEmbeddings(repositoryId);
        this.logger.info(`Generated ${entityEmbeddings} entity embeddings`);

        // Step 6: Generate edge embeddings
        this.logger.info('Step 6/6: Generating edge embeddings...');
        edgeEmbeddings = await this.generateEdgeEmbeddings(repositoryId);
        this.logger.info(`Generated ${edgeEmbeddings} edge embeddings`);
      } else {
        this.logger.info('Skipping embedding generation (skipEmbeddings=true)');
      }

      const processingTimeMs = Date.now() - startTime;

      const result: IndexResult = {
        repositoryId,
        chunksCreated: chunks.length,
        entitiesExtracted: elements.entities,
        relationshipsExtracted: elements.relationships,
        entityEmbeddings,
        edgeEmbeddings,
        indexedAt: new Date(),
        processingTimeMs
      };

      this.logger.info(`Markdown indexing complete in ${processingTimeMs}ms`);
      this.logger.info(`Summary: ${result.chunksCreated} chunks, ${result.entitiesExtracted} entities, ${result.relationshipsExtracted} relationships`);

      return result;
    } catch (error) {
      this.logger.error('Markdown indexing failed:', error);
      throw error;
    }
  }

  /**
   * Chunk markdown with structural awareness
   */
  private async chunkMarkdown(
    markdown: string,
    options?: ChunkOptions
  ): Promise<Array<{ id: string; content: string; metadata: Record<string, unknown> }>> {
    const chunker = new MarkdownChunker(options);
    const markdownChunks = chunker.chunk(markdown);

    // Convert to database chunk format
    return markdownChunks.map((chunk, index) => ({
      id: this.generateChunkId(chunk.content, index),
      content: chunk.content,
      metadata: {
        index,
        ...chunk.metadata,
        headingContext: chunk.headingContext
      }
    }));
  }

  /**
   * Extract entities and relationships from chunks
   */
  private async extractElements(chunks: Array<{ id: string; content: string }>): Promise<{
    extractedElements: string[];
    entities: number;
    relationships: number;
  }> {
    // Use existing DocumentProcessor (already works with string arrays)
    const chunkContents = chunks.map(c => c.content);
    const extracted = await this.documentProcessor.extractElements(chunkContents);

    // Count entities and relationships in extracted elements
    let entities = 0;
    let relationships = 0;

    for (const element of extracted) {
      // Count entity mentions (rough estimate)
      const entityMatches = element.match(/Entity:\s*[^\n]+/g);
      entities += entityMatches?.length ?? 0;

      // Count relationship mentions
      const relMatches = element.match(/Parsed relationship:/g);
      relationships += relMatches?.length ?? 0;
    }

    return {
      extractedElements: extracted,
      entities,
      relationships
    };
  }

  /**
   * Build knowledge graph from extracted elements
   */
  private async buildGraph(elements: string[]): Promise<void> {
    // Use existing GraphManager (already works with string arrays)
    const summaries = await this.documentProcessor.summarizeElements(elements);
    await this.graphManager.buildGraph(summaries);
  }

  /**
   * Store chunks in database for hybrid search
   */
  private async storeChunks(
    repositoryId: string,
    chunks: Array<{ id: string; content: string; metadata: Record<string, unknown> }>,
    options: MarkdownIndexOptions
  ): Promise<void> {
    const dbChunks = chunks.map(chunk => ({
      chunk_id: chunk.id,
      repo: repositoryId,
      chunk_type: 'documentation' as const,
      content: chunk.content,
      metadata: {
        ...chunk.metadata,
        source: options.source,
        url: options.url,
        indexedAt: new Date().toISOString(),
        ...options.metadata
      }
    }));

    // Use existing GraphDatabaseConnection batch insert
    this.db.insertChunks(dbChunks);
  }

  /**
   * Generate entity embeddings
   */
  private async generateEntityEmbeddings(repositoryId: string): Promise<number> {
    const embedder = new EntityEmbedder(
      this.db,
      this.embeddingProvider,
      this.logger
    );

    return await embedder.embedEntities(repositoryId);
  }

  /**
   * Generate edge embeddings
   */
  private async generateEdgeEmbeddings(repositoryId: string): Promise<number> {
    const embedder = new EdgeEmbedder(
      this.db,
      this.embeddingProvider,
      this.logger
    );

    return await embedder.embedEdges(repositoryId);
  }

  /**
   * Generate stable chunk ID
   */
  private generateChunkId(content: string, index: number): string {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    hash.update(index.toString());
    return `md-${hash.digest('hex').substring(0, 16)}`;
  }

  /**
   * Check if repository is already indexed
   */
  async isIndexed(repositoryId: string): Promise<boolean> {
    try {
      const stmt = this.db['db'].prepare(
        'SELECT COUNT(*) as count FROM nodes WHERE id LIKE ?'
      );
      const result = stmt.get(`${repositoryId}::%`) as { count: number } | undefined;
      return (result?.count ?? 0) > 0;
    } catch (error) {
      this.logger.error(`Error checking if repository is indexed: ${error}`);
      return false;
    }
  }

  /**
   * Get indexing statistics for a repository
   */
  async getStats(repositoryId: string): Promise<{
    nodes: number;
    edges: number;
    chunks: number;
    embeddings: number;
  }> {
    try {
      const db = this.db['db'];

      const nodes = db.prepare(
        'SELECT COUNT(*) as count FROM nodes WHERE id LIKE ?'
      ).get(`${repositoryId}::%`) as { count: number };

      const edges = db.prepare(
        'SELECT COUNT(*) as count FROM edges WHERE source LIKE ?'
      ).get(`${repositoryId}::%`) as { count: number };

      const chunks = db.prepare(
        'SELECT COUNT(*) as count FROM chunks WHERE repo = ?'
      ).get(repositoryId) as { count: number };

      // Count embeddings (both entity and edge)
      const embeddingsStmt = db.prepare(
        'SELECT COUNT(*) as count FROM embeddings WHERE repo = ?'
      );
      const embeddings = embeddingsStmt.get(repositoryId) as { count: number };

      return {
        nodes: nodes.count,
        edges: edges.count,
        chunks: chunks.count,
        embeddings: embeddings.count
      };
    } catch (error) {
      this.logger.error(`Error getting repository stats: ${error}`);
      return { nodes: 0, edges: 0, chunks: 0, embeddings: 0 };
    }
  }

  /**
   * Delete all data for a repository
   */
  async deleteRepository(repositoryId: string): Promise<void> {
    this.logger.info(`Deleting all data for repository: ${repositoryId}`);

    try {
      const db = this.db['db'];

      // Delete in correct order (respect foreign keys)
      db.prepare('DELETE FROM embeddings WHERE repo = ?').run(repositoryId);
      db.prepare('DELETE FROM chunks WHERE repo = ?').run(repositoryId);
      db.prepare('DELETE FROM edges WHERE source LIKE ?').run(`${repositoryId}::%`);
      db.prepare('DELETE FROM nodes WHERE id LIKE ?').run(`${repositoryId}::%`);

      this.logger.info(`Repository ${repositoryId} deleted successfully`);
    } catch (error) {
      this.logger.error(`Error deleting repository: ${error}`);
      throw error;
    }
  }
}
