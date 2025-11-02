/**
 * Entity embedder for generating embeddings for graph entities
 *
 * Formats entities as: "name :: kind :: hints"
 * Examples:
 * - "AuthModule :: class :: Handles authentication"
 * - "fetchUser :: function :: Returns user data from API"
 * - "UserType :: interface :: Type definition for user objects"
 *
 * Processes entities in batches of 50 and stores embeddings in sqlite-vec.
 */

import type { GraphNode, Logger } from '../types/index.js';
import type { Embedding } from '../types/embedding.js';
import type { GraphDatabaseConnection } from './graph-database.js';
import type { EmbeddingManager } from './embedding-manager.js';

/**
 * Entity embedder class for generating and storing entity embeddings
 */
export class EntityEmbedder {
  private static readonly BATCH_SIZE = 50;
  private static readonly LOG_INTERVAL = 10;

  constructor(
    private db: GraphDatabaseConnection,
    private embeddingManager: EmbeddingManager,
    private logger: Logger
  ) {}

  /**
   * Generate embeddings for all entities in a repository
   *
   * @param repo - Repository identifier
   * @returns Count of successfully generated embeddings
   */
  async generateEntityEmbeddings(repo: string): Promise<number> {
    const startTime = Date.now();
    this.logger.info(`Starting entity embedding generation for repository: ${repo}`);

    try {
      // Extract entities from database
      const entities = this.extractEntities(repo);
      const totalEntities = entities.length;

      if (totalEntities === 0) {
        this.logger.warn(`No entities found for repository: ${repo}`);
        return 0;
      }

      this.logger.info(`Found ${totalEntities} entities to process`);

      let successCount = 0;
      let batchCount = 0;

      // Process entities in batches
      for (let i = 0; i < totalEntities; i += EntityEmbedder.BATCH_SIZE) {
        const batchEntities = entities.slice(i, i + EntityEmbedder.BATCH_SIZE);
        batchCount++;

        try {
          const batchSuccessCount = await this.processBatch(repo, batchEntities, batchCount);
          successCount += batchSuccessCount;

          // Log progress every LOG_INTERVAL batches
          if (batchCount % EntityEmbedder.LOG_INTERVAL === 0) {
            const progress = Math.round((successCount / totalEntities) * 100);
            this.logger.debug(
              `Processed ${successCount}/${totalEntities} entities (${progress}%) - Batch ${batchCount}`
            );
          }
        } catch (error) {
          this.logger.error(`Failed to process batch ${batchCount}:`, error);
          // Continue with next batch
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(
        `Entity embedding generation complete: ${successCount}/${totalEntities} successful in ${duration}s`
      );

      return successCount;
    } catch (error) {
      this.logger.error('Entity embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Process a batch of entities
   *
   * @param repo - Repository identifier
   * @param entities - Batch of entities to process
   * @param batchNumber - Current batch number for logging
   * @returns Count of successfully processed entities
   */
  private async processBatch(
    repo: string,
    entities: GraphNode[],
    batchNumber: number
  ): Promise<number> {
    this.logger.debug(`Processing batch ${batchNumber} with ${entities.length} entities`);

    // Format entities for embedding
    const formattedTexts: string[] = [];
    const validEntities: GraphNode[] = [];

    for (const entity of entities) {
      try {
        const formatted = this.formatEntityForEmbedding(entity);
        formattedTexts.push(formatted);
        validEntities.push(entity);
      } catch (error) {
        this.logger.warn(`Failed to format entity ${entity.id}:`, error);
        // Skip malformed entity
      }
    }

    if (validEntities.length === 0) {
      this.logger.warn(`No valid entities in batch ${batchNumber}`);
      return 0;
    }

    // Generate embeddings for the batch
    let embeddings: Embedding[];
    try {
      // Convert texts to EmbeddingChunk format
      const chunks = formattedTexts.map((text, index) => ({
        id: validEntities[index]!.id,
        content: text,
      }));

      // Use embedChunks to generate embeddings
      const embeddedChunks = await this.embeddingManager.embedChunks(chunks);
      embeddings = embeddedChunks.map((chunk) => chunk.embedding!);
    } catch (error) {
      this.logger.error(`Failed to generate embeddings for batch ${batchNumber}:`, error);
      throw error;
    }

    // Store embeddings in database
    const embeddingData = validEntities.map((entity, index) => ({
      chunk_id: `${repo}::entity::${entity.id}`,
      repo,
      entity_id: entity.id,
      content: formattedTexts[index]!,
      embedding: embeddings[index]!,
      metadata: entity.properties,
    }));

    try {
      await this.storeEmbeddings(embeddingData);
      return validEntities.length;
    } catch (error) {
      this.logger.error(`Failed to store embeddings for batch ${batchNumber}:`, error);
      throw error;
    }
  }

  /**
   * Extract entities from the database for a given repository
   *
   * @param repo - Repository identifier
   * @returns Array of graph nodes
   */
  private extractEntities(repo: string): GraphNode[] {
    try {
      const db = this.db.getSession();
      const stmt = db.prepare('SELECT id, properties FROM nodes WHERE repo = ?');
      const rows = stmt.all(repo) as Array<{ id: string; properties: string }>;

      return rows.map((row) => ({
        id: row.id,
        properties: JSON.parse(row.properties) as Record<string, unknown>,
      }));
    } catch (error) {
      this.logger.error(`Failed to extract entities for repo ${repo}:`, error);
      throw error;
    }
  }

  /**
   * Format a graph node for embedding
   *
   * Format: "name :: kind :: hints"
   *
   * @param entity - Graph node to format
   * @returns Formatted string for embedding
   */
  private formatEntityForEmbedding(entity: GraphNode): string {
    const props = entity.properties;

    // Extract name (required, fallback to ID)
    const name = (props.name as string) || entity.id;

    // Infer kind (type of entity)
    const kind = (props.type as string) || (props.kind as string) || 'entity';

    // Extract hints (description, purpose, etc.)
    const hints: string[] = [];

    if (props.description && typeof props.description === 'string') {
      hints.push(props.description);
    }

    if (props.returns && typeof props.returns === 'string') {
      hints.push(`returns ${props.returns}`);
    }

    if (props.file && typeof props.file === 'string') {
      hints.push(`in ${props.file}`);
    }

    if (props.purpose && typeof props.purpose === 'string') {
      hints.push(props.purpose);
    }

    if (props.signature && typeof props.signature === 'string') {
      hints.push(props.signature);
    }

    // Construct formatted string
    const hintsStr = hints.length > 0 ? hints.join(', ') : 'no description';
    return `${name} :: ${kind} :: ${hintsStr}`;
  }

  /**
   * Store embeddings in the database
   *
   * @param embeddings - Array of embedding data to store
   */
  private async storeEmbeddings(
    embeddings: Array<{
      chunk_id: string;
      repo: string;
      entity_id: string;
      content: string;
      embedding: Embedding;
      metadata: Record<string, unknown>;
    }>
  ): Promise<void> {
    const db = this.db.getSession();

    // Use transaction for atomicity
    const transaction = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO embeddings (chunk_id, repo, entity_id, chunk_type, content, embedding, metadata)
        VALUES (?, ?, ?, 'entity', ?, ?, ?)
      `);

      for (const item of embeddings) {
        try {
          stmt.run(
            item.chunk_id,
            item.repo,
            item.entity_id,
            item.content,
            JSON.stringify(item.embedding),
            JSON.stringify(item.metadata)
          );
        } catch (error) {
          this.logger.warn(`Failed to store embedding for entity ${item.entity_id}:`, error);
          // Continue with other embeddings in the batch
        }
      }
    });

    try {
      transaction();
    } catch (error) {
      this.logger.error('Transaction failed during embedding storage:', error);
      throw error;
    }
  }

}