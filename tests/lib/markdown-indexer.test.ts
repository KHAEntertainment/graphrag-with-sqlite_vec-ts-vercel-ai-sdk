import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MarkdownIndexer } from '../../src/lib/markdown-indexer.js';
import { GraphDatabaseConnection } from '../../src/lib/graph-database.js';
import { Logger } from '../../src/lib/logger.js';
import { createTestLLM, hasTestLLM } from '../helpers/test-provider.js';
import fs from 'fs';
import path from 'path';

// Mock embedding provider for testing
class MockEmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    // Return mock 768-dim embedding
    return Array(768).fill(0).map(() => Math.random());
  }
}

describe('MarkdownIndexer', () => {
  let db: GraphDatabaseConnection;
  let indexer: MarkdownIndexer;
  let logger: Logger;
  let testDbPath: string;

  beforeEach(() => {
    // Check if test LLM is available
    if (!hasTestLLM()) {
      throw new Error(
        'OPENROUTER_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY required for integration tests.\n' +
        'Get a free key at https://openrouter.ai/keys'
      );
    }

    // Create temp database for testing
    testDbPath = path.join(process.cwd(), `.test-md-indexer-${Date.now()}.sqlite`);
    logger = new Logger('MarkdownIndexerTest', 'ERROR');
    db = new GraphDatabaseConnection(testDbPath);
    const embeddingProvider = new MockEmbeddingProvider() as any;

    // Use real LLM for testing
    const llmModel = createTestLLM();
    indexer = new MarkdownIndexer(db, embeddingProvider, llmModel, logger);
  });

  afterEach(() => {
    // Cleanup
    db['db'].close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Basic Indexing', () => {
    it('should index simple markdown successfully', async () => {
      const markdown = `# Test Document

This is a test document with some content.

## Features

- Feature 1
- Feature 2

\`\`\`typescript
function example() {
  return "hello";
}
\`\`\``;

      const result = await indexer.indexMarkdown(
        'test-repo',
        markdown,
        {
          source: 'local',
          skipEmbeddings: true // Skip embeddings for faster testing
        }
      );

      expect(result.repositoryId).toBe('test-repo');
      expect(result.chunksCreated).toBeGreaterThan(0);
      expect(result.entitiesExtracted).toBeGreaterThan(0);
      expect(result.indexedAt).toBeInstanceOf(Date);
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });

    it('should handle empty markdown', async () => {
      const result = await indexer.indexMarkdown(
        'empty-repo',
        '',
        {
          source: 'local',
          skipEmbeddings: true
        }
      );

      expect(result.chunksCreated).toBe(0);
      expect(result.entitiesExtracted).toBe(0);
    });

    it('should handle single-line markdown', async () => {
      const result = await indexer.indexMarkdown(
        'single-line-repo',
        '# Hello World',
        {
          source: 'local',
          skipEmbeddings: true
        }
      );

      expect(result.chunksCreated).toBeGreaterThan(0);
      expect(result.repositoryId).toBe('single-line-repo');
    });
  });

  describe('Large Document Handling', () => {
    it('should handle large markdown (simulated 110k tokens)', async () => {
      // Generate large markdown
      const sections = Array(50).fill(null).map((_, i) => `
## Section ${i + 1}

This section contains detailed documentation about feature ${i + 1}.
It includes multiple paragraphs with technical information.

\`\`\`typescript
export function feature${i}() {
  // Implementation details
  return {
    name: "Feature ${i + 1}",
    version: "1.0.0"
  };
}
\`\`\`

### Usage

\`\`\`typescript
import { feature${i} } from './features';
const result = feature${i}();
\`\`\`
`).join('\n');

      const markdown = `# Large API Documentation\n\n${sections}`;

      const result = await indexer.indexMarkdown(
        'large-repo',
        markdown,
        {
          source: 'context7',
          url: 'https://example.com/api',
          skipEmbeddings: true
        }
      );

      expect(result.chunksCreated).toBeGreaterThan(20);
      expect(result.entitiesExtracted).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeLessThan(60000); // Should complete within 60s
    });
  });

  describe('Metadata Preservation', () => {
    it('should preserve metadata in chunks', async () => {
      const markdown = '# Test\n\nContent here.';

      await indexer.indexMarkdown(
        'meta-repo',
        markdown,
        {
          source: 'deepwiki',
          url: 'https://deepwiki.com/test',
          metadata: {
            custom: 'value',
            timestamp: new Date().toISOString()
          },
          skipEmbeddings: true
        }
      );

      // Check that chunks were stored with metadata
      const chunks = db['db'].prepare(
        'SELECT * FROM chunks WHERE repo = ?'
      ).all('meta-repo');

      expect(chunks.length).toBeGreaterThan(0);

      const firstChunk = chunks[0] as any;
      const metadata = JSON.parse(firstChunk.metadata);
      expect(metadata.source).toBe('deepwiki');
      expect(metadata.url).toBe('https://deepwiki.com/test');
      expect(metadata.custom).toBe('value');
    });
  });

  describe('Repository Management', () => {
    it('should check if repository is indexed', async () => {
      const markdown = '# Test\n\nContent.';

      // Before indexing
      const beforeIndexed = await indexer.isIndexed('check-repo');
      expect(beforeIndexed).toBe(false);

      // After indexing
      await indexer.indexMarkdown('check-repo', markdown, {
        source: 'local',
        skipEmbeddings: true
      });

      const afterIndexed = await indexer.isIndexed('check-repo');
      expect(afterIndexed).toBe(true);
    });

    it('should get repository stats', async () => {
      const markdown = `# Documentation

## Section 1

Content with entities.

\`\`\`typescript
class Example {}
\`\`\``;

      await indexer.indexMarkdown('stats-repo', markdown, {
        source: 'local',
        skipEmbeddings: true
      });

      const stats = await indexer.getStats('stats-repo');

      expect(stats.nodes).toBeGreaterThanOrEqual(0);
      expect(stats.edges).toBeGreaterThanOrEqual(0);
      expect(stats.chunks).toBeGreaterThan(0);
      expect(stats.embeddings).toBe(0); // Embeddings skipped
    });

    it('should delete repository data', async () => {
      const markdown = '# Test\n\nContent.';

      await indexer.indexMarkdown('delete-repo', markdown, {
        source: 'local',
        skipEmbeddings: true
      });

      // Verify data exists
      const beforeStats = await indexer.getStats('delete-repo');
      expect(beforeStats.chunks).toBeGreaterThan(0);

      // Delete
      await indexer.deleteRepository('delete-repo');

      // Verify data removed
      const afterStats = await indexer.getStats('delete-repo');
      expect(afterStats.chunks).toBe(0);
      expect(afterStats.nodes).toBe(0);
      expect(afterStats.edges).toBe(0);
    });
  });

  describe('Chunking Options', () => {
    it('should respect custom chunk size', async () => {
      const markdown = 'Content here. '.repeat(100);

      const smallChunks = await indexer.indexMarkdown(
        'small-chunks-repo',
        markdown,
        {
          source: 'local',
          chunkOptions: { chunkSize: 50 },
          skipEmbeddings: true
        }
      );

      const largeChunks = await indexer.indexMarkdown(
        'large-chunks-repo',
        markdown,
        {
          source: 'local',
          chunkOptions: { chunkSize: 500 },
          skipEmbeddings: true
        }
      );

      expect(smallChunks.chunksCreated).toBeGreaterThan(largeChunks.chunksCreated);
    });
  });

  describe('Error Handling', () => {
    it('should handle extraction errors gracefully', async () => {
      // Mock LLM that throws error
      const errorLLM = {
        async generateText() {
          throw new Error('LLM error');
        }
      } as any;

      const errorIndexer = new MarkdownIndexer(
        db,
        new MockEmbeddingProvider() as any,
        errorLLM,
        logger
      );

      await expect(
        errorIndexer.indexMarkdown('error-repo', '# Test', {
          source: 'local',
          skipEmbeddings: true
        })
      ).rejects.toThrow();
    });
  });

  describe('Integration with Existing Components', () => {
    it('should work with DocumentProcessor', async () => {
      const markdown = `# API Reference

## Authentication

The API uses bearer tokens for authentication.

\`\`\`typescript
const token = "Bearer abc123";
fetch(url, { headers: { Authorization: token } });
\`\`\``;

      const result = await indexer.indexMarkdown(
        'integration-repo',
        markdown,
        {
          source: 'github',
          skipEmbeddings: true
        }
      );

      // Should extract entities via DocumentProcessor
      expect(result.entitiesExtracted).toBeGreaterThan(0);
    });

    it('should store chunks for hybrid search', async () => {
      const markdown = `# Search Test

Content that should be searchable via:
- Dense search (semantic)
- Sparse search (BM25)
- Pattern search (trigram)`;

      await indexer.indexMarkdown(
        'search-repo',
        markdown,
        {
          source: 'local',
          skipEmbeddings: true
        }
      );

      // Verify chunks stored
      const chunks = db['db'].prepare(
        'SELECT * FROM chunks WHERE repo = ?'
      ).all('search-repo');
      expect(chunks.length).toBeGreaterThan(0);

      // Verify FTS5 index
      const ftsChunks = db['db'].prepare(
        'SELECT * FROM chunks_fts WHERE chunks_fts MATCH ?'
      ).all('searchable');
      expect(ftsChunks.length).toBeGreaterThan(0);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle complex API documentation', async () => {
      const markdown = `# Vercel AI SDK Documentation

## Overview

The Vercel AI SDK provides a unified interface for AI models.

## Installation

\`\`\`bash
npm install ai
\`\`\`

## Basic Usage

\`\`\`typescript
import { generateText } from 'ai';

const { text } = await generateText({
  model: openai('gpt-4'),
  prompt: 'Hello world'
});
\`\`\`

## API Reference

### generateText()

Generates text from a prompt.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| model | Model | The AI model to use |
| prompt | string | The input prompt |

**Returns:** Promise<{ text: string }>

## Error Handling

Handle errors with try/catch:

\`\`\`typescript
try {
  const { text } = await generateText({...});
} catch (error) {
  console.error('Generation failed:', error);
}
\`\`\``;

      const result = await indexer.indexMarkdown(
        'vercel-ai-sdk',
        markdown,
        {
          source: 'context7',
          url: 'https://sdk.vercel.ai/docs',
          skipEmbeddings: true
        }
      );

      expect(result.chunksCreated).toBeGreaterThan(5);
      expect(result.entitiesExtracted).toBeGreaterThan(0);
      expect(result.relationshipsExtracted).toBeGreaterThan(0);
    });

    it('should handle GitHub README format', async () => {
      const markdown = `# Project Name

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://example.com)

A description of the project.

## Features

- ✨ Feature 1
- 🚀 Feature 2
- 📦 Feature 3

## Quick Start

\`\`\`bash
git clone https://github.com/user/repo.git
cd repo
npm install
npm start
\`\`\`

## License

MIT © 2025`;

      const result = await indexer.indexMarkdown(
        'github-readme',
        markdown,
        {
          source: 'github',
          url: 'https://github.com/user/repo',
          skipEmbeddings: true
        }
      );

      expect(result.chunksCreated).toBeGreaterThan(0);
      expect(result.indexedAt).toBeInstanceOf(Date);
    });
  });
});