# GraphRAG Architecture: Symbolic vs. Embedding Approach

## Overview

This GraphRAG implementation uses a **symbolic approach** rather than the traditional vector embedding approach for building and querying knowledge graphs. This document explains how it works, why it's different, and potential next steps.

## Key Insight: No Traditional Embeddings Required

Unlike typical RAG systems that rely on vector embeddings and cosine similarity for retrieval, this project builds a knowledge graph through **explicit entity and relationship extraction using LLMs**.

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

### What's NOT Implemented ❌

- [ ] Vector embeddings
- [ ] Semantic similarity search
- [ ] Betweenness centrality (noted as "not calculated" in SQLite)
- [ ] Closeness centrality (noted as "not calculated" in SQLite)
- [ ] Hybrid approach (combining embeddings + graph)

## Potential Next Steps

### Option 1: Keep Pure Symbolic Approach

**Benefits:**
- Simpler architecture
- Works well for relationship-heavy domains
- No need for vector databases

**Improvements:**
- Implement betweenness and closeness centrality
- Add graph visualization tools
- Optimize LLM prompts for better extraction
- Add entity deduplication/normalization

### Option 2: Add Embedding Layer (Hybrid)

**Benefits:**
- Combine semantic similarity with graph structure
- Better retrieval for diverse queries
- Redundancy if one approach fails

**Implementation:**
```typescript
interface HybridRetrieval {
  // Vector similarity for initial retrieval
  vectorSearch(query: string): Promise<Document[]>;

  // Graph traversal for related entities
  graphExpansion(entities: string[]): Promise<Graph>;

  // Combine both approaches
  hybridQuery(query: string): Promise<Answer>;
}
```

### Option 3: Enhanced Graph Analysis

**Add advanced graph algorithms:**
- Community detection (find topic clusters)
- PageRank (importance scoring)
- Path finding (entity connections)
- Temporal analysis (track knowledge evolution)

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

## Next Session TODOs

- [ ] Test with a local llama.cpp model
- [ ] Evaluate entity extraction quality
- [ ] Decide on embedding integration (yes/no)
- [ ] Consider implementing missing centrality measures
- [ ] Profile performance with larger documents
- [ ] Design TUI interface for graph exploration

## Questions to Answer

1. **Do we need embeddings for your use case?**
   - What types of queries do you expect?
   - Is relationship discovery or semantic search more important?

2. **Should we optimize for accuracy or cost?**
   - Use GPT-4 for indexing, llama.cpp for queries?
   - Or llama.cpp for everything?

3. **Database scaling needs?**
   - How many documents?
   - How complex are relationships?
   - Do we need real-time updates?

---

**Last Updated:** 2025-10-27
**Author:** Claude Code Conversion
**Status:** TypeScript conversion complete, ready for testing
