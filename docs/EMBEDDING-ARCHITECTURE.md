# GraphRAG Architecture: Symbolic vs. Embedding Approach

**Status:** ✅ Hybrid Approach Implemented (Phase 3 Complete - October 28, 2025)

## Overview

This GraphRAG implementation has evolved from a **pure symbolic approach** to a **hybrid symbolic + embedding approach** that combines the best of both worlds. This document explains the architecture, implementation status, and how the two approaches work together.

## Key Insight: Hybrid Approach

This project builds a knowledge graph through **explicit entity and relationship extraction using LLMs** AND now leverages **vector embeddings** for semantic similarity search. The combination provides:
- **Symbolic reasoning** - Explicit graph relationships
- **Semantic search** - Dense vector similarity via sqlite-vec
- **Keyword search** - Sparse BM25 via FTS5
- **Pattern matching** - Fuzzy/trigram matching

See `DYNAMIC-HYBRID-SEARCH-INTEGRATION.md` for complete hybrid search architecture.

## How It Works

### 1. Document Processing Pipeline

**Step 1: Chunk Documents**
```typescript
// Split documents into overlapping chunks
const chunks = documentProcessor.splitDocuments(documents, 600, 100);
```

**Step 2: Extract Entities and Relationships**
```typescript
// Use LLM to extract structured information from each chunk
const { text } = await generateText({
  model: llmModel,
  system: `Extract entities, relationships, and their strength...
           Format: Entity1 -> Relationship -> Entity2 [strength: X.X]`,
  prompt: chunk
});
```

**Step 3: Summarize Extracted Elements**
```typescript
// Consolidate and structure the extracted information
const { text } = await generateText({
  model: llmModel,
  system: `Summarize entities and relationships in structured format...`,
  prompt: extractedElements
});
```

### 2. Graph Construction

The system parses the LLM output and builds a graph in SQLite:

- **Nodes**: Entities mentioned in the documents
- **Edges**: Relationships between entities with weights (0.0 - 1.0)

```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  properties TEXT
);

CREATE TABLE edges (
  source TEXT,
  target TEXT,
  relationship TEXT,
  weight REAL,
  PRIMARY KEY (source, target, relationship)
);
```

### 3. Query Answering

Instead of semantic similarity search, the system uses **graph centrality measures**:

- **Degree Centrality**: Most connected entities (key topics)
- **Betweenness Centrality**: Entities that bridge different concepts
- **Closeness Centrality**: Entities well-connected to all others

The centrality data is then passed to an LLM to generate natural language answers:

```typescript
const centralityData = graphManager.calculateCentralityMeasures();
const centralitySummary = graphManager.summarizeCentralityMeasures(centralityData);

const { text } = await generateText({
  model: llmModel,
  system: 'Use the centrality measures to answer the query.',
  prompt: `Query: ${query}\nCentrality Summary: ${centralitySummary}`
});
```

## Comparison: Symbolic vs. Embedding Approach

### Traditional RAG (Embedding-Based)

```
Documents → Embeddings → Vector DB → Cosine Similarity → Retrieval → LLM Answer
```

**Pros:**
- Fast similarity search with vector databases
- Captures semantic meaning implicitly
- Lower LLM API costs (one embedding per chunk)

**Cons:**
- Relationships between entities are implicit
- Less interpretable (why was this retrieved?)
- May miss important connections

### This GraphRAG (Symbolic)

```
Documents → LLM Extraction → Graph DB → Centrality Analysis → LLM Answer
```

**Pros:**
- Explicit relationships between entities
- Interpretable graph structure
- Can leverage graph algorithms for analysis
- Better for relationship-heavy domains

**Cons:**
- More LLM API calls during indexing (2x per chunk)
- Slower indexing process
- Depends on LLM's ability to extract accurate relationships

## Current Implementation Status

### What's Implemented ✅

- [x] Document chunking with overlap
- [x] LLM-based entity and relationship extraction
- [x] SQLite graph database storage
- [x] Degree centrality calculation
- [x] LLM-based query answering using centrality
- [x] Multi-provider support (OpenAI, llama.cpp)
- [x] TypeScript with full type safety
- [x] **Vector embeddings (Phase 3 Complete)**
- [x] **Entity embeddings** - Format: `"name :: kind :: hints"`
- [x] **Edge embeddings** - Format: `"S <predicate> O :: context"`
- [x] **sqlite-vec integration** - Vector similarity search
- [x] **4-way hybrid search** - Dense + Sparse + Pattern + Graph
- [x] **Dynamic query analysis** - LLM-based strategy weighting
- [x] **Reciprocal Rank Fusion** - Multi-strategy result combining

### What's NOT Implemented ❌

- [ ] Betweenness centrality (could be calculated but currently not used)
- [ ] Closeness centrality (could be calculated but currently not used)
- [ ] Advanced graph algorithms (community detection, PageRank)
- [ ] Temporal analysis (git history integration)

## Potential Next Steps (Phase 4+)

### ✅ Completed: Hybrid Approach (Phase 3)

