# Embedding Integration Guide

## Overview

This guide shows how to use the embedding functionality alongside the knowledge graph for semantic search capabilities.

## Installation

The embedding functionality requires `@xenova/transformers`:

```bash
npm install @xenova/transformers
```

This is already included in `package.json` if you installed all dependencies.

## Available Embedding Models

### 1. Granite Embedding 125M (Recommended for Code)

**Model:** `ibm-granite/granite-embedding-125m-english`

**Best for:**
- Code and technical documentation
- Your coding assistant use case
- Works well with Granite 4.0 Micro for KG extraction

**Specs:**
- 125M parameters
- 768 dimensions
- Optimized for code/technical content

```typescript
import { GraniteEmbeddingProvider, EmbeddingManager } from './src/lib/embedding-manager.js';
import { Logger } from './src/lib/logger.js';

const logger = new Logger('EmbeddingExample');
const provider = new GraniteEmbeddingProvider(logger);
await provider.initialize();

const manager = new EmbeddingManager(provider, logger);
const embedding = await provider.embed("function hello() { return 'world'; }");
```

### 2. Nomic Embed Text v1.5 (General Purpose)

**Model:** `nomic-ai/nomic-embed-text-v1.5`

**Best for:**
- General text and mixed content
- High-quality embeddings
- Good balance of size/performance

**Specs:**
- 137M parameters
- 768 dimensions

```typescript
import { NomicEmbeddingProvider } from './src/lib/embedding-manager.js';

const provider = new NomicEmbeddingProvider(logger);
await provider.initialize();
const embedding = await provider.embed("Your text here");
```

### 3. BGE Small EN v1.5 (Lightweight)

**Model:** `BAAI/bge-small-en-v1.5`

**Best for:**
- Resource-constrained environments
- Fast inference needed
- Smaller embeddings acceptable

**Specs:**
- 33M parameters
- 384 dimensions

```typescript
import { BGEEmbeddingProvider } from './src/lib/embedding-manager.js';

const provider = new BGEEmbeddingProvider(logger);
await provider.initialize();
const embedding = await provider.embed("Lightweight text");
```

## Basic Usage

### Generate Single Embedding

```typescript
import { GraniteEmbeddingProvider, EmbeddingManager } from './src/lib/embedding-manager.js';
import { Logger } from './src/lib/logger.js';

const logger = new Logger('App');
const provider = new GraniteEmbeddingProvider(logger);
await provider.initialize();

const text = "function calculateTotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }";
const embedding = await provider.embed(text);

console.log(`Embedding dimensions: ${embedding.length}`);
console.log(`First 5 values: ${embedding.slice(0, 5)}`);
```

### Generate Batch Embeddings

```typescript
const manager = new EmbeddingManager(provider, logger);

const chunks = [
  { id: 'chunk-1', content: 'import React from "react";' },
  { id: 'chunk-2', content: 'export function App() { return <div>Hello</div>; }' },
  { id: 'chunk-3', content: 'import { useState } from "react";' },
];

const embeddedChunks = await manager.embedChunks(chunks);
```

### Calculate Similarity

```typescript
const embedding1 = await provider.embed("function add(a, b) { return a + b; }");
const embedding2 = await provider.embed("function sum(x, y) { return x + y; }");

const similarity = manager.cosineSimilarity(embedding1, embedding2);
console.log(`Similarity: ${similarity.toFixed(4)}`); // High similarity expected
```

## Semantic Search Example

```typescript
// Build a searchable codebase
const codeSnippets = [
  { id: '1', content: 'function add(a, b) { return a + b; }' },
  { id: '2', content: 'function multiply(x, y) { return x * y; }' },
  { id: '3', content: 'class Calculator { constructor() {} }' },
  { id: '4', content: 'import express from "express";' },
];

// Generate embeddings for all snippets
const embeddedCodebase = await manager.embedChunks(codeSnippets);

// Search query
const query = "function subtract(x, y) { return x - y; }";
const queryEmbedding = await provider.embed(query);

// Find similar code
const results = embeddedCodebase
  .map(chunk => ({
    ...chunk,
    similarity: manager.cosineSimilarity(queryEmbedding, chunk.embedding!)
  }))
  .sort((a, b) => b.similarity - a.similarity)
  .slice(0, 5);

console.log('Top 5 similar code snippets:');
results.forEach((result, idx) => {
  console.log(`${idx + 1}. Similarity: ${result.similarity.toFixed(4)}`);
  console.log(`   ${result.content}\n`);
});
```

## Integration with Knowledge Graph

### Hybrid Approach: Semantic + Graph

The power comes from combining embeddings (semantic search) with the knowledge graph (relationship discovery).

