/**
 * Example: Integrating embeddings with knowledge graph
 *
 * This example shows how to:
 * 1. Generate embeddings for document chunks
 * 2. Extract entities/relationships for knowledge graph
 * 3. Link embeddings to graph entities
 * 4. Perform hybrid queries (semantic + graph)
 */

import { Logger } from '../src/lib/logger.js';
import { GraphDatabaseConnection } from '../src/lib/graph-database.js';
import { GraphManager } from '../src/lib/graph-manager.js';
import { DocumentProcessor } from '../src/lib/document-processor.js';
import {
  createEmbeddingProvider,
  EmbeddingManager,
  GraniteEmbeddingProvider,
  NomicEmbeddingProvider,
  BGEEmbeddingProvider,
} from '../src/lib/embedding-manager.js';
import type { EmbeddingChunk } from '../src/types/embedding.js';
import type { LanguageModelV1 } from 'ai';

// Initialize logger
const logger = new Logger('EmbeddingExample');

/**
 * Example 1: Basic embedding generation with Granite
 */
async function example1_BasicEmbedding() {
  logger.info('=== Example 1: Basic Embedding Generation ===');

  // Create Granite embedding provider (recommended for code)
  const provider = new GraniteEmbeddingProvider(logger);
  await provider.initialize();

  const manager = new EmbeddingManager(provider, logger);

  // Example code snippet
  const codeSnippet = `
    function calculateDistance(x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      return Math.sqrt(dx * dx + dy * dy);
    }
  `;

  // Generate embedding
  const embedding = await provider.embed(codeSnippet);
  logger.info(`Generated embedding with ${embedding.length} dimensions`);
  logger.info(`First 5 values: ${embedding.slice(0, 5).join(', ')}`);
}

/**
 * Example 2: Batch embedding generation
 */
async function example2_BatchEmbedding() {
  logger.info('=== Example 2: Batch Embedding Generation ===');

  const provider = new GraniteEmbeddingProvider(logger);
  await provider.initialize();
  const manager = new EmbeddingManager(provider, logger);

  // Multiple code chunks
  const chunks: EmbeddingChunk[] = [
    {
      id: 'chunk-1',
      content: 'import React from "react";',
      metadata: { file: 'App.tsx', line: 1 },
    },
    {
      id: 'chunk-2',
      content: 'export function App() { return <div>Hello</div>; }',
      metadata: { file: 'App.tsx', line: 3 },
    },
    {
      id: 'chunk-3',
      content: 'import { useState } from "react";',
      metadata: { file: 'Counter.tsx', line: 1 },
    },
  ];

  // Generate embeddings for all chunks
  const embeddedChunks = await manager.embedChunks(chunks);
  logger.info(`Generated ${embeddedChunks.length} embeddings`);

  // Calculate similarity between first two chunks
  if (embeddedChunks[0]?.embedding && embeddedChunks[1]?.embedding) {
    const similarity = manager.cosineSimilarity(
      embeddedChunks[0].embedding,
      embeddedChunks[1].embedding
    );
    logger.info(`Similarity between chunk-1 and chunk-2: ${similarity.toFixed(4)}`);
  }
}

/**
 * Example 3: Compare different embedding models
 */
async function example3_CompareModels() {
  logger.info('=== Example 3: Compare Embedding Models ===');

  const text = 'function sum(a, b) { return a + b; }';

  // Test Granite
  const granite = new GraniteEmbeddingProvider(logger);
  await granite.initialize();
  const graniteEmbedding = await granite.embed(text);
  logger.info(`Granite: ${granite.getDimension()} dimensions`);

  // Test Nomic
  const nomic = new NomicEmbeddingProvider(logger);
  await nomic.initialize();
  const nomicEmbedding = await nomic.embed(text);
  logger.info(`Nomic: ${nomic.getDimension()} dimensions`);

  // Test BGE
  const bge = new BGEEmbeddingProvider(logger);
  await bge.initialize();
  const bgeEmbedding = await bge.embed(text);
  logger.info(`BGE: ${bge.getDimension()} dimensions`);

  logger.info('All models loaded successfully!');
}

/**
 * Example 4: Semantic similarity search
 */
async function example4_SemanticSearch() {
  logger.info('=== Example 4: Semantic Similarity Search ===');

  const provider = new GraniteEmbeddingProvider(logger);
  await provider.initialize();
  const manager = new EmbeddingManager(provider, logger);

  // Create a simple "database" of code chunks
  const codebase: EmbeddingChunk[] = [
    { id: '1', content: 'function add(a, b) { return a + b; }' },
    { id: '2', content: 'function multiply(x, y) { return x * y; }' },
    { id: '3', content: 'function divide(numerator, denominator) { return numerator / denominator; }' },
    { id: '4', content: 'class Calculator { constructor() {} }' },
    { id: '5', content: 'import express from "express";' },
  ];

  // Generate embeddings for all code
  const embeddedCodebase = await manager.embedChunks(codebase);

  // Query: find code similar to this
  const query = 'function subtract(x, y) { return x - y; }';
  const queryEmbedding = await provider.embed(query);

  // Calculate similarities
  const results = embeddedCodebase
    .map((chunk) => ({
      ...chunk,
      similarity: chunk.embedding
        ? manager.cosineSimilarity(queryEmbedding, chunk.embedding)
        : 0,
    }))
    .sort((a, b) => b.similarity - a.similarity);

  logger.info('Query:', query);
  logger.info('\nTop 3 similar code snippets:');
  results.slice(0, 3).forEach((result, idx) => {
    logger.info(`${idx + 1}. Similarity: ${result.similarity.toFixed(4)}`);
    logger.info(`   Content: ${result.content}\n`);
  });
}

