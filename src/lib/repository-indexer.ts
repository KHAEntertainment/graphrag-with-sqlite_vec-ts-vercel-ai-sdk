/**
 * Repository indexer for managing multi-repository graph construction
 *
 * This module provides functionality to:
 * - Register repositories in the database
 * - Index repository contents into the graph
 * - Track indexing status and metadata
 * - Prepare for embedding integration (Phase 3)
 */

import type { GraphDatabaseConnection } from './graph-database.js';
import type { Logger } from '../types/index.js';
import { DatabaseError } from '../types/errors.js';
import { EntityEmbedder } from './entity-embedder.js';
import { EdgeEmbedder } from './edge-embedder.js';
import { DocumentProcessor } from './document-processor.js';
import { GraphManager } from './graph-manager.js';
import type { EmbeddingManager } from './embedding-manager.js';
import type { LanguageModelV1 } from 'ai';
import { promises as fs } from 'fs';
import { join, extname, relative } from 'path';
import { createHash } from 'crypto';

/**
 * Repository metadata
 */
export interface RepositoryInfo {
  id: string;
  name: string;
  version?: string;
  branch?: string;
  commit_hash?: string;
  metadata?: Record<string, unknown>;
  embedding_model?: string;
}

/**
 * Repository indexing status
 */
export interface IndexingStatus {
  repository_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  indexed_at?: string;
  error?: string;
  stats?: {
    nodes_count: number;
    edges_count: number;
    chunks_count: number;
  };
}

/**
 * Repository indexer for multi-repository support
 */
export class RepositoryIndexer {
  private db: GraphDatabaseConnection;
  private logger: Logger;
  private embeddingManager: EmbeddingManager;
  private model: LanguageModelV1;

  constructor(
    db: GraphDatabaseConnection,
    logger: Logger,
    embeddingManager: EmbeddingManager,
    model: LanguageModelV1
  ) {
    this.db = db;
    this.logger = logger;
    this.embeddingManager = embeddingManager;
    this.model = model;
  }

