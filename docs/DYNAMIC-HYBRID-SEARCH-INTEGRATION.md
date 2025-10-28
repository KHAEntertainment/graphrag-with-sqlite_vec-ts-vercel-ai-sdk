# Dynamic Hybrid Search Integration for GraphRAG

## Overview

This document analyzes integrating **dynamic hybrid search with LLM-weighted fusion** into our GraphRAG system. This methodology dramatically improves retrieval accuracy by combining multiple search strategies and letting an LLM dynamically determine the optimal weighting based on query characteristics.

## Why This Matters for Code Retrieval

### The Problem with Pure Semantic Search

**Example: Searching for `StreamingTextResponse`**

1. **Semantic search alone:**
   - User query: "streaming text response"
   - May match: "text streaming API", "response streaming handler", "async text output"
   - **Might miss**: The exact class `StreamingTextResponse`
   - **Reason**: Embedding models see these as conceptually similar

2. **Why exact matching matters for code:**
   - Class names: `StreamingTextResponse` vs `TextStreamResponse` (different APIs)
   - Function names: `useChat` vs `use_chat` vs `useChatHook`
   - Variable names: `apiKey` vs `api_key` vs `API_KEY`
   - Import paths: `@ai-sdk/openai` vs `ai/openai` vs `openai-ai-sdk`

### Current vs Enhanced Architecture

**Current (Planned):**
```text
Query → Semantic Search (embeddings) → Results
      → Graph Search (relationships) → Results
      → Merge → Attendant Filter → Response
```

**Enhanced (Dynamic Hybrid):**
```text
Query → LLM Analyzer (determine query type)
      ↓
      Weights: [dense: 0.3, sparse: 0.4, pattern: 0.2, graph: 0.1]
      ↓
      ┌─────────────────┬─────────────────┬─────────────────┬──────────────┐
      │ Dense (0.3)     │ Sparse (0.4)    │ Pattern (0.2)   │ Graph (0.1)  │
      │ Embeddings      │ BM25/FTS5       │ Trigram/Fuzzy   │ Relationships│
      └─────────────────┴─────────────────┴─────────────────┴──────────────┘
      ↓
      Reciprocal Rank Fusion (RRF)
      ↓
      Attendant Filter → Response
```

## Four-Dimensional Hybrid Search

### 1. Dense Retrieval (Semantic)

**What:** Vector embeddings capturing conceptual meaning

**Implementation:** sqlite-vec with Granite Embedding 125M (768 dimensions)

**Strengths:**
- Understanding synonyms ("car" = "automobile")
- Conceptual queries ("how to stream responses")
- Cross-lingual understanding

**Weaknesses:**
- Poor at exact codes/identifiers
- Struggles with out-of-vocabulary terms
- Can conflate similar but distinct concepts

**Example Query:** "How do I handle streaming in AI applications?"
- **Weight:** High (0.6-0.8)
- **Reason:** Conceptual question, benefits from semantic understanding

### 2. Sparse Retrieval (Keyword/Lexical)

**What:** Token-based keyword matching with BM25 ranking

**Implementation Options:**

### Option A: SQLite FTS5 (Built-in)
```sql
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  chunk_id,
  content,
  tokenize='porter unicode61'
);

-- Query
SELECT chunk_id, bm25(chunks_fts) as score
FROM chunks_fts
WHERE content MATCH 'StreamingTextResponse'
ORDER BY score
LIMIT 20;
```

### Option B: Learned Sparse Embeddings (Pine Cone SPLADE)
- More sophisticated than traditional BM25
- Provides semantic expansion (learns that "car" relates to "vehicle")
- Still keyword-focused but with learned weighting

**Strengths:**
- High precision for exact keywords
- Language-independent (mostly)
- Fast and efficient

**Weaknesses:**
- Misses synonyms (without learned expansion)
- Tokenization can break identifiers (`StreamingText` + `Response`)
- No understanding of meaning

