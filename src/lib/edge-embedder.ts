/**
 * Edge Embedder - Generates embeddings for graph relationships
 *
 * Edge Format: "S <predicate> O :: context:..."
 * Example: "api_gateway <routes_to> auth_module :: context: API Gateway (service) routes to AuthModule (class)"
 *
 * Processes edges in batches of 100 for efficient embedding generation.
 * Supports cross-repository edges where source and target are in different repos.
 */

import type { Logger } from '../types/index.js';
import type { Embedding } from '../types/embedding.js';
import type { GraphDatabaseConnection } from './graph-database.js';
import type { EmbeddingManager } from './embedding-manager.js';

/**
 * Edge with full context from both source and target nodes
 */
interface EdgeWithContext {
  source: string;
  target: string;
  relationship: string;
  weight: number;
  source_repo: string;
  target_repo: string;
  source_props: string; // JSON string
  target_props: string; // JSON string
}

/**
 * Parsed node properties for context generation
 */
interface NodeProperties {
  name?: string;
  type?: string;
  kind?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Embedding record for database storage
 */
interface EmbeddingRecord {
  chunk_id: string;
  repo: string;
  content: string;
  embedding: Embedding;
  metadata: Record<string, unknown>;
}

/**
 * EdgeEmbedder generates and stores embeddings for graph relationships
 *
 * Features:
 * - Batch processing (100 edges per batch)
 * - Cross-repository edge support
 * - Context-rich embedding format
 * - Transaction-safe storage
 * - Progress logging
 *
 * @example
 * ```typescript
 * const embedder = new EdgeEmbedder(db, embeddingManager, logger);
 * const count = await embedder.generateEdgeEmbeddings('my-repo');
 * console.log(`Generated ${count} edge embeddings`);
 * ```
 */
export class EdgeEmbedder {
  private static readonly BATCH_SIZE = 100;
  private static readonly LOG_INTERVAL = 10; // Log every 10 batches

  constructor(
    private db: GraphDatabaseConnection,
    private embeddingManager: EmbeddingManager,
    private logger: Logger
  ) {}