  /**
   * Register a new repository in the database
   *
   * @param repo Repository information
   * @returns The registered repository ID
   */
  registerRepository(repo: RepositoryInfo): string {
    this.logger.info(`Registering repository: ${repo.name}`);

    try {
      const session = this.db.getSession();

      // Check if repository already exists
      const existing = session
        .prepare('SELECT id FROM repositories WHERE id = ?')
        .get(repo.id);

      if (existing) {
        this.logger.warn(`Repository ${repo.id} already registered, updating metadata`);

        session
          .prepare(`
            UPDATE repositories
            SET name = ?, version = ?, branch = ?, commit_hash = ?,
                metadata = ?, embedding_model = ?
            WHERE id = ?
          `)
          .run(
            repo.name,
            repo.version ?? null,
            repo.branch ?? null,
            repo.commit_hash ?? null,
            repo.metadata ? JSON.stringify(repo.metadata) : null,
            repo.embedding_model ?? null,
            repo.id
          );
      } else {
        session
          .prepare(`
            INSERT INTO repositories
            (id, name, version, branch, commit_hash, metadata, embedding_model)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            repo.id,
            repo.name,
            repo.version ?? null,
            repo.branch ?? null,
            repo.commit_hash ?? null,
            repo.metadata ? JSON.stringify(repo.metadata) : null,
            repo.embedding_model ?? null
          );

        this.logger.info(`Repository ${repo.id} registered successfully`);
      }

      return repo.id;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to register repository ${repo.id}:`, errorMessage);
      throw new DatabaseError(
        `Failed to register repository: ${errorMessage}`,
        {
          context: { repository: repo.id },
        }
      );
    }
  }

  /**
   * Get repository information by ID
   *
   * @param repositoryId The repository ID
   * @returns Repository information or null if not found
   */
  getRepository(repositoryId: string): RepositoryInfo | null {
    try {
      const session = this.db.getSession();
      const result = session
        .prepare('SELECT * FROM repositories WHERE id = ?')
        .get(repositoryId) as any;

      if (!result) {
        return null;
      }

      return {
        id: result.id,
        name: result.name,
        version: result.version ?? undefined,
        branch: result.branch ?? undefined,
        commit_hash: result.commit_hash ?? undefined,
        metadata: result.metadata ? JSON.parse(result.metadata) : undefined,
        embedding_model: result.embedding_model ?? undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get repository ${repositoryId}:`, errorMessage);
      return null;
    }
  }

  /**
   * List all registered repositories
   *
   * @returns Array of repository information
   */
  listRepositories(): RepositoryInfo[] {
    try {
      const session = this.db.getSession();
      const results = session
        .prepare('SELECT * FROM repositories ORDER BY indexed_at DESC')
        .all() as any[];

      return results.map((row) => ({
        id: row.id,
        name: row.name,
        version: row.version ?? undefined,
        branch: row.branch ?? undefined,
        commit_hash: row.commit_hash ?? undefined,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        embedding_model: row.embedding_model ?? undefined,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to list repositories:', errorMessage);
      return [];
    }
  }

  /**
   * Get indexing status for a repository
   *
   * @param repositoryId The repository ID
   * @returns Indexing status information
   */
  getIndexingStatus(repositoryId: string): IndexingStatus {
    try {
      const session = this.db.getSession();

      // Count nodes, edges, and chunks for this repository
      const nodeCount = session
        .prepare('SELECT COUNT(*) as count FROM nodes WHERE repo = ?')
        .get(repositoryId) as { count: number };

      const edgeCount = session
        .prepare('SELECT COUNT(*) as count FROM edges WHERE source_repo = ?')
        .get(repositoryId) as { count: number };

      const chunkCount = session
        .prepare('SELECT COUNT(*) as count FROM chunks WHERE repo = ?')
        .get(repositoryId) as { count: number };

      const hasData = nodeCount.count > 0 || edgeCount.count > 0 || chunkCount.count > 0;

      return {
        repository_id: repositoryId,
        status: hasData ? 'completed' : 'pending',
        stats: {
          nodes_count: nodeCount.count,
          edges_count: edgeCount.count,
          chunks_count: chunkCount.count,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get indexing status for ${repositoryId}:`, errorMessage);
      return {
        repository_id: repositoryId,
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  /**
   * TODO (Phase 3): Index repository contents
   *
   * This method will be implemented in Phase 3 when embedding integration is complete.
   * It will:
   * 1. Process repository files
   * 2. Extract entities and relationships
   * 3. Generate embeddings for entities and edges
   * 4. Store in database with proper repo association
   *
   * @param repositoryId The repository to index
   * @param sourcePath Path to repository source code
   */
  async indexRepository(repositoryId: string, sourcePath: string): Promise<void> {
    const startTime = Date.now();
    this.logger.info(`Starting indexing for ${repositoryId} from ${sourcePath}`);

    try {
      // Update repository status to in_progress
      const session = this.db.getSession();
      session
        .prepare('UPDATE repositories SET indexed_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(repositoryId);

      // 1. Scan files (TypeScript, JavaScript, Markdown)
      const files = await this.scanFiles(sourcePath);
      this.logger.info(`Found ${files.length} files to process`);

      if (files.length === 0) {
        this.logger.warn(`No files found to index in ${sourcePath}`);
        return;
      }

      let totalChunks = 0;
      let successfulFiles = 0;
      let failedFiles = 0;

      // 2-5. Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const progress = Math.round(((i + 1) / files.length) * 100);

        try {
          this.logger.debug(`Processing file ${i + 1}/${files.length} (${progress}%): ${file}`);

          // Read file content
          const content = await fs.readFile(file, 'utf-8');

          // Chunk content
          const chunks = this.chunkContent(content, file, sourcePath, repositoryId);
          totalChunks += chunks.length;

          // Extract entities from chunks
          const extraction = await this.extractEntities(chunks, repositoryId);

          // Build graph (insert nodes and edges)
          await this.buildGraph(repositoryId, extraction);

          // Store chunks for hybrid search
          await this.storeChunks(repositoryId, chunks);

          successfulFiles++;

          // Log progress every 10 files
          if ((i + 1) % 10 === 0) {
            this.logger.info(
              `Progress: ${i + 1}/${files.length} files processed (${progress}%)`
            );
          }
        } catch (error) {
          failedFiles++;
          this.logger.error(`Failed to process file ${file}:`, error);
          // Continue with next file
        }
      }

      this.logger.info(
        `File processing complete: ${successfulFiles} successful, ${failedFiles} failed, ${totalChunks} chunks created`
      );

      // 6. Generate entity embeddings
      this.logger.info('Starting entity embedding generation...');
      const entityEmbedder = new EntityEmbedder(this.db, this.embeddingManager, this.logger);
      const entitiesGenerated = await entityEmbedder.generateEntityEmbeddings(repositoryId);

      // 7. Generate edge embeddings
      this.logger.info('Starting edge embedding generation...');
      const edgeEmbedder = new EdgeEmbedder(this.db, this.embeddingManager, this.logger);
      const edgesGenerated = await edgeEmbedder.generateEdgeEmbeddings(repositoryId);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.info(
        `Indexing complete for ${repositoryId}:\n` +
          `  - Files processed: ${successfulFiles}/${files.length}\n` +
          `  - Chunks created: ${totalChunks}\n` +
          `  - Entity embeddings: ${entitiesGenerated}\n` +
          `  - Edge embeddings: ${edgesGenerated}\n` +
          `  - Duration: ${duration}s`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to index repository ${repositoryId}:`, errorMessage);
      throw new DatabaseError(`Failed to index repository: ${errorMessage}`, {
        context: { repository: repositoryId, sourcePath },
      });
    }
  }

  /**
   * Scan directory for files to process
   *
   * @param sourcePath Root directory to scan
   * @returns Array of absolute file paths
   */
  private async scanFiles(sourcePath: string): Promise<string[]> {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.md'];
    const ignore = ['node_modules', 'dist', 'build', '.git', 'tests', 'test', 'coverage'];
    const files: string[] = [];

    const scanDirectory = async (dir: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          // Skip ignored directories
          if (entry.isDirectory() && ignore.includes(entry.name)) {
            continue;
          }

          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile() && extensions.includes(extname(entry.name))) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to scan directory ${dir}:`, error);
      }
    };

    await scanDirectory(sourcePath);
    return files;
  }

  /**
   * Chunk file content into overlapping segments
   *
   * @param content File content
   * @param filePath Absolute file path
   * @param sourcePath Repository root path
   * @param repo Repository identifier
   * @returns Array of chunks with metadata
   */
  private chunkContent(
    content: string,
    filePath: string,
    sourcePath: string,
    repo: string
  ): Array<{
    chunk_id: string;
    content: string;
    metadata: Record<string, unknown>;
  }> {
    const chunkSize = 600;
    const overlap = 100;
    const chunks: Array<{
      chunk_id: string;
      content: string;
      metadata: Record<string, unknown>;
    }> = [];

    const relativePath = relative(sourcePath, filePath);
    const lines = content.split('\n');

    // Calculate character positions for each line
    const linePositions: number[] = [];
    let position = 0;
    for (let i = 0; i < lines.length; i++) {
      linePositions.push(position);
      position += lines[i].length + 1; // +1 for newline
    }

    // Split content into overlapping chunks
    for (let i = 0; i < content.length; i += chunkSize - overlap) {
      const chunkContent = content.slice(i, i + chunkSize);

      // Find line numbers for this chunk
      const startLine = linePositions.findIndex((pos) => pos >= i);
      const endLine = linePositions.findIndex((pos) => pos >= i + chunkSize);

      // Generate stable chunk ID
      const chunkId = createHash('sha256')
        .update(`${repo}:${relativePath}:${i}`)
        .digest('hex')
        .slice(0, 16);

      chunks.push({
        chunk_id: chunkId,
        content: chunkContent,
        metadata: {
          file: relativePath,
          start_line: startLine >= 0 ? startLine + 1 : 1,
          end_line: endLine >= 0 ? endLine + 1 : lines.length,
          start_char: i,
          end_char: Math.min(i + chunkSize, content.length),
        },
      });
    }

    return chunks;
  }

  /**
   * Extract entities from chunks using DocumentProcessor
   *
   * @param chunks Array of content chunks
   * @param repo Repository identifier
   * @returns Extracted element summaries
   */
  private async extractEntities(
    chunks: Array<{ content: string }>,
    repo: string
  ): Promise<string[]> {
    try {
      const documentProcessor = new DocumentProcessor(this.model, this.logger);

      // Extract content from chunks
      const chunkContents = chunks.map((c) => c.content);

      // Extract elements (entities and relationships)
      this.logger.debug(`Extracting entities from ${chunks.length} chunks...`);
      const elements = await documentProcessor.extractElements(chunkContents);

      // Summarize elements into structured format
      this.logger.debug('Summarizing extracted elements...');
      const summaries = await documentProcessor.summarizeElements(elements);

      return summaries;
    } catch (error) {
      this.logger.error(`Failed to extract entities for repo ${repo}:`, error);
      throw error;
    }
  }

  /**
   * Build graph from extracted elements
   *
   * @param repo Repository identifier
   * @param summaries Element summaries containing entities and relationships
   */
  private async buildGraph(repo: string, summaries: string[]): Promise<void> {
    try {
      const graphManager = new GraphManager(this.db, this.logger);

      // Build graph updates the database with nodes and edges
      this.logger.debug(`Building graph for ${summaries.length} summaries...`);
      graphManager.buildGraph(summaries);

      // Update nodes and edges with repository association
      const session = this.db.getSession();

      // Update nodes without repo set
      session
        .prepare('UPDATE nodes SET repo = ? WHERE repo IS NULL OR repo = ""')
        .run(repo);

      // Update edges without source_repo/target_repo set
      session
        .prepare(
          'UPDATE edges SET source_repo = ?, target_repo = ? WHERE source_repo IS NULL OR source_repo = ""'
        )
        .run(repo, repo);

      this.logger.debug('Graph building complete');
    } catch (error) {
      this.logger.error(`Failed to build graph for repo ${repo}:`, error);
      throw error;
    }
  }

  /**
   * Store chunks in database for hybrid search
   *
   * @param repo Repository identifier
   * @param chunks Array of chunks with metadata
   */
  private async storeChunks(
    repo: string,
    chunks: Array<{
      chunk_id: string;
      content: string;
      metadata: Record<string, unknown>;
    }>
  ): Promise<void> {
    try {
      // Transform chunks to database format
      const dbChunks = chunks.map((chunk) => ({
        chunk_id: chunk.chunk_id,
        repo,
        chunk_type: 'document',
        content: chunk.content,
        metadata: chunk.metadata,
      }));

      // Batch insert
      this.db.insertChunks(dbChunks);

      this.logger.debug(`Stored ${chunks.length} chunks for repo ${repo}`);
    } catch (error) {
      this.logger.error(`Failed to store chunks for repo ${repo}:`, error);
      throw error;
    }
  }

  /**
   * TODO (Phase 3): Update repository index
   *
   * Re-index a repository with new or updated content
   *
   * @param repositoryId The repository to update
   * @param sourcePath Path to repository source code
   */
  async updateRepository(repositoryId: string, sourcePath: string): Promise<void> {
    this.logger.info(`TODO: Update repository ${repositoryId} from ${sourcePath}`);

    // TODO: Implement in Phase 3
    // - Detect changed files
    // - Re-embed updated content
    // - Update graph relationships
    // - Maintain cross-repository references

    throw new Error('Repository update not yet implemented - coming in Phase 3');
  }

  /**
   * Delete a repository and all its data
   *
   * @param repositoryId The repository to delete
   */
  deleteRepository(repositoryId: string): void {
    this.logger.info(`Deleting repository: ${repositoryId}`);

    try {
      const session = this.db.getSession();

      const transaction = session.transaction(() => {
        // Delete cross-references
        session
          .prepare('DELETE FROM cross_references WHERE from_repo = ? OR to_repo = ?')
          .run(repositoryId, repositoryId);

        // Delete edges
        session
          .prepare('DELETE FROM edges WHERE source_repo = ? OR target_repo = ?')
          .run(repositoryId, repositoryId);

        // Delete nodes
        session
          .prepare('DELETE FROM nodes WHERE repo = ?')
          .run(repositoryId);

        // Delete chunks
        session
          .prepare('DELETE FROM chunks WHERE repo = ?')
          .run(repositoryId);

        // Delete trigrams (orphaned by chunks deletion)
        session.exec(`
          DELETE FROM chunks_trigram
          WHERE chunk_id NOT IN (SELECT chunk_id FROM chunks)
        `);

        // Delete repository record
        session
          .prepare('DELETE FROM repositories WHERE id = ?')
          .run(repositoryId);
      });

      transaction();

      this.logger.info(`Repository ${repositoryId} deleted successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete repository ${repositoryId}:`, errorMessage);
      throw new DatabaseError(
        `Failed to delete repository: ${errorMessage}`,
        {
          context: { repository: repositoryId },
        }
      );
    }
  }
}