**Example Query:** "Find StreamingTextResponse class"
- **Weight:** High (0.6-0.7)
- **Reason:** Specific identifier mentioned

### 3. Pattern Matching (Fuzzy/Exact)

**What:** N-gram indexing for substring and fuzzy matching

### Implementation: SQLite Trigram Index

```sql
-- Create trigram index
CREATE TABLE chunks_trigram (
  chunk_id TEXT,
  trigram TEXT,
  position INTEGER
);

CREATE INDEX idx_trigram ON chunks_trigram(trigram);

-- Populate trigrams
-- For text "useChat":
-- Trigrams: "use", "seC", "eCh", "Cha", "hat"

-- Query strategies:
-- 1. Wildcard (LIKE)
SELECT chunk_id, content
FROM chunks
WHERE content LIKE '%StreamingTextResponse%';

-- 2. Fuzzy (Levenshtein distance) - computed in TypeScript layer
-- Find candidates using trigram index, then compute Levenshtein in app
SELECT chunk_id, content
FROM chunks
WHERE chunk_id IN (
  -- Get candidates with trigram matching
  SELECT chunk_id FROM chunks_trigram
  WHERE trigram IN ('str', 'tre', 'rea', 'eam', 'ami', 'min', 'ing')
  GROUP BY chunk_id
  HAVING COUNT(*) >= 3  -- At least 3 matching trigrams
);

-- 3. Regex - computed in TypeScript layer
-- SQLite doesn't include built-in REGEXP; we use trigram + app-layer pattern matching
SELECT chunk_id, content
FROM chunks
WHERE content LIKE '%Streaming%Response%';  -- Basic pattern with LIKE
```

**Note:** SQLite doesn't include built-in REGEXP or Levenshtein functions by default.
The actual implementation uses:
- Trigram indexing for efficient fuzzy substring matching
- Levenshtein distance computed in the TypeScript application layer
- Pattern matching with LIKE and application-layer regex for complex patterns

**Strengths:**
- **Ultra-high precision** for exact codes
- Handles typos/misspellings (Levenshtein)
- Finds partial identifiers
- Language-agnostic
- Works with CamelCase, snake_case, kebab-case

**Weaknesses:**
- Larger index size (n-grams for all substrings)
- Slower than keyword search
- No semantic understanding

**Example Query:** "STreamingTxtResp" (typo)
- **Weight:** High (0.7-0.8)
- **Reason:** Likely typo of exact identifier, fuzzy match needed

### 4. Graph Retrieval (Relationships)

**What:** Entity-relationship traversal (our unique addition)

**Implementation:** Our existing graph database

```sql
-- Find entity and its relationships
SELECT n2.id, n2.properties, e.relationship, e.weight
FROM nodes n1
JOIN edges e ON (n1.id = e.source OR n1.id = e.target)
JOIN nodes n2 ON (n2.id = e.target OR n2.id = e.source)
WHERE n1.name LIKE '%StreamingTextResponse%'
AND n2.id != n1.id;
```

**Strengths:**
- Discovers related entities (what uses this? what does this extend?)
- Cross-repository connections
- Architectural understanding
- Unique to GraphRAG (not in standard RAG)

**Weaknesses:**
- Requires graph extraction (preprocessing)
- Only finds connected entities
- No standalone text search

**Example Query:** "What uses StreamingTextResponse?"
- **Weight:** High (0.6-0.8)
- **Reason:** Relationship query

## Dynamic Weighting via LLM

### Query Analysis System

The LLM analyzes the query to determine optimal weights:

```ts
interface QueryAnalysis {
  query_type: 'conceptual' | 'identifier' | 'relationship' | 'fuzzy' | 'mixed';
  weights: {
    dense: number;    // 0.0-1.0
    sparse: number;   // 0.0-1.0
    pattern: number;  // 0.0-1.0
    graph: number;    // 0.0-1.0
  };
  reasoning: string;
}
```

### Example Query Classifications