The hybrid approach combining embeddings + graph is now fully implemented. See:
- `src/lib/entity-embedder.ts` - Entity embedding generation
- `src/lib/edge-embedder.ts` - Edge embedding generation
- `src/lib/repository-indexer.ts` - Complete indexing pipeline
- `src/mcp/tools/hybrid-search.ts` - 4-way hybrid search
- `DYNAMIC-HYBRID-SEARCH-INTEGRATION.md` - Architecture details

### Option 1: Legilimens CLI Integration (Phase 4 - Planned)

**Automatic Documentation Indexing:**
- GraphRAG as workspace package in Legilimens monorepo
- Automatic indexing during `legilimens generate`
- CLI commands for GraphRAG management
- Agent instruction file generation

See: `docs/planning/PHASE-4-INTEGRATION-PLAN.md`

### Option 2: Enhanced Graph Analysis (Future)

**Add advanced graph algorithms:**
- Community detection (find topic clusters)
- PageRank (importance scoring)
- Path finding (shortest paths between entities)
- Temporal analysis (track knowledge evolution via git history)

### Option 3: Performance Optimization (Future)

**Scalability improvements:**
- Parallel file processing with worker threads
- Incremental indexing with change detection
- Batch embedding API integration
- Memory optimization for large repositories

## Testing Recommendations

### 1. Verify Entity Extraction Quality

```bash
# Run with small dataset first
npm run dev

# Check extracted entities in logs
# Review data/cache/initial_elements_data.json
```

### 2. Evaluate Centrality Calculations

```sql
-- Check top entities by degree
SELECT id,
       (SELECT COUNT(*) FROM edges WHERE source = nodes.id) +
       (SELECT COUNT(*) FROM edges WHERE target = nodes.id) as degree
FROM nodes
ORDER BY degree DESC
LIMIT 10;
```

### 3. Test Query Quality

```typescript
// Try different query types
queries = [
  "What are the main themes?",              // Topic extraction
  "How are X and Y related?",               // Relationship query
  "What is the most important concept?",    // Centrality-based
];
```

## Architecture Decisions for Your TUI

### Question 1: Keep Symbolic-Only or Add Embeddings?

**Consider:**
- What type of queries will users ask?
- Is relationship structure more important than semantic similarity?
- What's your LLM budget (API costs)?

### Question 2: Which LLM Provider for Production?

**llama.cpp (Local):**
- ✅ No API costs
- ✅ Privacy
- ✅ Offline capability
- ❌ Slower
- ❌ Model quality varies

**OpenAI:**
- ✅ High quality extraction
- ✅ Fast
- ❌ API costs
- ❌ Requires internet

**Recommendation:** Use OpenAI for indexing (accuracy), llama.cpp for queries (cost).

### Question 3: Database Considerations

**Current SQLite:**
- ✅ Simple, portable
- ✅ Good for small-medium graphs (<100k nodes)
- ❌ Limited graph algorithm support

**Future Options:**
- Neo4j: Native graph database
- PostgreSQL + pgvector: Hybrid graph + embeddings
- Redis Graph: Fast in-memory graphs

## References

### Code Locations

**Entity Extraction:**
- `src/lib/document-processor.ts:48-64` - extractElements()

**Graph Building:**
- `src/lib/graph-manager.ts:21-99` - buildGraph()

**Centrality Calculation:**
- `src/lib/graph-manager.ts:111-143` - calculateCentralityMeasures()

**Query Handling:**
- `src/lib/query-handler.ts:18-33` - askQuestion()

### Original Python Implementation

The TypeScript version maintains 1:1 feature parity with the Python implementation:
- `document_processor.py` → `document-processor.ts`
- `graph_manager.py` → `graph-manager.ts`
- `query_handler.py` → `query-handler.ts`

No embeddings were used in the original Python version, and none are used in the TypeScript conversion.

## Implementation Files

### Core Components

**Entity & Edge Embedding:**
- `src/lib/entity-embedder.ts` (277 lines) - Entity embedding generation
- `src/lib/edge-embedder.ts` (364 lines) - Edge embedding generation
- `src/lib/repository-indexer.ts` (641 lines) - Complete indexing pipeline

**Hybrid Search:**
- `src/mcp/tools/hybrid-search.ts` - Unified 4-way hybrid search
- `src/mcp/tools/query-engine.ts` - Individual search strategies
- `src/lib/query-analyzer.ts` - LLM-based query classification
- `src/lib/reciprocal-rank-fusion.ts` - RRF fusion algorithm

**Database:**
- `src/lib/graph-database.ts` - SQLite connection with sqlite-vec

**Tests:**
- `tests/lib/entity-embedder.test.ts` (13 tests)
- `tests/lib/edge-embedder.test.ts` (17 tests)
- `tests/lib/repository-indexer.test.ts` (20 tests)
- `tests/integration/embedding-generation-e2e.test.ts` (21 tests)

---

**Last Updated:** October 29, 2025
**Status:** Phase 1-3 Complete ✅ | Phase 4 Planned 🔮

See `docs/SQLITE-VEC-STATUS-CURRENT.md` for current project status.