  /**
   * Generate embeddings for all edges associated with a repository
   *
   * @param repo - Repository identifier
   * @returns Number of successfully generated embeddings
   */
  async generateEdgeEmbeddings(repo: string): Promise<number> {
    const startTime = Date.now();
    this.logger.info(`Starting edge embedding generation for repository: ${repo}`);

    try {
      // Extract all edges with full context
      const edges = this.extractEdgesWithContext(repo);
      this.logger.info(`Found ${edges.length} edges to embed for repository: ${repo}`);

      if (edges.length === 0) {
        this.logger.info('No edges found to embed');
        return 0;
      }

      let successCount = 0;
      const totalBatches = Math.ceil(edges.length / EdgeEmbedder.BATCH_SIZE);

      // Process edges in batches
      for (let i = 0; i < edges.length; i += EdgeEmbedder.BATCH_SIZE) {
        const batchNum = Math.floor(i / EdgeEmbedder.BATCH_SIZE) + 1;
        const batch = edges.slice(i, i + EdgeEmbedder.BATCH_SIZE);

        try {
          const batchCount = await this.processBatch(batch, batchNum, totalBatches);
          successCount += batchCount;
        } catch (error) {
          this.logger.error(`Failed to process batch ${batchNum}:`, error);
          // Continue with next batch
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(
        `Edge embedding generation complete: ${successCount}/${edges.length} embeddings in ${duration}s`
      );

      return successCount;
    } catch (error) {
      this.logger.error('Failed to generate edge embeddings:', error);
      throw new Error(`Edge embedding generation failed: ${error}`);
    }
  }

  /**
   * Process a batch of edges
   */
  private async processBatch(
    batch: EdgeWithContext[],
    batchNum: number,
    totalBatches: number
  ): Promise<number> {
    // Log progress for every N batches
    if (batchNum % EdgeEmbedder.LOG_INTERVAL === 0 || batchNum === 1 || batchNum === totalBatches) {
      this.logger.debug(`Processing batch ${batchNum}/${totalBatches} (${batch.length} edges)`);
    }

    // Format edges for embedding
    const formattedTexts: string[] = [];
    const edgeRecords: EmbeddingRecord[] = [];

    for (const edge of batch) {
      try {
        const content = this.formatEdgeForEmbedding(edge);
        formattedTexts.push(content);

        // Prepare embedding record (without embedding yet)
        edgeRecords.push({
          chunk_id: this.generateChunkId(edge),
          repo: edge.source_repo,
          content,
          embedding: [], // Will be filled after generation
          metadata: {
            source: edge.source,
            target: edge.target,
            relationship: edge.relationship,
            weight: edge.weight,
            source_repo: edge.source_repo,
            target_repo: edge.target_repo,
          },
        });
      } catch (error) {
        this.logger.warn(`Failed to format edge ${edge.source} -> ${edge.target}:`, error);
        // Skip this edge and continue
      }
    }

    if (formattedTexts.length === 0) {
      return 0;
    }

    // Generate embeddings for the batch
    try {
      const embeddings = await this.generateEmbeddings(formattedTexts);

      // Attach embeddings to records
      for (let i = 0; i < embeddings.length && i < edgeRecords.length; i++) {
        edgeRecords[i]!.embedding = embeddings[i]!;
      }

      // Store embeddings in database
      await this.storeEmbeddings(edgeRecords.filter((r) => r.embedding.length > 0));

      return edgeRecords.length;
    } catch (error) {
      this.logger.warn(`Failed to generate embeddings for batch ${batchNum}:`, error);
      return 0;
    }
  }

  /**
   * Extract edges with full context from database
   */
  private extractEdgesWithContext(repo: string): EdgeWithContext[] {
    const session = this.db.getSession();

    const query = `
      SELECT
        e.source,
        e.target,
        e.relationship,
        e.weight,
        e.source_repo,
        e.target_repo,
        ns.properties as source_props,
        nt.properties as target_props
      FROM edges e
      JOIN nodes ns ON e.source = ns.id AND e.source_repo = ns.repo
      JOIN nodes nt ON e.target = nt.id AND e.target_repo = nt.repo
      WHERE e.source_repo = ? OR e.target_repo = ?
    `;

    try {
      const stmt = session.prepare(query);
      const rows = stmt.all(repo, repo) as EdgeWithContext[];
      return rows;
    } catch (error) {
      this.logger.error('Failed to extract edges with context:', error);
      throw error;
    }
  }

  /**
   * Format edge for embedding generation
   *
   * Format: "S <predicate> O :: context: ..."
   *
   * @example
   * "api_gateway <routes_to> auth_module :: context: API Gateway (service) routes to AuthModule (class)"
   */
  private formatEdgeForEmbedding(edge: EdgeWithContext): string {
    let sourceProps: NodeProperties;
    let targetProps: NodeProperties;

    try {
      sourceProps = JSON.parse(edge.source_props) as NodeProperties;
      targetProps = JSON.parse(edge.target_props) as NodeProperties;
    } catch (error) {
      this.logger.warn(`Failed to parse properties for edge ${edge.source} -> ${edge.target}`);
      sourceProps = {};
      targetProps = {};
    }

    // Use names or fall back to IDs
    const sourceName = sourceProps.name || edge.source;
    const targetName = targetProps.name || edge.target;

    // Determine entity types
    const sourceType = sourceProps.type || sourceProps.kind || 'entity';
    const targetType = targetProps.type || targetProps.kind || 'entity';

    // Build context string
    const contextParts: string[] = [];

    // Basic relationship description
    contextParts.push(`${sourceName} (${sourceType}) ${edge.relationship} ${targetName} (${targetType})`);

    // Add source description if available
    if (sourceProps.description) {
      contextParts.push(`source: ${sourceProps.description}`);
    }

    // Add target description if available
    if (targetProps.description) {
      contextParts.push(`target: ${targetProps.description}`);
    }

    // Indicate strong relationships
    if (edge.weight > 0.5) {
      contextParts.push('strong relationship');
    }

    // Handle cross-repository edges
    if (edge.source_repo !== edge.target_repo) {
      contextParts.push(`cross-repo: ${edge.source_repo} -> ${edge.target_repo}`);
    }

    const context = contextParts.join(', ');

    return `${sourceName} <${edge.relationship}> ${targetName} :: context: ${context}`;
  }

  /**
   * Generate chunk ID for edge embedding
   */
  private generateChunkId(edge: EdgeWithContext): string {
    return `${edge.source_repo}::edge::${edge.source}::${edge.relationship}::${edge.target}`;
  }

  /**
   * Generate embeddings using the embedding manager
   */
  private async generateEmbeddings(texts: string[]): Promise<Embedding[]> {
    try {
      // Use the embedding manager's batch processing
      const embeddings: Embedding[] = [];

      for (const text of texts) {
        const embedding = await this.embeddingManager.embedChunk(
          {
            id: text, // Temporary ID for embedding generation
            content: text,
          }
        );

        if (embedding.embedding) {
          embeddings.push(embedding.embedding);
        }
      }

      return embeddings;
    } catch (error) {
      this.logger.error('Failed to generate embeddings:', error);
      throw error;
    }
  }

  /**
   * Store embeddings in the database
   */
  private async storeEmbeddings(records: EmbeddingRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    const session = this.db.getSession();

    const insertStmt = session.prepare(`
      INSERT OR REPLACE INTO embeddings
      (chunk_id, repo, entity_id, chunk_type, content, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Use transaction for atomicity
    const transaction = session.transaction(() => {
      for (const record of records) {
        try {
          insertStmt.run(
            record.chunk_id,
            record.repo,
            '', // entity_id is empty for edges (they connect two entities)
            'edge',
            record.content,
            JSON.stringify(record.embedding),
            JSON.stringify(record.metadata)
          );
        } catch (error) {
          this.logger.warn(`Failed to insert embedding for ${record.chunk_id}:`, error);
          // Continue with other records
        }
      }
    });

    try {
      transaction();
    } catch (error) {
      this.logger.error('Transaction failed while storing embeddings:', error);
      throw error;
    }
  }
}
