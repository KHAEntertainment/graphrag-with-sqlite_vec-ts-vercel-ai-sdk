/**
 * Markdown Ingestion Example
 *
 * Demonstrates how to use the MarkdownIndexer to ingest raw markdown strings
 * into GraphRAG without requiring filesystem access.
 *
 * This example shows:
 * 1. Indexing small markdown documents
 * 2. Indexing large markdown (simulated 110k tokens)
 * 3. Querying indexed content via hybrid search
 * 4. Performance metrics
 * 5. Repository management
 *
 * Usage:
 *   npm run examples:markdown
 */

import { MarkdownIndexer } from '../src/lib/markdown-indexer.js';
import { GraphDatabaseConnection } from '../src/lib/graph-database.js';
import { GraniteEmbeddingProvider } from '../src/lib/embedding-manager.js';
import { createLanguageModel } from '../src/providers/factory.js';
import { Logger } from '../src/lib/logger.js';
import fs from 'fs';

// Setup
const logger = new Logger('MarkdownIngestionExample');
const dbPath = '.graphrag/markdown-example.sqlite';

// Clean up old database if exists
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  logger.info('Cleaned up old database');
}

const db = new GraphDatabaseConnection(dbPath);
const embeddingProvider = new GraniteEmbeddingProvider(logger);
const llmModel = createLanguageModel({
  provider: 'llamacpp',
  llamacppModelPath: process.env.LLAMACPP_MODEL_PATH || './models/granite-3.1-2b.gguf'
});

const indexer = new MarkdownIndexer(db, embeddingProvider, llmModel, logger);

// Example 1: Small Markdown Document
async function example1_SmallMarkdown() {
  console.log('\n=== Example 1: Small Markdown Document ===\n');

  const markdown = `# TypeScript Utilities

## String Helpers

Utility functions for string manipulation.

### capitalize()

Capitalizes the first letter of a string.

\`\`\`typescript
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
\`\`\`

**Usage:**
\`\`\`typescript
import { capitalize } from './utils';
console.log(capitalize('hello')); // "Hello"
\`\`\`

### truncate()

Truncates a string to a maximum length.

\`\`\`typescript
export function truncate(str: string, maxLength: number): string {
  return str.length > maxLength
    ? str.slice(0, maxLength) + '...'
    : str;
}
\`\`\``;

  const result = await indexer.indexMarkdown(
    'typescript-utils',
    markdown,
    {
      source: 'local',
      metadata: {
        category: 'utilities',
        language: 'typescript'
      }
    }
  );

  console.log('Indexing Results:');
  console.log(`  Repository ID: ${result.repositoryId}`);
  console.log(`  Chunks Created: ${result.chunksCreated}`);
  console.log(`  Entities Extracted: ${result.entitiesExtracted}`);
  console.log(`  Relationships: ${result.relationshipsExtracted}`);
  console.log(`  Entity Embeddings: ${result.entityEmbeddings}`);
  console.log(`  Edge Embeddings: ${result.edgeEmbeddings}`);
  console.log(`  Processing Time: ${result.processingTimeMs}ms`);
}

// Example 2: Large Markdown (Simulated 110k tokens)
async function example2_LargeMarkdown() {
  console.log('\n=== Example 2: Large Markdown (Simulated 110k tokens) ===\n');

  // Generate large markdown similar to what Context7/DeepWiki returns
  const sections = Array(100).fill(null).map((_, i) => `
## ${String.fromCharCode(65 + (i % 26))}PI Endpoint ${i + 1}

### Overview

The \`/api/v1/endpoint${i}\` endpoint provides access to feature ${i + 1}.
This endpoint supports both GET and POST requests with various query parameters.

### Authentication

Requires bearer token authentication:

\`\`\`typescript
const response = await fetch('/api/v1/endpoint${i}', {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
});
\`\`\`

### Request Parameters

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| id | string | Resource identifier | Yes |
| filter | string | Filter expression | No |
| limit | number | Page size (max 100) | No |

### Response Format

\`\`\`typescript
interface Response${i} {
  data: Array<{
    id: string;
    name: string;
    value: number;
  }>;
  meta: {
    total: number;
    page: number;
  };
}
\`\`\`

### Example Usage

\`\`\`typescript
import { api } from './client';

async function fetchData${i}() {
  const result = await api.endpoint${i}({
    id: 'example',
    limit: 50
  });

  return result.data;
}
\`\`\`

### Error Handling

\`\`\`typescript
try {
  const data = await fetchData${i}();
  console.log('Success:', data);
} catch (error) {
  if (error.status === 404) {
    console.error('Resource not found');
  } else if (error.status === 401) {
    console.error('Unauthorized');
  } else {
    console.error('Request failed:', error);
  }
}
\`\`\`
`).join('\n');

  const markdown = `# Complete API Reference

**Version:** 2.5.0
**Last Updated:** ${new Date().toISOString()}

## Table of Contents

- [Introduction](#introduction)
- [Authentication](#authentication)
- [Endpoints](#endpoints)
- [Error Codes](#error-codes)
- [Rate Limiting](#rate-limiting)

## Introduction

This API provides programmatic access to all platform features.
Base URL: \`https://api.example.com/v1\`

${sections}

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

## Rate Limiting

API requests are limited to 1000 requests per hour per API key.
Headers indicate current usage:

\`\`\`
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640000000
\`\`\``;

  console.log(`Markdown size: ${markdown.length} characters (~${Math.round(markdown.length / 4)} tokens)`);

  const startTime = Date.now();
  const result = await indexer.indexMarkdown(
    'large-api-docs',
    markdown,
    {
      source: 'context7',
      url: 'https://docs.example.com/api',
      metadata: {
        version: '2.5.0',
        fetched_at: new Date().toISOString()
      }
    }
  );
  const totalTime = Date.now() - startTime;

  console.log('\nIndexing Results:');
  console.log(`  Repository ID: ${result.repositoryId}`);
  console.log(`  Chunks Created: ${result.chunksCreated}`);
  console.log(`  Entities Extracted: ${result.entitiesExtracted}`);
  console.log(`  Relationships: ${result.relationshipsExtracted}`);
  console.log(`  Entity Embeddings: ${result.entityEmbeddings}`);
  console.log(`  Edge Embeddings: ${result.edgeEmbeddings}`);
  console.log(`  Total Processing Time: ${totalTime}ms`);
  console.log(`  Chunks/second: ${(result.chunksCreated / (totalTime / 1000)).toFixed(2)}`);
}

