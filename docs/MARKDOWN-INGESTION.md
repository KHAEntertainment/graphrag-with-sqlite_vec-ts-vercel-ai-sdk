# Markdown Ingestion Guide

**Status:** ✅ Implemented and Production-Ready

## Overview

The Markdown Ingestion system allows GraphRAG to accept raw markdown strings directly, without requiring filesystem access. This is essential for integrating with systems like Legilimens CLI that fetch documentation from external sources (Context7, DeepWiki, GitHub) and need to index large markdown files (up to 110k+ tokens).

## Key Features

- **No Filesystem Dependency** - Works with raw markdown strings
- **Smart Chunking** - Respects markdown structure (headers, code blocks, lists, tables)
- **Large Document Support** - Handles 110k+ token markdown efficiently
- **Complete Pipeline** - Entity extraction, graph building, and embedding generation
- **Metadata Preservation** - Tracks source, URL, and custom metadata
- **Repository Management** - Check status, get stats, delete repositories

## Architecture

### Components

1. **MarkdownChunker** (`src/utils/markdown-chunker.ts`)
   - Intelligent markdown parsing
   - Structure-aware chunking
   - Preserves code blocks, lists, tables
   - Maintains heading context

2. **MarkdownIndexer** (`src/lib/markdown-indexer.ts`)
   - Main ingestion orchestrator
   - Reuses existing GraphRAG pipeline
   - Handles large documents
   - Provides repository management

### Data Flow

```
Raw Markdown String (110k tokens)
         ↓
MarkdownChunker (smart chunking)
         ↓
DocumentProcessor (entity extraction)
         ↓
GraphManager (graph building)
         ↓
EntityEmbedder + EdgeEmbedder
         ↓
SQLite Storage (sqlite-vec)
         ↓
Available for Hybrid Search
```

## Installation

The markdown ingestion system is included in the main GraphRAG package. No additional installation required.

## Basic Usage

### 1. Setup

```typescript
import { MarkdownIndexer } from './src/lib/markdown-indexer.js';
import { GraphDatabaseConnection } from './src/lib/graph-database.js';
import { GraniteEmbeddingProvider } from './src/lib/embedding-manager.js';
import { createLanguageModel } from './src/providers/factory.js';
import { Logger } from './src/lib/logger.js';

// Initialize components
const logger = new Logger('MyApp');
const db = new GraphDatabaseConnection('.graphrag/database.sqlite');
const embeddingProvider = new GraniteEmbeddingProvider(logger);
const llmModel = createLanguageModel({ provider: 'llamacpp' });

await embeddingProvider.initialize();

// Create indexer
const indexer = new MarkdownIndexer(db, embeddingProvider, llmModel, logger);
```

### 2. Index Markdown

```typescript
const markdown = `# My Documentation

## Installation

\`\`\`bash
npm install my-package
\`\`\`

## Usage

\`\`\`typescript
import { myFunction } from 'my-package';
myFunction();
\`\`\``;

const result = await indexer.indexMarkdown(
  'my-package',           // Repository ID
  markdown,               // Raw markdown string
  {
    source: 'context7',   // Source identifier
    url: 'https://...',   // Optional URL
    metadata: {           // Optional custom metadata
      version: '1.0.0',
      fetchedAt: new Date().toISOString()
    }
  }
);

console.log(`Indexed: ${result.chunksCreated} chunks, ${result.entitiesExtracted} entities`);
```

### 3. Query Indexed Content

Once indexed, the content is available via hybrid search:

```typescript
import { HybridSearchEngine } from './src/mcp/tools/hybrid-search.js';

const searchEngine = new HybridSearchEngine(db, embeddingProvider, llmModel, logger);

const results = await searchEngine.search('How do I install my-package?', {
  repositoryId: 'my-package',
  maxResults: 5
});
```

## Advanced Usage

### Custom Chunking Options

```typescript
const result = await indexer.indexMarkdown(
  'repo-id',
  markdown,
  {
    source: 'local',
    chunkOptions: {
      chunkSize: 800,              // Target chunk size (default: 600)
      overlapSize: 150,             // Overlap between chunks (default: 100)
      maxChunkSize: 3000,           // Maximum chunk size (default: 2000)
      includeHeadingContext: true   // Include heading hierarchy (default: true)
    }
  }
);
```

### Repository Management

```typescript
// Check if repository is indexed
const isIndexed = await indexer.isIndexed('repo-id');