**1. Conceptual Query:**
```text
Query: "How do I stream AI responses in a React app?"
Analysis:
  type: conceptual
  weights: { dense: 0.7, sparse: 0.2, pattern: 0.0, graph: 0.1 }
  reasoning: "Broad conceptual question benefits from semantic understanding"
```

**2. Identifier Query:**
```text
Query: "Find the StreamingTextResponse class"
Analysis:
  type: identifier
  weights: { dense: 0.1, sparse: 0.5, pattern: 0.3, graph: 0.1 }
  reasoning: "Specific class name - prioritize keyword and pattern matching"
```

**3. Relationship Query:**
```text
Query: "What components use the useChat hook?"
Analysis:
  type: relationship
  weights: { dense: 0.1, sparse: 0.2, pattern: 0.1, graph: 0.6 }
  reasoning: "Dependency question - prioritize graph relationships"
```

**4. Fuzzy Query (typo):**
```text
Query: "streamingTextRespons" (missing 'e')
Analysis:
  type: fuzzy
  weights: { dense: 0.1, sparse: 0.2, pattern: 0.6, graph: 0.1 }
  reasoning: "Likely typo in identifier - use fuzzy matching"
```

**5. Code Pattern Query:**
```text
Query: "Find API keys in format 'sk-proj-xxxx'"
Analysis:
  type: mixed
  weights: { dense: 0.0, sparse: 0.2, pattern: 0.7, graph: 0.1 }
  reasoning: "Specific pattern - use regex/pattern matching"
```

## Reciprocal Rank Fusion (RRF)

### Algorithm

RRF combines ranked lists from different sources:

```ts
function reciprocalRankFusion(
  results: {
    dense: SearchResult[];
    sparse: SearchResult[];
    pattern: SearchResult[];
    graph: SearchResult[];
  },
  weights: {
    dense: number;
    sparse: number;
    pattern: number;
    graph: number;
  },
  k: number = 60  // RRF constant
): SearchResult[] {
  const scores = new Map<string, number>();

  // Process each search type
  for (const [type, resultList] of Object.entries(results)) {
    const weight = weights[type];

    resultList.forEach((result, rank) => {
      const chunkId = result.chunk_id;
      const rrfScore = weight / (k + rank + 1);

      scores.set(
        chunkId,
        (scores.get(chunkId) || 0) + rrfScore
      );
    });
  }

  // Sort by combined score
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([chunkId, score]) => ({ chunk_id: chunkId, score }));
}
```

### Why RRF Works

1. **Rank-based, not score-based:**
   - Different search methods have incomparable scores (cosine distance vs BM25 vs edit distance)
   - Rank is universal

2. **Handles score normalization:**
   - No need to normalize disparate scoring systems
   - Position in ranked list is what matters

3. **Diminishing returns:**
   - Top results matter more (rank 1 >> rank 100)
   - 1/(k+rank) provides smooth decay

4. **Dynamic weighting:**
   - LLM-determined weights influence final ranking
   - Adapts to query type automatically

## Integration into SQLite

### Complete Schema

```sql
-- 1. Dense vectors (already planned)
CREATE VIRTUAL TABLE embeddings USING vec0(
  chunk_id TEXT PRIMARY KEY,
  repo TEXT,
  entity_id TEXT,
  content TEXT,
  embedding FLOAT[768],
  metadata TEXT
);

-- 2. Sparse retrieval (FTS5)
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  chunk_id UNINDEXED,
  repo UNINDEXED,
  content,
  entity_id UNINDEXED,
  tokenize='porter unicode61'
);

-- 3. Pattern matching (trigrams)
CREATE TABLE chunks_trigram (
  chunk_id TEXT,
  trigram TEXT,
  position INTEGER
);
CREATE INDEX idx_trigram ON chunks_trigram(trigram);

-- 4. Graph (already planned)
CREATE TABLE nodes (...);
CREATE TABLE edges (...);
```

