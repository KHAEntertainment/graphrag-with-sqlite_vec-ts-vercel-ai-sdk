# Hybrid Architecture Proposal: Semantic + Relationship

## Current State

**Existing System:** Pure symbolic GraphRAG
- ✅ Graph structure (entities + relationships)
- ✅ Centrality analysis
- ❌ NO vector embeddings
- ❌ NO semantic similarity search

**Database:** Regular SQLite (not sqlite-vec)

## Proposed Enhancement: Hybrid System

### Why Hybrid for Coding Assistant?

Your use case (dependency knowledge during coding) needs BOTH:

1. **Relationship Queries** (Graph)
   - "What depends on this module?"
   - "Show me the dependency chain"
   - "Which components are most central?"

2. **Semantic Queries** (Embeddings)
   - "Find similar functions"
   - "What code does something like X?"
   - "Search by natural language description"

3. **Hybrid Queries** (Both!)
   - "Find similar functions that use dependency X"
   - "What related code handles similar patterns?"
   - "Show me semantically similar implementations of this interface"

## Architecture Design

### Database Schema Addition

```sql
-- Existing tables (keep as-is)
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  properties TEXT
);

CREATE TABLE edges (
  source TEXT,
  target TEXT,
  relationship TEXT,
  weight REAL
);

-- NEW: Embeddings table with sqlite-vec
CREATE VIRTUAL TABLE embeddings USING vec0(
  chunk_id TEXT PRIMARY KEY,
  embedding FLOAT[1536],  -- text-embedding-3-small dimension
  content TEXT,
  metadata TEXT
);

-- NEW: Link chunks to graph entities
CREATE TABLE chunk_entities (
  chunk_id TEXT,
  entity_id TEXT,
  relevance REAL,
  FOREIGN KEY (chunk_id) REFERENCES embeddings(chunk_id),
  FOREIGN KEY (entity_id) REFERENCES nodes(id)
);
```

### Enhanced Document Processing Flow

```typescript
async function indexDocument(document: string) {
  // 1. Chunk the document
  const chunks = splitDocument(document);

  for (const chunk of chunks) {
    // 2. Generate embedding (semantic)
    const embedding = await generateEmbedding(chunk);
    await db.insertEmbedding(chunk.id, embedding, chunk.text);

    // 3. Extract entities & relationships (symbolic)
    const extracted = await extractEntities(chunk);
    await graphManager.buildGraph([extracted]);

    // 4. Link chunks to entities
    for (const entity of extracted.entities) {
      await db.linkChunkToEntity(chunk.id, entity.id);
    }
  }
}
```

### Three Query Modes

#### Mode 1: Pure Semantic (Fast, Broad)
```typescript
async function semanticQuery(query: string): Promise<Chunk[]> {
  const queryEmbedding = await generateEmbedding(query);

  return db.vectorSearch(
    queryEmbedding,
    topK: 10,
    threshold: 0.7
  );
}
```

#### Mode 2: Pure Graph (Precise, Structured)
```typescript
async function graphQuery(query: string): Promise<Answer> {
  const centrality = graphManager.calculateCentralityMeasures();
  const entities = identifyRelevantEntities(query, centrality);

  return {
    entities,
    relationships: graphManager.getRelationships(entities),
    centrality
  };
}
```

#### Mode 3: Hybrid (Best of Both)
```typescript
async function hybridQuery(query: string): Promise<Answer> {
  // Step 1: Semantic retrieval
  const queryEmbedding = await generateEmbedding(query);
  const semanticChunks = await db.vectorSearch(queryEmbedding, topK: 20);

  // Step 2: Get related entities from chunks
  const entities = await db.getEntitiesForChunks(
    semanticChunks.map(c => c.id)
  );

  // Step 3: Graph expansion
  const expandedGraph = graphManager.expandFromEntities(entities, depth: 2);

  // Step 4: Re-rank by centrality + semantic score
  const ranked = rankResults(semanticChunks, expandedGraph);

  // Step 5: Generate answer with both contexts
  return await generateAnswer(query, ranked, expandedGraph);
}
```

## Implementation Plan

### Phase 1: Add Embedding Layer (Week 1)

**Files to Create:**
- `src/lib/embedding-manager.ts` - Handles embedding generation and vector search
- `src/types/embedding.ts` - Types for embeddings and vector operations
- `src/providers/embedding-provider.ts` - Abstract embedding generation

**Files to Modify:**
- `src/lib/graph-database.ts` - Add sqlite-vec tables and queries
- `src/lib/document-processor.ts` - Add embedding generation step
- `package.json` - Add sqlite-vec dependency