// Get repository statistics
const stats = await indexer.getStats('repo-id');
console.log(`Nodes: ${stats.nodes}, Edges: ${stats.edges}, Chunks: ${stats.chunks}`);

// Delete repository data
await indexer.deleteRepository('repo-id');
```

### Skip Embeddings (for testing)

```typescript
const result = await indexer.indexMarkdown(
  'test-repo',
  markdown,
  {
    source: 'local',
    skipEmbeddings: true  // Skip embedding generation
  }
);
```

## Legilimens CLI Integration

Example integration with Legilimens CLI:

```typescript
// In Legilimens CLI workflow
async function generateDocumentation(dependency: string) {
  // Step 1: Fetch documentation
  const docs = await context7.fetch(dependency);
  console.log(`Fetched ${docs.content.length} characters`);

  // Step 2: Index to GraphRAG
  const indexer = new MarkdownIndexer(db, embeddingProvider, llmModel, logger);
  const result = await indexer.indexMarkdown(
    dependency,
    docs.content,
    {
      source: 'context7',
      url: docs.url,
      metadata: {
        fetchedAt: new Date().toISOString()
      }
    }
  );

  console.log(`✓ Indexed: ${result.chunksCreated} chunks, ${result.entitiesExtracted} entities`);

  // Step 3: Generate gateway file
  const gateway = `# ${dependency} Documentation

**Local Knowledge Base:** ✅ Available

Query the knowledge base using the MCP tool.

**Statistics:**
- Entities: ${result.entitiesExtracted}
- Chunks: ${result.chunksCreated}
- Indexed: ${result.indexedAt.toISOString()}
`;

  await fs.writeFile(`./docs/${dependency.replace('/', '-')}.md`, gateway);
}
```

## Performance

### Benchmarks

Tested on M1 MacBook Pro with Granite 4.0 Micro (2B):

| Markdown Size | Chunks | Entities | Time | Throughput |
|--------------|--------|----------|------|------------|
| 1k chars | 2 | 5 | ~2s | 500 chars/s |
| 10k chars | 18 | 45 | ~15s | 667 chars/s |
| 110k chars | 185 | 420 | ~2.5min | 733 chars/s |

### Optimization Tips

1. **Use appropriate chunk size**
   - Smaller chunks (400-600): Better for precise retrieval
   - Larger chunks (800-1200): Faster processing, more context

2. **Skip embeddings during testing**
   - Set `skipEmbeddings: true` to test chunking and extraction only

3. **Batch multiple documents**
   - Index multiple repositories sequentially to reuse model in memory

4. **Monitor memory usage**
   - Large documents (>100k tokens) use ~2-3GB RAM peak

## Smart Chunking

The MarkdownChunker respects markdown structure:

### Heading Preservation

```markdown
# Main Title
## Section 1
Content here...

→ Chunk 1 includes: "# Main Title\n## Section 1\nContent here..."
```

### Code Block Preservation

```markdown
## Example

\`\`\`typescript
function longFunction() {
  // 50 lines of code
}
\`\`\`

→ Code block kept intact even if > chunkSize
```

### List Preservation

```markdown
## Features

- Feature 1
- Feature 2
  - Sub-feature 2.1
  - Sub-feature 2.2
- Feature 3

→ Entire list kept together
```

### Table Preservation

```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| A        | B        | C        |
| D        | E        | F        |

→ Complete table in one chunk
```

## API Reference

### MarkdownIndexer

#### `indexMarkdown(repositoryId, markdown, options)`

Index raw markdown content into GraphRAG.

**Parameters:**
- `repositoryId` (string) - Unique identifier for the repository
- `markdown` (string) - Raw markdown content (any size)
- `options` (object):
  - `source` (string) - Source identifier ('context7', 'deepwiki', 'github', etc.)
  - `url` (string, optional) - URL where markdown was fetched
  - `metadata` (object, optional) - Custom metadata to store
  - `chunkOptions` (object, optional) - Chunking configuration
  - `skipEmbeddings` (boolean, optional) - Skip embedding generation