### Unified Query Function

```ts
class HybridSearchEngine {
  async search(
    query: string,
    weights?: {
      dense: number;
      sparse: number;
      pattern: number;
      graph: number;
    }
  ): Promise<SearchResult[]> {
    // 1. Analyze query if weights not provided
    if (!weights) {
      weights = await this.analyzeQuery(query);
    }

    // 2. Execute all search types in parallel
    const [denseResults, sparseResults, patternResults, graphResults] =
      await Promise.all([
        this.denseSearch(query),
        this.sparseSearch(query),
        this.patternSearch(query),
        this.graphSearch(query)
      ]);

    // 3. Fuse results with RRF
    const fusedResults = this.reciprocalRankFusion(
      { dense: denseResults, sparse: sparseResults,
        pattern: patternResults, graph: graphResults },
      weights
    );

    // 4. Fetch full content for top results
    return this.enrichResults(fusedResults.slice(0, 20));
  }

  private async analyzeQuery(query: string): Promise<Weights> {
    const response = await this.llm.analyze({
      system: `You are a query analyzer for a code search engine.
      Analyze the query and determine optimal weights for:
      - dense (semantic/embedding search)
      - sparse (keyword/BM25 search)
      - pattern (fuzzy/regex search)
      - graph (relationship search)

      Weights must sum to 1.0.`,
      prompt: `Query: "${query}"

      Classify the query type and provide weights.`,
      response_format: QueryAnalysisSchema
    });

    return response.weights;
  }
}
```

## Implementation Plan

### Phase 1: Add Sparse Retrieval (FTS5)

**Files to modify:**
- `src/lib/graph-database.ts` - Add FTS5 table creation
- `src/lib/repository-indexer.ts` - Populate FTS5 during indexing
- `src/mcp/tools/query-engine.ts` - Add `sparseSearch()` method

**Estimated effort:** 2-3 hours

### Phase 2: Add Pattern Matching (Trigrams)

**Files to modify:**
- `src/lib/graph-database.ts` - Add trigram table
- `src/lib/repository-indexer.ts` - Generate trigrams during indexing
- `src/mcp/tools/query-engine.ts` - Add `patternSearch()` method
- `src/utils/trigram.ts` (NEW) - Trigram generation utilities

**Estimated effort:** 3-4 hours

### Phase 3: Add Query Analyzer (LLM)

**Files to create:**
- `src/lib/query-analyzer.ts` - LLM-based query classification
- `src/types/query-analysis.ts` - Type definitions

**Estimated effort:** 2-3 hours

### Phase 4: Implement RRF

**Files to modify:**
- `src/mcp/tools/query-engine.ts` - Add RRF algorithm
- `src/mcp/tools/hybrid-search.ts` (NEW) - Unified search interface

**Estimated effort:** 2-3 hours

### Phase 5: Integration & Testing

**Files to modify:**
- `src/mcp/server.ts` - Use hybrid search instead of simple queries
- `examples/hybrid-search-demo.ts` (NEW) - Demonstration
- `tests/hybrid-search.test.ts` (NEW) - Unit tests

**Estimated effort:** 3-4 hours

**Total estimated effort:** 12-17 hours

## Performance Characteristics

### Query Performance Targets

```text
Dense search (vec):      10-50ms   (vector similarity)
Sparse search (FTS5):    5-20ms    (BM25 inverted index)
Pattern search (trigram): 20-100ms  (fuzzy matching)
Graph search:            10-30ms   (SQL joins)
RRF fusion:              1-5ms     (in-memory sorting)
---
Total:                   50-200ms  (parallel execution)
```

### Storage Overhead

**Per 1,000 chunks (avg 500 chars each):**
```text
Dense embeddings:  ~3 MB   (768 floats × 4 bytes × 1000)
Sparse FTS5:       ~1 MB   (inverted index)
Trigram index:     ~5 MB   (n-grams for fuzzy matching)
Graph:             ~2 MB   (nodes + edges)
---
Total:             ~11 MB per 1,000 chunks
```

