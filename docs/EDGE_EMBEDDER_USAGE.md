# EdgeEmbedder Usage Guide

## Overview

The `EdgeEmbedder` class generates embeddings for graph relationships (edges) with full context from both source and target nodes.

## Edge Format

Edges are formatted as: `"S <predicate> O :: context:..."`

Example:
```
api_gateway <routes_to> auth_module :: context: API Gateway (service) routes to AuthModule (class), strong relationship
```

## Basic Usage

```typescript
import { EdgeEmbedder } from './lib/edge-embedder.js';
import { EmbeddingManager, GraniteEmbeddingProvider } from './lib/embedding-manager.js';
import { GraphDatabaseConnection } from './lib/graph-database.js';
import { Logger } from './lib/logger.js';

// Initialize dependencies
const logger = new Logger('EdgeEmbedder');
const db = new GraphDatabaseConnection('.graphrag/database.sqlite');

// Create embedding provider
const embeddingProvider = new GraniteEmbeddingProvider(logger);
await embeddingProvider.initialize();

const embeddingManager = new EmbeddingManager(embeddingProvider, logger);

// Create EdgeEmbedder
const edgeEmbedder = new EdgeEmbedder(db, embeddingManager, logger);

// Generate embeddings for a repository
const count = await edgeEmbedder.generateEdgeEmbeddings('my-repo');
console.log(`Generated ${count} edge embeddings`);
```

## Features

### 1. Batch Processing
- Processes edges in batches of 100
- Efficient memory usage
- Progress logging every 10 batches

### 2. Cross-Repository Support
- Handles edges where source and target are in different repos
- Annotates cross-repo edges in context
- Queries both source_repo and target_repo

### 3. Rich Context
- Includes entity types (class, function, service, etc.)
- Includes descriptions when available
- Marks strong relationships (weight > 0.5)
- Preserves full relationship semantics

### 4. Error Handling
- Individual edge failures don't stop batch processing
- Transaction safety for atomicity
- Detailed logging at all levels

## Database Schema

Embeddings are stored in the `embeddings` virtual table:

```sql
CREATE VIRTUAL TABLE embeddings USING vec0(
  chunk_id TEXT PRIMARY KEY,      -- Format: "{repo}::edge::{source}::{relationship}::{target}"
  repo TEXT,                       -- Source repository
  entity_id TEXT,                  -- Empty for edges
  chunk_type TEXT,                 -- Always 'edge'
  content TEXT,                    -- Formatted edge text
  embedding FLOAT[768],            -- Vector embedding
  metadata TEXT                    -- JSON with source, target, relationship, etc.
);
```

## Example Metadata

```json
{
  "source": "ApiGateway",
  "target": "AuthModule",
  "relationship": "routes_to",
  "weight": 0.8,
  "source_repo": "backend-api",
  "target_repo": "backend-api"
}
```

## Performance

- **Batch size**: 100 edges per batch
- **Embedding dimension**: 768 (Granite Embedding)
- **Transaction safety**: Yes (rollback on failure)
- **Memory efficient**: Processes in batches

## Integration with Hybrid Search

Edge embeddings enable relationship-aware semantic search:

1. **Dense search**: Find semantically similar relationships
2. **Graph traversal**: Navigate related edges
3. **Cross-repo discovery**: Find connections between repositories
4. **Relationship patterns**: Identify common interaction patterns

## Next Steps

After generating edge embeddings:

1. Use in semantic search queries
2. Implement relationship similarity search
3. Build edge recommendation system
4. Analyze relationship patterns