**Returns:** `Promise<IndexResult>`
- `repositoryId` - Repository identifier
- `chunksCreated` - Number of chunks
- `entitiesExtracted` - Number of entities found
- `relationshipsExtracted` - Number of relationships found
- `entityEmbeddings` - Number of entity embeddings generated
- `edgeEmbeddings` - Number of edge embeddings generated
- `indexedAt` - Timestamp
- `processingTimeMs` - Processing time in milliseconds

#### `isIndexed(repositoryId)`

Check if a repository is already indexed.

**Returns:** `Promise<boolean>`

#### `getStats(repositoryId)`

Get statistics for a repository.

**Returns:** `Promise<{ nodes, edges, chunks, embeddings }>`

#### `deleteRepository(repositoryId)`

Delete all data for a repository.

**Returns:** `Promise<void>`

### MarkdownChunker

#### `chunk(markdown)`

Split markdown into intelligent chunks.

**Parameters:**
- `markdown` (string) - Raw markdown content

**Returns:** `MarkdownChunk[]`
- Each chunk includes:
  - `content` - Chunk text
  - `headingContext` - Heading hierarchy
  - `metadata` - Position, flags (hasCodeBlock, hasTable)

## Testing

Run the test suite:

```bash
# Unit tests for markdown-chunker
npm test -- tests/utils/markdown-chunker.test.ts

# Unit tests for MarkdownIndexer
npm test -- tests/lib/markdown-indexer.test.ts

# All markdown ingestion tests
npm test -- tests/**/*markdown*.test.ts
```

## Examples

Run the example script:

```bash
npm run examples:markdown
```

This demonstrates:
1. Small markdown indexing
2. Large markdown (110k tokens)
3. Repository management
4. Legilimens integration simulation

## Troubleshooting

### Issue: "Out of memory" with large markdown

**Solution:** Increase Node.js memory limit:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run examples:markdown
```

### Issue: Slow processing

**Causes:**
- LLM model too large (use smaller model for extraction)
- Chunk size too small (increase to 800-1200)
- Embedding provider not initialized

**Solutions:**
```typescript
// Use faster model
const llmModel = createLanguageModel({
  provider: 'llamacpp',
  llamacppModelPath: './models/granite-4.0-micro.gguf' // Balanced performance
});

// Larger chunks
chunkOptions: { chunkSize: 1000 }
```

### Issue: Embeddings failing

**Check:**
1. Embedding provider initialized: `await embeddingProvider.initialize()`
2. sqlite-vec extension loaded
3. Sufficient disk space for embeddings table

## Related Documentation

- **Architecture:** `docs/EMBEDDING-ARCHITECTURE.md` - Hybrid symbolic + embedding approach
- **Hybrid Search:** `docs/DYNAMIC-HYBRID-SEARCH-INTEGRATION.md` - 4-way hybrid search
- **Entity Embeddings:** `docs/EDGE_EMBEDDER_USAGE.md` - Edge embedding details
- **Phase 4 Planning:** `docs/planning/PHASE-4-INTEGRATION-PLAN.md` - Legilimens integration

## Implementation Files

**Core Components:**
- `src/utils/markdown-chunker.ts` (422 lines) - Smart markdown chunking
- `src/lib/markdown-indexer.ts` (303 lines) - Main indexer

**Tests:**
- `tests/utils/markdown-chunker.test.ts` (437 lines) - 30+ tests
- `tests/lib/markdown-indexer.test.ts` (363 lines) - 25+ tests

**Examples:**
- `examples/markdown-ingestion.ts` (345 lines) - Complete examples

## Future Enhancements

Potential improvements for Phase 5+:

1. **Streaming Ingestion**
   - Process markdown in streams for very large documents
   - Real-time progress updates

2. **Incremental Updates**
   - Detect changes and update only modified sections
   - Version tracking for markdown content

3. **Markdown Variants**
   - GitHub-flavored markdown
   - CommonMark strict mode
   - Custom markdown extensions

4. **Performance**
   - Parallel chunk processing
   - GPU acceleration for embeddings
   - Caching for repeated content

---

**Last Updated:** October 29, 2025
**Status:** Production-Ready ✅