**Dependencies:**
```json
{
  "dependencies": {
    "sqlite-vec": "^0.1.0",  // Vector extension for SQLite
    "@xenova/transformers": "^2.0.0"  // Optional: local embeddings
  }
}
```

### Phase 2: Implement Hybrid Queries (Week 2)

**Files to Create:**
- `src/lib/hybrid-query-handler.ts` - Combines semantic + graph
- `src/lib/retrieval-strategy.ts` - Configurable retrieval modes

**Retrieval Strategies:**
```typescript
type RetrievalMode = 'semantic' | 'graph' | 'hybrid';

interface RetrievalConfig {
  mode: RetrievalMode;
  semanticWeight?: number;  // 0.0 - 1.0
  graphWeight?: number;     // 0.0 - 1.0
  maxResults?: number;
}
```

### Phase 3: Optimize for Coding Use Cases (Week 3)

**Coding-Specific Features:**
- Entity types: `function`, `class`, `module`, `dependency`
- Relationship types: `imports`, `calls`, `extends`, `implements`
- Custom centrality for code (PageRank weighted by usage)
- Syntax-aware chunking for code files

## Example Queries for Your TUI

### Query 1: "Find similar error handling patterns"
```
Semantic: Vector search for "error handling"
↓
Graph: Expand to related functions/modules
↓
Result: Similar patterns + their dependencies
```

### Query 2: "What uses the logger module?"
```
Graph: Find edges where target = "logger"
↓
Semantic: Find semantically similar usage patterns
↓
Result: Direct dependencies + similar implementations
```

### Query 3: "Refactor authentication - show related code"
```
Graph: Find "authentication" entity + neighbors
↓
Semantic: Find chunks similar to those entities
↓
Result: All auth-related code with context
```

## Configuration Strategy

### Environment Variables
```bash
# Embedding Provider
EMBEDDING_PROVIDER=openai
# or
EMBEDDING_PROVIDER=local  # Use Xenova transformers

# Embedding Model
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
# or
LOCAL_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2

# Query Mode
RETRIEVAL_MODE=hybrid  # semantic | graph | hybrid

# Hybrid Weights
SEMANTIC_WEIGHT=0.6
GRAPH_WEIGHT=0.4
```

### Per-Query Configuration
```typescript
// User can override per query in TUI
const result = await queryHandler.ask({
  query: "Find similar functions",
  mode: 'semantic',  // Override default
  maxResults: 5
});
```

## Cost & Performance Considerations

### Embeddings Cost

**OpenAI text-embedding-3-small:**
- $0.02 per 1M tokens
- ~750 tokens per chunk (600 chars)
- 1000 chunks = ~$0.015

**Local Embeddings (Free):**
- Xenova/transformers (runs in Node.js)
- Slower but no API costs
- Good for development/testing

### Performance Comparison

| Operation | Pure Graph | Pure Semantic | Hybrid |
|-----------|-----------|---------------|--------|
| Indexing | 2s/doc | 1s/doc | 3s/doc |
| Query | <100ms | <50ms | <200ms |
| Accuracy | High (structured) | High (fuzzy) | Highest |

### Storage

- **Graph only**: ~1KB per entity, ~500B per edge
- **Embeddings**: ~6KB per chunk (1536 floats)
- **1000 documents**: ~10MB graph + ~60MB embeddings = ~70MB total

## Migration Path

### Step 1: Add Embeddings (Non-Breaking)
Keep existing graph system, add embeddings alongside.

```typescript
// Old code still works
const answer = await queryHandler.askQuestion(query);

// New hybrid option available
const hybridAnswer = await hybridQueryHandler.ask(query);
```

### Step 2: Test Both Approaches
Compare quality and performance for your use cases.

### Step 3: Make Hybrid Default (If Better)
Switch default but keep both available.

## Open Questions

1. **Which embedding model?**
   - OpenAI (fast, accurate, costs $$)
   - Local transformers (free, slower, good enough?)

2. **Chunking strategy for code?**
   - Function-level chunks?
   - File-level with overlaps?
   - AST-aware splitting?

3. **Graph entity granularity?**
   - File-level entities?
   - Function/class-level?
   - Variable/import-level?

4. **Default retrieval mode?**
   - Start with hybrid?
   - Let user choose in TUI?
   - Auto-detect based on query?

## Next Steps

1. **Decide on embedding provider** (OpenAI vs local)
2. **Design TUI interface** (how to expose modes?)
3. **Implement Phase 1** (add embeddings)
4. **Test with real codebase** (evaluate quality)
5. **Iterate based on results**

---

**Status:** Proposal - Pending Approval
**Complexity:** Medium (2-3 weeks)
**Benefits:** High (enables semantic + structural queries)
**Risk:** Low (non-breaking addition)