```typescript
import { createLanguageModel } from './src/providers/factory.js';
import { GraphManager } from './src/lib/graph-manager.js';
import { DocumentProcessor } from './src/lib/document-processor.js';

// 1. Setup both systems
const embeddingProvider = new GraniteEmbeddingProvider(logger);
await embeddingProvider.initialize();
const embeddingManager = new EmbeddingManager(embeddingProvider, logger);

// Your existing LLM (Phi-4 or Granite 4.0 Micro)
const llmModel = createLanguageModel(llmConfig);
const documentProcessor = new DocumentProcessor(llmModel, logger);
const graphManager = new GraphManager(dbConnection, logger);

// 2. Process document with BOTH approaches
const document = "Your code or documentation here";

// Split into chunks
const chunks = documentProcessor.splitDocuments([document]);

// Generate embeddings (semantic layer)
const embeddingChunks = chunks.map((content, idx) => ({
  id: `chunk-${idx}`,
  content
}));
const embeddedChunks = await embeddingManager.embedChunks(embeddingChunks);

// Extract entities/relationships (graph layer)
const elements = await documentProcessor.extractElements(chunks);
const summaries = await documentProcessor.summarizeElements(elements);
graphManager.buildGraph(summaries);

// 3. Hybrid query
const query = "How does authentication work?";
const queryEmbedding = await embeddingProvider.embed(query);

// Semantic: Find similar chunks
const semanticResults = embeddedChunks
  .map(chunk => ({
    ...chunk,
    similarity: embeddingManager.cosineSimilarity(queryEmbedding, chunk.embedding!)
  }))
  .filter(r => r.similarity > 0.7)
  .sort((a, b) => b.similarity - a.similarity)
  .slice(0, 5);

// Graph: Get entity relationships
const centrality = graphManager.calculateCentralityMeasures();

// Combine both for answer
console.log('Semantic results:', semanticResults.length, 'chunks');
console.log('Top entities:', centrality.degree.slice(0, 3));
```

## Using with Your CLI Utility

Since your CLI already uses Phi-4 Mini or Granite 4.0 Micro, you can integrate like this:

```typescript
// Your CLI's existing LLM
import { yourExistingLLM } from './your-cli-models.js';

// Add embedding capability
const embeddingProvider = new GraniteEmbeddingProvider(logger);
await embeddingProvider.initialize();

// Use existing LLM for KG extraction
const documentProcessor = new DocumentProcessor(yourExistingLLM, logger);

// Use embeddings for semantic search
const embeddingManager = new EmbeddingManager(embeddingProvider, logger);

// Now you have both:
// - Semantic search via embeddings
// - Relationship discovery via your existing LLM
```

## Running Examples

The project includes comprehensive examples:

```bash
# Run all embedding examples
npm run examples:embedding
```

This will demonstrate:
1. Basic embedding generation
2. Batch processing
3. Model comparison (Granite vs Nomic vs BGE)
4. Semantic similarity search
5. Hybrid embeddings + knowledge graph
6. Factory pattern usage

## Configuration

Add to your `.env`:

```bash
# Embedding Model Selection
EMBEDDING_MODEL=granite  # or 'nomic' or 'bge'

# Optional: Cache embeddings to disk
EMBEDDING_CACHE_DIR=data/embeddings
```

## Performance Considerations

### Model Loading Time

First load downloads the model from Hugging Face:
- Granite 125M: ~500MB download, ~10-30 seconds first load
- Nomic: ~550MB download, ~10-30 seconds first load
- BGE Small: ~130MB download, ~5-15 seconds first load

Models are cached locally after first download.

### Inference Speed

On CPU (Apple M1/M2, modern Intel/AMD):
- Granite 125M: ~50-100ms per chunk
- Nomic: ~50-100ms per chunk
- BGE Small: ~20-50ms per chunk (faster, smaller model)

### Memory Usage

- Granite 125M: ~500MB RAM
- Nomic: ~550MB RAM
- BGE Small: ~150MB RAM

## Recommended Workflow for Your Use Case

**For coding assistant with dependency knowledge:**

1. **Use Granite Embedding 125M** for semantic search
   - Optimized for code
   - Good dimension/quality tradeoff

2. **Use your existing Phi-4/Granite 4.0 Micro** for KG extraction
   - Already in your CLI
   - Good at structured output

3. **Hybrid queries:**
   ```typescript
   // Find: "Similar error handling that uses logger dependency"

   // Step 1: Semantic search for "error handling"
   const semanticMatches = await semanticSearch(query);

   // Step 2: Graph filter for "uses logger"
   const graphFiltered = await graphManager.filterByDependency(
     semanticMatches,
     'logger'
   );

   // Result: Best of both worlds!
   ```

## Next Steps

1. **Test with your codebase:**
   ```bash
   npm run examples:embedding
   ```

2. **Integrate with your CLI:**
   - Add embedding generation to your document processing
   - Keep using Phi-4/Granite 4.0 for KG extraction
   - Implement hybrid query mode

3. **Optional: Add sqlite-vec for persistence**
   - Store embeddings in SQLite
   - Enable fast vector similarity search
   - See `docs/HYBRID-ARCHITECTURE-PROPOSAL.md` for full plan

## Troubleshooting

### "Model not found" error

Models download automatically on first use. Ensure internet connection and sufficient disk space.

### Slow first run

First model load includes download time. Subsequent runs are fast (models cached in `~/.cache/huggingface/`).

### Out of memory

Try BGE Small (only 150MB RAM) or reduce batch size.

### Different embedding dimensions

Each model produces different dimensions:
- Granite/Nomic: 768
- BGE Small: 384

Can't compare embeddings across different models.

## API Reference

See inline documentation in:
- `src/types/embedding.ts` - Type definitions
- `src/lib/embedding-manager.ts` - Full API with JSDoc comments
- `examples/embedding-integration.ts` - Complete working examples

---

**Ready to test?** Run: `npm run examples:embedding`