/**
 * Example 5: Hybrid approach - Embeddings + Knowledge Graph
 *
 * This shows how to use embeddings for semantic search AND
 * graph structure for relationship discovery.
 */
async function example5_HybridApproach(llmModel: LanguageModelV1) {
  logger.info('=== Example 5: Hybrid Embeddings + Knowledge Graph ===');

  // 1. Initialize components
  const embeddingProvider = new GraniteEmbeddingProvider(logger);
  await embeddingProvider.initialize();
  const embeddingManager = new EmbeddingManager(embeddingProvider, logger);

  // Ensure DB directory exists before opening file
  if (!existsSync('data')) {
    mkdirSync('data', { recursive: true });
  }
  const dbConnection = new GraphDatabaseConnection('data/example_hybrid.sqlite');
  const graphManager = new GraphManager(dbConnection, logger);
  const documentProcessor = new DocumentProcessor(llmModel, logger);

  // 2. Process a document
  const document = `
    The authentication module handles user login and session management.
    It depends on the database module for storing user credentials.
    The API gateway routes requests to the authentication module.
  `;

  // Split into chunks
  const chunks = documentProcessor.splitDocuments([document]);

  // 3. Generate embeddings (semantic layer)
  const embeddingChunks: EmbeddingChunk[] = chunks.map((content, idx) => ({
    id: `chunk-${idx}`,
    content,
  }));
  const embeddedChunks = await embeddingManager.embedChunks(embeddingChunks);

  logger.info(`Generated ${embeddedChunks.length} embeddings`);

  // 4. Extract entities/relationships (graph layer)
  const elements = await documentProcessor.extractElements(chunks);
  const summaries = await documentProcessor.summarizeElements(elements);
  graphManager.buildGraph(summaries);

  logger.info('Built knowledge graph');

  // 5. Hybrid query example
  const query = 'How does user authentication work?';
  const queryEmbedding = await embeddingProvider.embed(query);

  // Find semantically similar chunks
  const semanticResults = embeddedChunks
    .map((chunk) => ({
      ...chunk,
      similarity: chunk.embedding
        ? embeddingManager.cosineSimilarity(queryEmbedding, chunk.embedding)
        : 0,
    }))
    .filter((r) => r.similarity > 0.7)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  logger.info(`\nQuery: "${query}"`);
  logger.info(`Found ${semanticResults.length} semantically relevant chunks`);

  // Get graph centrality for relationship context
  const centrality = graphManager.calculateCentralityMeasures();
  logger.info('\nTop entities by centrality:');
  centrality.degree.slice(0, 3).forEach((entity) => {
    logger.info(`  - ${entity.entityName}: ${entity.score} connections`);
  });

  logger.info('\nHybrid approach combines:');
  logger.info('✓ Semantic similarity (which chunks are relevant)');
  logger.info('✓ Graph structure (how entities relate)');

  dbConnection.close();
}

/**
 * Example 6: Using factory pattern for embedding providers
 */
async function example6_FactoryPattern() {
  logger.info('=== Example 6: Factory Pattern ===');

  // Create provider using factory (based on config)
  const provider = await createEmbeddingProvider(
    {
      type: 'granite',
      model: 'ibm-granite/granite-embedding-125m-english',
    },
    logger
  );

  const manager = new EmbeddingManager(provider, logger);

  const text = 'async function fetchData() { return await api.get("/data"); }';
  const embedding = await provider.embed(text);

  logger.info(`Generated embedding: ${embedding.length} dimensions`);
  logger.info(`Provider dimension: ${manager.getDimension()}`);
}

// Run examples
async function runExamples() {
  try {
    // Basic examples (no LLM required)
    await example1_BasicEmbedding();
    await example2_BatchEmbedding();
    await example3_CompareModels();
    await example4_SemanticSearch();
    await example6_FactoryPattern();

    // Example 5 requires an LLM model - commented out
    // You would need to pass your Phi-4 or Granite 4.0 model here
    // const llmModel = ...; // Your LLM instance
    // await example5_HybridApproach(llmModel);

    logger.info('\n✅ All examples completed successfully!');
  } catch (error) {
    logger.error('Example failed:', error);
    process.exit(1);
  }
}

// Export for use in other files
export {
  example1_BasicEmbedding,
  example2_BatchEmbedding,
  example3_CompareModels,
  example4_SemanticSearch,
  example5_HybridApproach,
  example6_FactoryPattern,
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples();
}
