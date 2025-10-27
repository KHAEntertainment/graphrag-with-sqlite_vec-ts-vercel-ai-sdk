/**
 * Main application entry point for GraphRAG with SQLite
 */

import 'dotenv/config';
import { Logger } from './lib/logger.js';
import { GraphDatabaseConnection } from './lib/graph-database.js';
import { GraphManager } from './lib/graph-manager.js';
import { DocumentProcessor } from './lib/document-processor.js';
import { QueryHandler } from './lib/query-handler.js';
import { loadProviderConfigFromEnv } from './providers/config.js';
import { createLanguageModel } from './providers/factory.js';
import { readDocumentsFromFiles } from './utils/file-helpers.js';
import { loadOrRun } from './utils/cache.js';
import { INITIAL_DOCUMENT_FILENAMES, ADDITIONAL_DOCUMENT_FILENAMES } from './constants.js';

// Initialize logger
const logger = new Logger('AppLogger');

/**
 * Perform initial indexing of documents
 */
async function initialIndexing(
  documents: string[],
  graphManager: GraphManager,
  documentProcessor: DocumentProcessor
): Promise<void> {
  const chunks = documentProcessor.splitDocuments(documents);

  const elements = await loadOrRun(
    'data/cache/initial_elements_data.json',
    () => documentProcessor.extractElements(chunks),
    logger
  );

  const summaries = await loadOrRun(
    'data/cache/initial_summaries_data.json',
    () => documentProcessor.summarizeElements(elements),
    logger
  );

  graphManager.buildGraph(summaries);
}

/**
 * Reindex with new documents
 */
async function reindexWithNewDocuments(
  newDocuments: string[],
  graphManager: GraphManager,
  documentProcessor: DocumentProcessor
): Promise<void> {
  const chunks = documentProcessor.splitDocuments(newDocuments);

  const elements = await loadOrRun(
    'data/cache/new_elements_data.json',
    () => documentProcessor.extractElements(chunks),
    logger
  );

  const summaries = await loadOrRun(
    'data/cache/new_summaries_data.json',
    () => documentProcessor.summarizeElements(elements),
    logger
  );

  graphManager.buildGraph(summaries);
  graphManager.reprojectGraph();
}

/**
 * Main application workflow
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting GraphRAG application...');

    // Load provider configuration
    const providerConfig = loadProviderConfigFromEnv();
    logger.info(`Using AI provider: ${providerConfig.type}`);

    // Create language model
    const model = createLanguageModel(providerConfig);

    // Get database path from environment
    const dbPath = process.env.DB_PATH || 'data/graph_database.sqlite';

    // Initialize components
    const dbConnection = new GraphDatabaseConnection(dbPath);
    const graphManager = new GraphManager(dbConnection, logger);
    const documentProcessor = new DocumentProcessor(model, logger);
    const queryHandler = new QueryHandler(graphManager, model, logger);

    // Load initial documents
    logger.info('Loading initial documents...');
    const initialDocuments = await readDocumentsFromFiles([...INITIAL_DOCUMENT_FILENAMES]);

    // Index the initial documents
    logger.info('Starting initial indexing...');
    await initialIndexing(initialDocuments, graphManager, documentProcessor);
    logger.info('Initial indexing completed');

    // First query after initial indexing
    const query1 = 'What are the main themes in these documents?';
    logger.info(`Query 1: ${query1}`);
    const answer1 = await queryHandler.askQuestion(query1);
    logger.info(`Answer to query 1: ${answer1}`);

    // Load and add new documents
    logger.info('Loading additional documents...');
    const newDocuments = await readDocumentsFromFiles([...ADDITIONAL_DOCUMENT_FILENAMES]);

    logger.info('Reindexing with new documents...');
    await reindexWithNewDocuments(newDocuments, graphManager, documentProcessor);
    logger.info('Reindexing completed');

    // Second query after reindexing
    const query2 = 'What are the main themes in these documents?';
    logger.info(`Query 2: ${query2}`);
    const answer2 = await queryHandler.askQuestion(query2);
    logger.info(`Answer to query 2: ${answer2}`);

    logger.info('GraphRAG application completed successfully');

    // Close database connection
    dbConnection.close();
  } catch (error) {
    logger.error('Application error:', error);
    process.exit(1);
  }
}

// Run the application
main();
