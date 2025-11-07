# LanceDB Variant: GraphRAG for Full Codebase Indexing

**Status:** Conceptual Analysis
**Version:** 1.0.0
**Date:** November 7, 2025

> **Context:** Analysis of creating a LanceDB-based variant of GraphRAG optimized for indexing entire codebases (not just dependencies)

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [LanceDB Capabilities Analysis](#lancedb-capabilities-analysis)
- [Architecture Comparison](#architecture-comparison)
- [Migration Requirements](#migration-requirements)
- [What Changes](#what-changes)
- [What Stays the Same](#what-stays-the-same)
- [The Graph Problem](#the-graph-problem)
- [Proposed Hybrid Architecture](#proposed-hybrid-architecture)
- [Implementation Phases](#implementation-phases)
- [Scalability Benefits](#scalability-benefits)
- [Tradeoffs & Considerations](#tradeoffs--considerations)
- [Recommended Approach](#recommended-approach)

---

## Executive Summary

### TL;DR

**Can you migrate to LanceDB?** Yes, but with caveats.

**What LanceDB Replaces Well:**
- ✅ Vector search (sqlite-vec) → LanceDB native vector search (MUCH better at scale)
- ✅ Full-text search (FTS5/BM25) → LanceDB Tantivy/BM25 (better performance)
- ✅ Sparse search → LanceDB built-in FTS
- ⚠️ Pattern/fuzzy search (trigrams) → Would need custom implementation

**What LanceDB DOESN'T Replace:**
- ❌ **Graph database** - LanceDB is NOT a graph database
- ❌ Graph traversal - No native support for relationship queries like "What uses X?"
- ❌ Centrality analysis (PageRank, betweenness, etc.)

**Recommended Architecture:**
- **Hybrid approach:** LanceDB for vectors + FTS, separate graph layer for relationships
- OR: Use LanceDB + embed graph info in vectors, lose native graph traversal

---

## LanceDB Capabilities Analysis

### What LanceDB Excels At

Based on research (GitHub, docs, blog posts):

**1. Vector Search** ⭐⭐⭐⭐⭐
- **Scale:** "Search billions of vectors in milliseconds"
- **Performance:** State-of-the-art ANN indexing
- **Distance Metrics:** L2 (default), Cosine, Dot Product
- **Use Case:** Entity embeddings, edge embeddings, semantic search
- **Better Than sqlite-vec:** YES - sqlite-vec is great for small-medium scale, LanceDB for large scale

**2. Full-Text Search** ⭐⭐⭐⭐
- **Engine:** Tantivy (Rust-based, similar to Lucene)
- **Algorithm:** BM25 (same as current FTS5)
- **Hybrid Search:** Native support for `query_type="hybrid"` (vector + FTS combined)
- **Use Case:** Keyword search, identifier search
- **Better Than FTS5:** YES - better performance, built-in hybrid search

**3. SQL Queries** ⭐⭐⭐
- **Filtering:** Standard SQL WHERE clauses
- **Aggregations:** GROUP BY, COUNT, etc.
- **Joins:** Limited (columnar storage optimized for scans, not joins)
- **Use Case:** Metadata filtering, repo filtering
- **Better Than SQLite:** Depends - SQLite better for complex joins, LanceDB better for analytics

**4. TypeScript SDK** ⭐⭐⭐⭐
- **Availability:** Native TypeScript/JavaScript SDK
- **Integration:** Works in Node.js, serverless functions
- **API Style:** Async/promise-based
- **Better Than better-sqlite3:** Different paradigm (async vs sync)

**5. Scalability** ⭐⭐⭐⭐⭐
- **Storage:** Columnar format (Lance), optimized for large datasets
- **Data Size:** "Petabytes of multimodal data"
- **Zero-Copy:** Efficient memory usage
- **Versioning:** Automatic data versioning
- **Better Than SQLite:** YES for large-scale datasets (100GB+)

### What LanceDB Does NOT Have

**1. Graph Database Features** ❌
- NO native graph traversal
- NO relationship queries (e.g., "find all nodes connected to X")
- NO graph algorithms (PageRank, shortest path, community detection)
- NO edge-centric queries

**2. Pattern/Fuzzy Search** ⚠️
- NO trigram indexing
- NO Levenshtein distance
- Would need to implement custom fuzzy matching

**3. Transaction Guarantees** ⚠️
- Optimized for append-mostly workloads
- Not ACID in the traditional sense (uses versioning instead)

---

## Architecture Comparison

### Current SQLite Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SQLite Database                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐       │
│  │    nodes    │  │    edges    │  │    chunks    │       │
│  │  (graph)    │  │  (graph)    │  │   (text)     │       │
│  └─────────────┘  └─────────────┘  └──────────────┘       │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐       │
│  │ chunks_fts  │  │chunks_trigram│ │  embeddings  │       │
│  │   (BM25)    │  │   (fuzzy)    │  │ (sqlite-vec) │       │
│  └─────────────┘  └─────────────┘  └──────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Search Strategies:
  1. Dense: embeddings table (semantic via sqlite-vec)
  2. Sparse: chunks_fts (keyword via BM25)
  3. Pattern: chunks_trigram (fuzzy via Levenshtein)
  4. Graph: nodes + edges (relationship traversal)
```

**Strengths:**
- ✅ All-in-one database
- ✅ ACID transactions
- ✅ Excellent for graph traversal (recursive CTEs)
- ✅ Good for small-medium datasets (< 10GB)

**Weaknesses:**
- ❌ Vector search slower at scale (sqlite-vec limited)
- ❌ FTS5 not as fast as Tantivy
- ❌ Single file can become large
- ❌ Limited parallelism

### Proposed LanceDB Architecture (Option 1: Pure LanceDB)

```
┌─────────────────────────────────────────────────────────────┐
│                    LanceDB Tables                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────┐                  │
│  │          entities_table              │                  │
│  │  - id (string)                       │                  │
│  │  - name (string)                     │                  │
│  │  - kind (string)                     │                  │
│  │  - repo (string)                     │                  │
│  │  - properties (JSON)                 │                  │
│  │  - embedding (vector[768])           │  ← Granite 125M  │
│  └──────────────────────────────────────┘                  │
│                                                             │
│  ┌──────────────────────────────────────┐                  │
│  │          edges_table                 │                  │
│  │  - source (string)                   │                  │
│  │  - target (string)                   │                  │
│  │  - relationship (string)             │                  │
│  │  - weight (float)                    │                  │
│  │  - context (string)                  │                  │
│  │  - embedding (vector[768])           │  ← Granite 125M  │
│  └──────────────────────────────────────┘                  │
│                                                             │
│  ┌──────────────────────────────────────┐                  │
│  │          chunks_table                │                  │
│  │  - chunk_id (string)                 │                  │
│  │  - repo (string)                     │                  │
│  │  - content (string)                  │  ← Tantivy FTS   │
│  │  - entity_id (string)                │                  │
│  │  - embedding (vector[768])           │  ← Granite 125M  │
│  └──────────────────────────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Search Strategies:
  1. Dense: Native vector search on embeddings
  2. Sparse: Built-in Tantivy full-text search
  3. Pattern: LOST (or implement custom)
  4. Graph: LOST (or implement manual join queries)
```

**Strengths:**
- ✅ Excellent vector search at scale
- ✅ Fast full-text search (Tantivy)
- ✅ Built-in hybrid search
- ✅ Scales to billions of vectors
- ✅ Columnar storage efficient

**Weaknesses:**
- ❌ NO native graph traversal
- ❌ NO fuzzy/pattern search
- ❌ Graph queries require manual joins (slow)
- ❌ Lost recursive relationship queries

### Proposed LanceDB Architecture (Option 2: Hybrid)

```
┌─────────────────────────────────────────────────────────────┐
│                    LanceDB Tables                           │
│  (Vectors + Full-Text Search)                              │
├─────────────────────────────────────────────────────────────┤
│  • entities_table (with embeddings)                        │
│  • chunks_table (with embeddings + Tantivy FTS)            │
└─────────────────────────────────────────────────────────────┘
                        ↓ ↑
                   Foreign keys
                        ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│             SQLite Graph Database (Minimal)                │
│  (Graph Relationships ONLY)                                │
├─────────────────────────────────────────────────────────────┤
│  • nodes (id, properties) - NO embeddings                  │
│  • edges (source, target, relationship, weight)            │
│  • Repository metadata                                     │
└─────────────────────────────────────────────────────────────┘

Search Strategies:
  1. Dense: LanceDB vector search ← FAST
  2. Sparse: LanceDB Tantivy FTS ← FAST
  3. Pattern: SQLite trigrams (or skip)
  4. Graph: SQLite recursive CTEs ← PRESERVED
```

**Strengths:**
- ✅ Best of both worlds
- ✅ Fast vector search (LanceDB)
- ✅ Fast FTS (LanceDB Tantivy)
- ✅ Preserves graph traversal (SQLite)
- ✅ Minimal duplication (only IDs in both)

**Weaknesses:**
- ⚠️ Two databases to manage
- ⚠️ Sync complexity (keep IDs in sync)
- ⚠️ More infrastructure

---

## Migration Requirements

### Code Changes Required

#### 1. Database Layer (`src/lib/`)

**Current:**
```typescript
// src/lib/graph-database.ts
import Database from 'better-sqlite3';

export class GraphDatabaseConnection {
  private db: Database.Database;

  insertNode(node: GraphNode) {
    this.db.prepare('INSERT INTO nodes ...').run(...);
  }

  searchEmbeddings(vector: number[]) {
    // sqlite-vec query
    return this.db.prepare('SELECT ... FROM embeddings WHERE ...').all();
  }
}
```

**New (Option 1 - Pure LanceDB):**
```typescript
// src/lib/lance-database.ts
import * as lancedb from 'vectordb'; // LanceDB TypeScript SDK

export class LanceDatabaseConnection {
  private db: lancedb.Connection;

  async insertNode(node: GraphNode) {
    const table = await this.db.openTable('entities');
    await table.add([{
      id: node.id,
      name: node.name,
      embedding: await this.embed(node)
    }]);
  }

  async searchEmbeddings(vector: number[]) {
    const table = await this.db.openTable('entities');
    return await table.search(vector).limit(10).execute();
  }

  // NEW: Manual graph traversal (slow!)
  async findRelatedNodes(nodeId: string) {
    const edgesTable = await this.db.openTable('edges');
    // Find edges where source = nodeId
    const outgoing = await edgesTable
      .where(`source = '${nodeId}'`)
      .execute();

    // Then look up target nodes (requires second query)
    const entitiesTable = await this.db.openTable('entities');
    const targets = await entitiesTable
      .where(`id IN (${outgoing.map(e => e.target).join(',')})`)
      .execute();

    return targets;
  }
}
```

**New (Option 2 - Hybrid):**
```typescript
// src/lib/hybrid-database.ts
import * as lancedb from 'vectordb';
import Database from 'better-sqlite3';

export class HybridDatabaseConnection {
  private lance: lancedb.Connection;
  private sqlite: Database.Database;

  async insertNode(node: GraphNode) {
    // 1. Store embedding in LanceDB
    const entitiesTable = await this.lance.openTable('entities');
    await entitiesTable.add([{
      id: node.id,
      embedding: await this.embed(node)
    }]);

    // 2. Store graph structure in SQLite
    this.sqlite.prepare('INSERT INTO nodes (id, properties) VALUES (?, ?)')
      .run(node.id, JSON.stringify(node.properties));
  }

  async searchEmbeddings(vector: number[]) {
    // Use LanceDB for vector search
    const table = await this.lance.openTable('entities');
    return await table.search(vector).limit(10).execute();
  }

  findRelatedNodes(nodeId: string) {
    // Use SQLite for graph traversal (FAST!)
    return this.sqlite.prepare(`
      WITH RECURSIVE related AS (
        SELECT target, relationship FROM edges WHERE source = ?
        UNION ALL
        SELECT e.target, e.relationship FROM edges e
        JOIN related r ON e.source = r.target
      )
      SELECT * FROM nodes WHERE id IN (SELECT target FROM related)
    `).all(nodeId);
  }
}
```

#### 2. Entity Embedder (`src/lib/entity-embedder.ts`)

**Current:**
```typescript
// Stores in SQLite embeddings table
const stmt = this.db.prepare(`
  INSERT INTO embeddings (chunk_id, embedding) VALUES (?, ?)
`);
stmt.run(entityId, JSON.stringify(embedding));
```

**New:**
```typescript
// Stores in LanceDB table
const table = await this.lance.openTable('entities');
await table.add([{
  id: entityId,
  embedding: embedding // Native vector type, no JSON stringify!
}]);
```

#### 3. Query Engine (`src/mcp/tools/query-engine.ts`)

**Major changes required:**

**Dense Search:**
```typescript
// BEFORE
const results = this.db.prepare(`
  SELECT *, vec_distance_L2(embedding, ?) as distance
  FROM embeddings
  ORDER BY distance
  LIMIT 10
`).all(queryEmbedding);

// AFTER
const table = await this.lance.openTable('entities');
const results = await table
  .search(queryEmbedding)
  .limit(10)
  .execute();
```

**Sparse Search (Full-Text):**
```typescript
// BEFORE
const results = this.db.prepare(`
  SELECT * FROM chunks_fts
  WHERE content MATCH ?
  ORDER BY rank
`).all(query);

// AFTER
const table = await this.lance.openTable('chunks');
const results = await table
  .search(query)
  .select(['chunk_id', 'content', 'repo'])
  .where('query_type = "fts"') // Tantivy full-text
  .execute();
```

**Hybrid Search:**
```typescript
// NEW: LanceDB native hybrid search!
const table = await this.lance.openTable('chunks');
const results = await table
  .search(query, { queryType: 'hybrid' }) // Vector + FTS combined
  .limit(10)
  .execute();
```

**Graph Search:**
```typescript
// PROBLEM: LanceDB doesn't support graph traversal natively
// OPTION 1: Manual joins (slow)
const edgesTable = await this.lance.openTable('edges');
const edges = await edgesTable.where(`source = '${entityId}'`).execute();
// ... then lookup targets in entities table (N+1 query problem)

// OPTION 2: Use hybrid approach (SQLite for graph)
const related = this.sqlite.prepare(`
  WITH RECURSIVE ... (use existing graph query)
`).all(entityId);
```

#### 4. Migration Scripts

Would need scripts to:
1. Export data from SQLite
2. Transform to LanceDB format
3. Import into LanceDB tables
4. Verify data integrity

---

## What Changes

### Must Rewrite

1. **Database Connection Layer**
   - Replace `better-sqlite3` with `vectordb` (LanceDB SDK)
   - Change from synchronous to async API
   - Update all queries to LanceDB API

2. **Embedding Storage**
   - Remove sqlite-vec usage
   - Use LanceDB native vector columns
   - Update insert/update logic

3. **Search Implementations**
   - Dense: Use LanceDB `.search(vector)`
   - Sparse: Use LanceDB Tantivy FTS
   - Hybrid: Use LanceDB native hybrid search
   - Pattern: Either skip or implement custom
   - Graph: See "The Graph Problem" section

4. **Schema Definition**
   - No SQL DDL (CREATE TABLE)
   - Use LanceDB schema definitions (PyArrow or TypeScript types)

5. **Transaction Handling**
   - SQLite ACID → LanceDB versioning
   - May need to rethink transactional operations

### Dependencies Update

**Remove:**
```json
{
  "better-sqlite3": "^11.5.0",
  "sqlite-vec": "^0.1.6" (if separate)
}
```

**Add:**
```json
{
  "vectordb": "^0.4.0" // LanceDB TypeScript SDK
}
```

---

## What Stays the Same

### Zero Changes Required ✅

1. **Model Stack (CONSTITUTION.md)**
   - ✅ SciPhi/Triplex for triple extraction
   - ✅ Granite Embedding 125M (768d)
   - ✅ Granite 4.0 Micro for query analysis
   - ✅ All model roles unchanged

2. **Triple Extraction Pipeline**
   - ✅ `src/lib/document-processor.ts` - No changes
   - ✅ `src/lib/graph-manager.ts` - Minimal changes (just DB calls)
   - ✅ Extract [subject, predicate, object] format

3. **Embedding Generation**
   - ✅ Entity format: `"name :: kind :: hints"`
   - ✅ Edge format: `"S <predicate> O :: context"`
   - ✅ 768-dimensional vectors
   - ✅ Batch processing logic

4. **Query Analysis**
   - ✅ `src/lib/query-analyzer.ts` - No changes
   - ✅ Query classification (conceptual, identifier, etc.)
   - ✅ Dynamic weight calculation

5. **RRF Fusion**
   - ✅ `src/lib/reciprocal-rank-fusion.ts` - No changes
   - ✅ Combine results from multiple strategies

6. **MCP Server**
   - ✅ `src/mcp/server.ts` - No changes to structure
   - ✅ Tool definitions stay the same
   - ✅ Attendant logic unchanged

7. **Provider System**
   - ✅ `src/providers/` - Zero changes
   - ✅ llamacpp, OpenAI, DMR all unchanged

---

## The Graph Problem

### Challenge: LanceDB is NOT a Graph Database

**What You Lose:**

1. **Recursive Queries**
   ```sql
   -- Current SQLite (works great!)
   WITH RECURSIVE related AS (
     SELECT target FROM edges WHERE source = ?
     UNION ALL
     SELECT e.target FROM edges e JOIN related r ON e.source = r.target
   )
   SELECT * FROM nodes WHERE id IN (SELECT target FROM related);
   ```

   This is **impossible** in LanceDB natively.

2. **Graph Algorithms**
   - PageRank
   - Betweenness centrality
   - Community detection
   - Shortest path

   Current implementation relies on SQLite + in-memory graph processing.

3. **Relationship Queries**
   - "What imports this module?"
   - "What does this function call?"
   - "Find all transitive dependencies"

**Solutions:**

### Option A: Embed Graph in Vectors (Lossy)

Encode graph relationships directly in embeddings:

```typescript
// Entity embedding with relationship context
const entityText = `
  AuthModule :: class ::
  Handles authentication, in src/auth/AuthModule.ts

  RELATIONSHIPS:
  - uses: UserService (strong, 0.9)
  - uses: Database (medium, 0.5)
  - used_by: LoginController (strong, 0.8)
`;

const embedding = await granite.embed(entityText);
```

**Pros:**
- ✅ Pure LanceDB (no second database)
- ✅ Semantic similarity captures some relationships

**Cons:**
- ❌ Lossy (can't perfectly reconstruct graph)
- ❌ No exact graph traversal
- ❌ "What uses X?" becomes approximate search

### Option B: Hybrid Architecture (Recommended)

Use LanceDB + lightweight graph store:

```typescript
// LanceDB: Vectors + FTS (what it's good at)
- entities_table (embeddings)
- chunks_table (embeddings + Tantivy FTS)

// SQLite: Graph structure ONLY (no embeddings)
- nodes (id, properties)
- edges (source, target, relationship, weight)

// Or use dedicated graph DB:
// - Neo4j (heavyweight, ACID)
// - Memgraph (lightweight, in-memory)
// - TigerGraph (scale)
```

**Pros:**
- ✅ Best of both worlds
- ✅ Fast vector search (LanceDB)
- ✅ Exact graph traversal (graph DB)

**Cons:**
- ⚠️ Two databases to sync
- ⚠️ More infrastructure

### Option C: Precompute Graph Features

Store graph-derived features as vectors:

```typescript
// For each entity, precompute:
- Neighbors (1-hop, 2-hop, 3-hop)
- Centrality scores (PageRank, etc.)
- Community membership
- Relationship types summary

// Store as metadata in LanceDB
await entitiesTable.add([{
  id: 'AuthModule',
  embedding: [0.1, 0.2, ...],
  neighbors_1hop: ['UserService', 'Database'],
  neighbors_2hop: ['DatabaseConnection', 'Config'],
  pagerank: 0.85,
  community: 'auth_cluster'
}]);
```

**Pros:**
- ✅ Single database (LanceDB)
- ✅ Fast queries (no traversal needed)

**Cons:**
- ❌ Stale data (must recompute when graph changes)
- ❌ Approximation (not real-time traversal)

---

## Proposed Hybrid Architecture

**Recommended for full codebase indexing:**

```
┌─────────────────────────────────────────────────────────────┐
│                 LanceDB (Vector + FTS Layer)                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  entities_table:                                            │
│    - id: string                                             │
│    - repo: string                                           │
│    - name: string                                           │
│    - kind: string (class, function, module, etc.)           │
│    - file_path: string                                      │
│    - properties: JSON                                       │
│    - embedding: vector<768>        ← Granite Embedding      │
│                                                             │
│  chunks_table:                                              │
│    - chunk_id: string                                       │
│    - repo: string                                           │
│    - entity_id: string (FK to entities)                     │
│    - content: string (Tantivy indexed)                      │
│    - chunk_type: enum                                       │
│    - embedding: vector<768>        ← Granite Embedding      │
│                                                             │
│  Search Capabilities:                                       │
│    - Vector search (semantic)      ← FAST, scales to billions
│    - Full-text search (BM25)       ← FAST, Tantivy          │
│    - Hybrid search (both)          ← NATIVE!                │
│    - SQL filtering (repo, kind)    ← Columnar analytics     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                        ↓ ↑
                   ID references
                        ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│               SQLite (Graph Structure Layer)               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  nodes:                                                     │
│    - id: string (PK)                ← Matches LanceDB       │
│    - repo: string                                           │
│    - centrality_scores: JSON (cached)                       │
│                                                             │
│  edges:                                                     │
│    - source: string (FK → nodes.id)                         │
│    - target: string (FK → nodes.id)                         │
│    - relationship: string (imports, calls, extends, etc.)   │
│    - weight: float                                          │
│    - context: string                                        │
│                                                             │
│  repositories:                                              │
│    - repo: string (PK)                                      │
│    - metadata: JSON                                         │
│    - last_indexed: timestamp                                │
│                                                             │
│  Graph Capabilities:                                        │
│    - Recursive CTEs                ← Transitive queries     │
│    - Graph algorithms              ← PageRank, etc.         │
│    - Relationship traversal        ← "What uses X?"         │
│    - Community detection           ← Cluster analysis       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Query Flow:
  1. User query → Query Analyzer (Granite 4.0 Micro)
  2. Determine search strategy weights
  3. Execute searches:
     - Dense: LanceDB vector search
     - Sparse: LanceDB Tantivy FTS
     - Graph: SQLite recursive CTEs
  4. Combine with RRF
  5. Attendant filtering (Granite 4.0 Micro)
```

### Why This Works

1. **Separation of Concerns:**
   - LanceDB: What it's GREAT at (vectors, FTS, scale)
   - SQLite: What it's GREAT at (graph, relationships, ACID)

2. **Minimal Duplication:**
   - Only entity IDs stored in both
   - No duplicate embeddings
   - No duplicate content

3. **Scalability:**
   - LanceDB handles billions of vectors (full codebase scale)
   - SQLite handles graph (typically millions of edges, fine for SQLite)

4. **Sync Strategy:**
   - IDs are source of truth
   - Both databases reference same entity IDs
   - Insert to both atomically (or use eventual consistency)

---

## Implementation Phases

### Phase 1: LanceDB Core (2-3 weeks)

**Goal:** Replace vector + FTS layers with LanceDB

**Tasks:**
1. Add LanceDB TypeScript SDK dependency
2. Create `LanceDatabaseConnection` class
3. Implement entity table schema
4. Implement chunks table schema
5. Port embedding insertion logic
6. Port dense search (vector)
7. Port sparse search (FTS via Tantivy)
8. Test hybrid search

**Acceptance Criteria:**
- ✅ Can insert entities with embeddings
- ✅ Can search by vector similarity
- ✅ Can search by full-text (Tantivy)
- ✅ Hybrid search works
- ✅ Tests pass

### Phase 2: Graph Layer Integration (1-2 weeks)

**Goal:** Integrate SQLite for graph operations

**Tasks:**
1. Create separate `GraphDatabase` class (minimal SQLite)
2. Schema: nodes (id only), edges, repositories
3. Implement graph traversal queries
4. Implement centrality calculations
5. Sync layer: ensure IDs match between LanceDB and SQLite
6. Transaction coordinator (atomic inserts to both)

**Acceptance Criteria:**
- ✅ Can traverse graph relationships
- ✅ "What uses X?" queries work
- ✅ Centrality scores computed
- ✅ IDs stay in sync

### Phase 3: Repository Indexer Rewrite (2-3 weeks)

**Goal:** Scale to index entire codebases (not just dependencies)

**Tasks:**
1. Parallel file processing (worker threads)
2. Incremental indexing (delta updates)
3. Repository-level isolation
4. Progress tracking and resumability
5. Conflict resolution (multiple repos with same entity names)
6. Batch embedding API integration (optional performance boost)

**Acceptance Criteria:**
- ✅ Can index 100k+ files
- ✅ Incremental updates work (don't re-index unchanged files)
- ✅ Multi-repo support
- ✅ Handles large repositories (e.g., Linux kernel)

### Phase 4: Query Engine Upgrade (1-2 weeks)

**Goal:** Optimize queries for LanceDB

**Tasks:**
1. Update dense search to use LanceDB API
2. Update sparse search to use Tantivy
3. Update hybrid search (native LanceDB)
4. Update graph search (use SQLite layer)
5. Remove pattern search OR implement custom fuzzy matching
6. RRF integration with new result formats
7. Performance benchmarking

**Acceptance Criteria:**
- ✅ All search strategies work
- ✅ Hybrid search faster than current
- ✅ Graph queries preserved
- ✅ Latency targets met (< 100ms for semantic search)

### Phase 5: Testing & Optimization (1-2 weeks)

**Goal:** Production-ready

**Tasks:**
1. Integration tests with large codebases
2. Benchmark vs SQLite version
3. Memory profiling
4. Index optimization (LanceDB index tuning)
5. Documentation updates
6. Migration guide from SQLite version

**Acceptance Criteria:**
- ✅ Passes all tests
- ✅ Handles 1M+ entities
- ✅ Query latency < 200ms (p95)
- ✅ Documentation complete

**Total Timeline:** 7-12 weeks (2-3 months)

---

## Scalability Benefits

### SQLite + sqlite-vec (Current)

**Good For:**
- ✅ Small to medium codebases (< 100k entities)
- ✅ Single repository indexing
- ✅ Prototype and MVP

**Limitations:**
- ❌ Single file database (can grow to GB/TB)
- ❌ Limited concurrent writes
- ❌ Vector search slows down at scale (> 1M vectors)

**Realistic Limits:**
- Entities: ~100k-500k
- Embeddings: ~1M vectors
- Database size: ~5-10GB

### LanceDB (Proposed)

**Good For:**
- ✅ Large codebases (1M+ entities)
- ✅ Multi-repository indexing (entire organizations)
- ✅ Production deployments

**Capabilities:**
- ✅ Billions of vectors
- ✅ Columnar storage (TB-PB scale)
- ✅ Fast ANN search at scale
- ✅ Parallel queries

**Realistic Limits:**
- Entities: 10M-100M+
- Embeddings: 1B+ vectors
- Database size: 100GB-1TB+

**Example Use Cases:**
- Index entire Linux kernel (~27M LOC)
- Index Google's monorepo (2B+ LOC)
- Index all of GitHub (50B+ LOC)

---

## Tradeoffs & Considerations

### Pros of LanceDB Migration ✅

1. **Massive Scale:**
   - From 100k entities → 100M+ entities
   - From 1M vectors → 1B+ vectors

2. **Better Vector Search:**
   - sqlite-vec good, LanceDB excellent
   - Sub-100ms queries on billions of vectors

3. **Better Full-Text Search:**
   - FTS5 good, Tantivy excellent
   - Better ranking, faster indexing

4. **Native Hybrid Search:**
   - No manual RRF needed (optional)
   - Vector + FTS fusion built-in

5. **Future-Proof:**
   - Built for AI workloads
   - Active development (backed by company)

### Cons of LanceDB Migration ❌

1. **Graph Complexity:**
   - Need hybrid architecture (LanceDB + graph layer)
   - OR lose native graph traversal

2. **Async API:**
   - Current: Synchronous (better-sqlite3)
   - New: Async (all queries await)
   - Ripple effect through codebase

3. **Two Databases (if hybrid):**
   - LanceDB for vectors/FTS
   - SQLite (or other) for graph
   - Sync overhead

4. **Migration Effort:**
   - 7-12 weeks development
   - Full rewrite of database layer
   - Extensive testing needed

5. **Lost Features:**
   - Pattern/fuzzy search (trigrams) - would need custom implementation
   - ACID transactions (replaced by versioning)

6. **New Dependency:**
   - LanceDB TypeScript SDK
   - Less mature than better-sqlite3

### When to Use LanceDB Variant

**Use LanceDB if:**
- ✅ Indexing entire codebases (millions of files)
- ✅ Multi-repository indexing at scale
- ✅ Need to search billions of vectors
- ✅ Performance critical (sub-100ms queries)
- ✅ Production deployment for large orgs

**Stick with SQLite if:**
- ❌ Small/medium codebases (< 100k entities)
- ❌ Prototyping or MVP
- ❌ Single developer dependencies
- ❌ Need simplicity (one database)
- ❌ Graph traversal is critical and frequent

---

## Recommended Approach

### Option 1: Separate Projects (Recommended)

**Create two variants:**

1. **graphrag-sqlite** (current)
   - SQLite + sqlite-vec
   - Great for small-medium scale
   - All-in-one simplicity
   - Target: Individual developers, small teams

2. **graphrag-lance** (new)
   - LanceDB + SQLite graph layer
   - Great for large scale
   - Hybrid architecture
   - Target: Large codebases, enterprises

**Why:**
- ✅ Both maintained independently
- ✅ Users choose based on scale needs
- ✅ Shared model stack (Triplex, Granite)
- ✅ Shared extraction logic
- ✅ Different database layers only

**Shared Code:**
```
graphrag-core/  (shared package)
├── src/
│   ├── lib/
│   │   ├── document-processor.ts    ← SHARED
│   │   ├── graph-manager.ts         ← SHARED (interface)
│   │   ├── entity-embedder.ts       ← SHARED (interface)
│   │   ├── query-analyzer.ts        ← SHARED
│   │   └── reciprocal-rank-fusion.ts ← SHARED
│   └── providers/                    ← SHARED
│       ├── llamacpp.ts
│       ├── openai.ts
│       └── dmr.ts

graphrag-sqlite/
├── src/lib/
│   ├── sqlite-database.ts           ← SQLite-specific
│   └── sqlite-entity-embedder.ts    ← SQLite implementation

graphrag-lance/
├── src/lib/
│   ├── lance-database.ts            ← LanceDB-specific
│   ├── graph-sqlite.ts              ← Minimal SQLite for graph
│   └── lance-entity-embedder.ts     ← LanceDB implementation
```

### Option 2: Monorepo with Adapters

**Single project, pluggable database:**

```typescript
// Database adapter interface
interface DatabaseAdapter {
  insertEntity(entity: GraphNode): Promise<void>;
  searchSemantic(vector: number[]): Promise<Result[]>;
  searchFullText(query: string): Promise<Result[]>;
  searchGraph(entityId: string): Promise<GraphNode[]>;
}

// Implementations
class SQLiteAdapter implements DatabaseAdapter { ... }
class LanceDBAdapter implements DatabaseAdapter { ... }

// User chooses at runtime
const db = process.env.DB_TYPE === 'lance'
  ? new LanceDBAdapter()
  : new SQLiteAdapter();
```

**Why:**
- ✅ Single codebase
- ✅ Easy to switch
- ⚠️ Abstraction overhead
- ⚠️ Harder to optimize per-database

### Option 3: Fork Current Project

**Create `graphrag-lance` fork:**

1. Fork current repo
2. Replace SQLite with LanceDB
3. Add graph layer (SQLite minimal OR Neo4j)
4. Maintain separately

**Why:**
- ✅ Quick start (copy existing)
- ✅ Independent evolution
- ❌ Code duplication
- ❌ Harder to share improvements

---

## Next Steps

### To Proceed with LanceDB Variant

1. **Validate Assumptions:**
   - [ ] Install LanceDB TypeScript SDK
   - [ ] Test vector search performance
   - [ ] Test Tantivy full-text search
   - [ ] Confirm no native graph support
   - [ ] Benchmark vs sqlite-vec

2. **Proof of Concept (1 week):**
   - [ ] Create minimal LanceDB connection
   - [ ] Insert 1000 entities with embeddings
   - [ ] Perform vector search
   - [ ] Perform full-text search
   - [ ] Test hybrid search
   - [ ] Measure latency

3. **Architecture Decision:**
   - [ ] Choose: Pure LanceDB OR Hybrid (LanceDB + graph DB)
   - [ ] If hybrid, choose graph DB (SQLite, Neo4j, Memgraph)
   - [ ] Design sync strategy

4. **Implementation Plan:**
   - [ ] Follow Phase 1-5 timeline (7-12 weeks)
   - [ ] Set up separate repo or monorepo
   - [ ] Share core logic with current version

5. **Documentation:**
   - [ ] Create `LANCEDB-MIGRATION-GUIDE.md`
   - [ ] Update CONSTITUTION.md (if different models needed)
   - [ ] Update CLAUDE.md with LanceDB specifics

---

## Open Questions

1. **Graph Database Choice:**
   - Minimal SQLite (good enough for millions of edges)?
   - Neo4j (full-featured but heavyweight)?
   - Memgraph (in-memory, fast but ephemeral)?

2. **Fuzzy/Pattern Search:**
   - Implement custom trigram matching in LanceDB?
   - Skip pattern search entirely?
   - Use external service (Elasticsearch)?

3. **Transaction Semantics:**
   - How to handle atomic inserts to both LanceDB and graph DB?
   - Use eventual consistency?
   - Two-phase commit?

4. **Incremental Indexing:**
   - LanceDB versioning for rollback?
   - Git integration for change detection?
   - Timestamp-based delta updates?

5. **Cost:**
   - LanceDB is open-source, but is cloud version needed?
   - Self-hosted infrastructure requirements?

---

## Conclusion

**Can you migrate to LanceDB?** YES, with effort.

**Should you?** Depends on scale:
- **Small/Medium (< 100k entities):** Stick with SQLite
- **Large (1M+ entities):** LanceDB makes sense

**Recommended Architecture:**
- **Hybrid:** LanceDB (vectors + FTS) + SQLite (graph)
- Best of both worlds
- Scales to billions of vectors
- Preserves graph traversal

**Effort:** 7-12 weeks of development for full migration

**Next Step:** Build proof-of-concept (1 week) to validate assumptions before committing.

---

**END OF LANCEDB VARIANT ANALYSIS v1.0.0**