**Example: Vercel AI SDK (10,000 chunks):**
- Dense: 30 MB
- Sparse: 10 MB
- Trigram: 50 MB
- Graph: 20 MB
- **Total: ~110 MB** (acceptable for local storage)

## Advantages Over Pure Semantic Search

### Test Case: Finding `StreamingTextResponse`

**Pure Semantic:**
```text
Query: "streaming text response"
Results:
1. "async text streaming handler"       (0.85 similarity)
2. "response stream processor"          (0.83 similarity)
3. "TextStreamingResponse class"        (0.82 similarity)
4. "StreamingTextResponse class"        (0.81 similarity)  ← RANK 4!
```

**Hybrid (LLM-weighted):**
```text
Query: "streaming text response"
LLM Analysis: Likely searching for identifier
Weights: { dense: 0.2, sparse: 0.5, pattern: 0.2, graph: 0.1 }

Dense results:     ["async text streaming...", "response stream...", ...]
Sparse results:    ["StreamingTextResponse", "TextStreamResponse", ...]
Pattern results:   ["StreamingTextResponse", ...] (exact substring)
Graph results:     [related entities]

RRF Fusion:
1. "StreamingTextResponse class"        (0.95 score)  ← RANK 1!
2. "TextStreamingResponse class"        (0.72 score)
3. "async text streaming handler"       (0.61 score)
```

### Test Case: Conceptual Question

**Pure Keyword:**
```text
Query: "How do I implement real-time AI chat in React?"
Results: (BM25 scores based on keyword frequency)
1. "AI implementation guide"
2. "React chat component"
3. "real-time updates"
(Misses: broader architectural guidance)
```

**Hybrid (LLM-weighted):**
```
Query: "How do I implement real-time AI chat in React?"
LLM Analysis: Conceptual question, needs semantic understanding
Weights: { dense: 0.7, sparse: 0.2, pattern: 0.0, graph: 0.1 }

Dense results:     [comprehensive AI chat tutorials, streaming examples]
Sparse results:    [keyword matches for "React", "AI", "chat"]
Pattern results:   [] (not applicable)
Graph results:     [related components and hooks]

RRF Fusion:
1. "Building real-time AI chat with React and streaming"
2. "useChat hook guide for React applications"
3. "AI streaming architecture patterns"
(Better: holistic architectural understanding)
```

## Comparison with Standard RAG

| Feature | Standard RAG | Dynamic Hybrid GraphRAG |
|---------|-------------|------------------------|
| **Search Types** | 1 (semantic) | 4 (semantic + keyword + fuzzy + graph) |
| **Adaptation** | Fixed | Dynamic (LLM-weighted) |
| **Code Identifiers** | Poor | Excellent (pattern matching) |
| **Typo Handling** | Poor | Good (fuzzy matching) |
| **Relationships** | None | Native (graph) |
| **Query Analysis** | None | LLM-based classification |
| **Fusion** | N/A | RRF with weights |
| **Use Case** | General docs | Code repositories |

## Next Steps

1. **Review and approve** this architecture
2. **Decide on implementation priority:**
   - Option A: Implement now (12-17 hours)
   - Option B: Complete sqlite-vec basic integration first, then enhance
   - Option C: Phased approach (FTS5 → Trigrams → RRF → LLM weighting)

3. **Testing strategy:**
   - Unit tests for each search type
   - Integration test with real code repository
   - Benchmark against pure semantic search

Would you like me to proceed with implementation? This is a significant enhancement that would make our GraphRAG system exceptionally powerful for code retrieval.

---

**Key Innovation:** Combining **4 search strategies** (semantic, keyword, fuzzy, graph) with **LLM-determined dynamic weighting** and **Reciprocal Rank Fusion** creates a system that adapts to query type automatically, dramatically improving retrieval accuracy for code and documentation across multiple repositories.