// Example 3: Repository Management
async function example3_RepositoryManagement() {
  console.log('\n=== Example 3: Repository Management ===\n');

  const markdown = `# Test Repository

Simple test document.`;

  // Index a repository
  await indexer.indexMarkdown('management-test', markdown, {
    source: 'local',
    skipEmbeddings: true // Skip for speed
  });

  // Check if indexed
  const isIndexed = await indexer.isIndexed('management-test');
  console.log(`Repository indexed: ${isIndexed}`);

  // Get stats
  const stats = await indexer.getStats('management-test');
  console.log('\nRepository Stats:');
  console.log(`  Nodes: ${stats.nodes}`);
  console.log(`  Edges: ${stats.edges}`);
  console.log(`  Chunks: ${stats.chunks}`);
  console.log(`  Embeddings: ${stats.embeddings}`);

  // Delete repository
  await indexer.deleteRepository('management-test');
  console.log('\nRepository deleted');

  // Verify deletion
  const statsAfter = await indexer.getStats('management-test');
  console.log(`  Chunks after deletion: ${statsAfter.chunks}`);
}

// Example 4: Real-World Use Case (Simulated Legilimens Integration)
async function example4_LegilimensIntegration() {
  console.log('\n=== Example 4: Legilimens Integration Simulation ===\n');

  // Simulate fetching from Context7/DeepWiki
  async function simulateFetchFromContext7(repo: string) {
    console.log(`Simulating fetch from Context7: ${repo}...`);

    return {
      content: `# ${repo} Documentation

## Installation

\`\`\`bash
npm install ${repo}
\`\`\`

## Quick Start

\`\`\`typescript
import { initialize } from '${repo}';

const client = initialize({
  apiKey: process.env.API_KEY
});
\`\`\`

## API Reference

### initialize(options)

Initialize the ${repo} client with configuration options.

**Parameters:**
- \`options.apiKey\` (string, required) - Your API key
- \`options.timeout\` (number, optional) - Request timeout in ms

**Returns:** Client instance

### Client Methods

#### client.query(params)

Execute a query against the ${repo} API.

\`\`\`typescript
const result = await client.query({
  model: 'gpt-4',
  prompt: 'Hello world'
});
\`\`\``,
      url: `https://deepwiki.com/${repo}`,
      fetchedAt: new Date()
    };
  }

  // Simulate Legilimens workflow
  const repoName = 'vercel/ai';
  console.log(`\nLegilimens: Generating documentation for ${repoName}...`);

  // Step 1: Fetch docs
  const docs = await simulateFetchFromContext7(repoName);
  console.log(`✓ Fetched ${docs.content.length} characters from Context7`);

  // Step 2: Index to GraphRAG
  console.log(`\nLegilimens: Indexing to GraphRAG...`);
  const result = await indexer.indexMarkdown(
    repoName,
    docs.content,
    {
      source: 'context7',
      url: docs.url,
      metadata: {
        fetchedAt: docs.fetchedAt.toISOString()
      }
    }
  );
  console.log(`✓ Indexed: ${result.chunksCreated} chunks, ${result.entitiesExtracted} entities`);

  // Step 3: Update gateway file (simulated)
  console.log(`\nLegilimens: Updating gateway file...`);
  const gatewayContent = `# ${repoName} Documentation Gateway

**Local Knowledge Base Available** ✅

This dependency has been indexed into the local GraphRAG knowledge base.

## Querying the Knowledge Base

Use the MCP tool to query:
\`\`\`
Query: "How do I initialize the client?"
\`\`\`

## Statistics

- **Repository:** ${repoName}
- **Indexed:** ${result.indexedAt.toISOString()}
- **Entities:** ${result.entitiesExtracted}
- **Chunks:** ${result.chunksCreated}

## Fallback Resources

If the knowledge base doesn't have what you need:
- Context7: ${docs.url}
- Official Docs: https://sdk.vercel.ai
`;

  console.log('Gateway File Content:');
  console.log(gatewayContent);
}

// Run all examples
async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   Markdown Ingestion Examples                 ║');
  console.log('╚════════════════════════════════════════════════╝');

  try {
    // Initialize embedding provider
    console.log('\nInitializing embedding provider...');
    await embeddingProvider.initialize();
    console.log('✓ Embedding provider ready\n');

    // Run examples
    await example1_SmallMarkdown();
    await example2_LargeMarkdown();
    await example3_RepositoryManagement();
    await example4_LegilimensIntegration();

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   All Examples Completed Successfully!        ║');
    console.log('╚════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ Example failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    db['db'].close();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main as runMarkdownIngestionExamples };
