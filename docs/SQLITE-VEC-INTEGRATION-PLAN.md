# Complete SQLite-Vec Integration Plan

**Status:** ✅ Phase 1-3 Complete (October 28, 2025) | 🔮 Phase 4+ Planned

## Overview

This document outlines the complete integration of sqlite-vec into the GraphRAG system. This is the **core intent** of the project - combining graph relationships with semantic vector search in a single local SQLite database.

**Implementation Status:**
- ✅ **Phase 1:** Database setup with sqlite-vec extension (Complete)
- ✅ **Phase 2:** Core integration with dense search (Complete)
- ✅ **Phase 3:** Entity & edge embedding generation (Complete)
- 🔮 **Phase 4:** Legilimens CLI integration (Planned - see `docs/planning/PHASE-4-INTEGRATION-PLAN.md`)

**Current Capabilities:**
- sqlite-vec extension loaded and verified (v0.1.6)
- Entity embeddings with "name :: kind :: hints" format
- Edge embeddings with "S <predicate> O :: context" format
- 4-way hybrid search (dense + sparse + pattern + graph)
- Dynamic query analysis with RRF fusion
- Repository indexing pipeline with batch processing

See `docs/SQLITE-VEC-STATUS-CURRENT.md` for detailed current status.

## Architecture

### Database Structure

Single SQLite database (`.graphrag/database.sqlite`) with 5 table types:

```sql
-- 1. Repositories metadata
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,              -- "vercel/ai"
  name TEXT,                        -- "Vercel AI SDK"
  indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version TEXT,                     -- "3.4.0"
  branch TEXT,                      -- "main"
  commit_hash TEXT,                 -- Git commit
  metadata TEXT,                    -- JSON: {docs_path, language, etc}
  embedding_model TEXT              -- "granite-125m"
);

-- 2. Graph nodes (entities)
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,              -- "vercel/ai::StreamingTextResponse"
  repo TEXT NOT NULL,               -- "vercel/ai"
  type TEXT,                        -- "class", "function", "interface"
  name TEXT,                        -- "StreamingTextResponse"
  properties TEXT,                  -- JSON: full entity data
  FOREIGN KEY (repo) REFERENCES repositories(id)
);

-- 3. Graph edges (relationships)
CREATE TABLE edges (
  source TEXT,                      -- "vercel/ai::useChat"
  target TEXT,                      -- "vercel/ai::StreamingTextResponse"
  source_repo TEXT,                 -- "vercel/ai"
  target_repo TEXT,                 -- "vercel/ai"
  relationship TEXT,                -- "returns", "uses", "extends"
  weight REAL,                      -- 0.0-1.0 relationship strength
  metadata TEXT,                    -- JSON: context, examples
  PRIMARY KEY (source, target, relationship),
  FOREIGN KEY (source) REFERENCES nodes(id),
  FOREIGN KEY (target) REFERENCES nodes(id)
);

-- 4. Cross-repository references
CREATE TABLE cross_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_repo TEXT NOT NULL,          -- "copilotkit/copilotkit"
  from_entity TEXT NOT NULL,        -- "CopilotRuntime"
  to_repo TEXT NOT NULL,            -- "vercel/ai"
  to_entity TEXT NOT NULL,          -- "StreamingTextResponse"
  type TEXT NOT NULL,               -- "imports", "implements", "uses"
  strength REAL,                    -- 0.0-1.0
  context TEXT,                     -- Where/how it's used
  FOREIGN KEY (from_repo) REFERENCES repositories(id),
  FOREIGN KEY (to_repo) REFERENCES repositories(id)
);

-- 5. Embeddings (sqlite-vec virtual table)
-- Stores both entity and edge embeddings for semantic search
CREATE VIRTUAL TABLE embeddings USING vec0(
  chunk_id TEXT PRIMARY KEY,        -- "vercel/ai::entity::123" or "vercel/ai::edge::456"
  repo TEXT,                        -- "vercel/ai"
  entity_id TEXT,                   -- "vercel/ai::StreamingTextResponse" (for entities, nullable for edges)
  chunk_type TEXT,                  -- "entity", "edge", "documentation", "code", "comment"
  content TEXT,                     -- Formatted text: "name :: kind :: hints" or "S <pred> O :: context:..."
  embedding FLOAT[768],             -- Granite Embedding (768 for 125M, 1024 for 278M)
  metadata TEXT                     -- JSON: {subject, predicate, object, file, line, etc}
);

-- Indexes for performance
CREATE INDEX idx_nodes_repo ON nodes(repo);
CREATE INDEX idx_edges_source ON edges(source);
CREATE INDEX idx_edges_target ON edges(target);
CREATE INDEX idx_edges_repos ON edges(source_repo, target_repo);
CREATE INDEX idx_cross_refs_from ON cross_references(from_repo, from_entity);
CREATE INDEX idx_cross_refs_to ON cross_references(to_repo, to_entity);
CREATE INDEX idx_embeddings_repo ON embeddings(repo);
CREATE INDEX idx_embeddings_entity ON embeddings(entity_id);
```

## Model Recommendations

### Triple Extraction: Triplex (Phi-3 3.8B Finetune)

**Model:** [SciPhi/Triplex](https://huggingface.co/SciPhi/Triplex)

**Purpose:** Extract knowledge graph triples [subject, predicate, object] from code and documentation

**Why Triplex:**
- Fine-tuned Phi-3 3.8B specifically for knowledge graph extraction
- Excellent at extracting structured relationships from unstructured text
- Produces high-quality [s,p,o] triples with contextual information
- Runs efficiently on consumer hardware
- Strong understanding of code structure and documentation patterns

**Usage Pattern:**
```typescript
// Extract triples from code/docs
const triples = await triplexExtractor.extract(codeText);
// Returns: [
//   { subject: "StreamingTextResponse", predicate: "extends", object: "Response", context: "..." },
//   { subject: "useChat", predicate: "returns", object: "ChatState", context: "..." }
// ]
```

**Integration Point:** Phase 2.1 - Repository Indexer (src/lib/repository-indexer.ts)

### Embeddings: Granite Embedding Models

**Model Family:** IBM Granite Embedding (125M - 278M parameters)

**Purpose:** Vectorize both entities and relationships for semantic search and similarity clustering

**Why Granite:**
- Optimized for code and technical documentation
- Multiple sizes available (125M for efficiency, 278M for accuracy)
- Strong performance on code similarity tasks
- Efficient inference on CPU and GPU
- Good balance of quality and resource usage

**Embedding Strategy:**

1. **Entity Embeddings:**
   ```typescript
   // Format: "name :: kind :: hints"
   const entityText = `${entity.name} :: ${entity.type} :: ${entity.description}`;
   const embedding = await granite.embed(entityText);
   // Store in embeddings table with entity_id
   ```

2. **Edge Embeddings:**
   ```typescript
   // Format: "S <predicate> O :: context:..."
   const edgeText = `${subject} <${predicate}> ${object} :: context: ${contextSnippet}`;
   const embedding = await granite.embed(edgeText);
   // Store in embeddings table for relationship similarity
   ```

**Benefits of Dual Embedding:**
- **Find similar entities:** "What's similar to StreamingTextResponse?"
- **Find similar relations:** "What other patterns are like 'useChat returns ChatState'?"
- **Hybrid graph expansion:** Combine graph traversal with semantic similarity
- **Cross-repository linking:** Discover similar concepts across different codebases

**Vector Dimensions:**
- Granite 125M: 768 dimensions (default, good balance)
- Granite 278M: 1024 dimensions (higher accuracy, more storage)

**Storage in sqlite-vec:**
```sql
-- Both entities and edges stored in same vec0 table
CREATE VIRTUAL TABLE embeddings USING vec0(
  chunk_id TEXT PRIMARY KEY,        -- "repo::entity::id" or "repo::edge::id"
  repo TEXT,
  entity_id TEXT,                   -- Points to node ID for entities
  chunk_type TEXT,                  -- "entity", "edge", "documentation", "code"
  content TEXT,                     -- Original formatted text
  embedding FLOAT[768],             -- Granite embedding
  metadata TEXT                     -- JSON: {subject, predicate, object, etc}
);
```

### Optional: StructLM-7B for Advanced Reasoning

**Model:** [TIGER-Lab/StructLM-7B](https://huggingface.co/TIGER-Lab/StructLM-7B)

**Quantization:** Q4_K_M (4-5GB, runs on MacBook Pro)

**Purpose:** Reasoning over existing knowledge graphs (post-construction)

**Why StructLM:**
- Strong at structured data reasoning: tables, schemas, KG question answering
- Can infer missing links in the graph
- Answer complex queries over graph structure
- Better graph reasoning than general LLMs

**When to Use:**
- **After** Triplex builds your initial KG
- For complex queries: "Which repos share an API schema with X?"
- For link prediction: "What relationships might exist between A and B?"
- For graph completion: "What connections are we missing?"

**Usage Pattern:**
```typescript
// After KG is built with Triplex
const query = "Which repositories share authentication patterns with vercel/ai?";

// StructLM reasons over the graph structure
const reasoning = await structLM.reason({
  graph: existingKG,
  query: query,
  mode: "inference" // or "completion", "question_answering"
});

// Returns inferred connections and explanations
```

**Performance Notes:**
- Quantized Q4_K_M: 4-5GB RAM
- Slower than Triplex but still reasonable on M-series MacBooks
- Best used for occasional complex queries, not real-time retrieval
- Can run in background for batch link inference

**Integration Point:** Optional enhancement to Phase 3 - CLI Tool (reasoning command)

### Recommended Architecture Pattern

```text
┌─────────────────────────────────────────────────────────────┐
│                      Code/Documentation                      │
└───────────────────────────────┬─────────────────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  Triplex Extractor     │
                    │  (Phi-3 3.8B finetune) │
                    └───────────┬────────────┘
                                │
                    [subject, predicate, object] + context
                                │
                ┌───────────────┴────────────────┐
                │                                │
        ┌───────▼────────┐            ┌─────────▼────────┐
        │  Granite Embed  │            │  Granite Embed   │
        │  (Entities)     │            │  (Edges)         │
        └───────┬─────────┘            └─────────┬────────┘
                │                                │
        "name :: kind"               "S <pred> O :: ctx"
                │                                │
                └────────────┬───────────────────┘
                             │
                    ┌────────▼─────────┐
                    │  sqlite-vec      │
                    │  (vec0 table)    │
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼────────┐  ┌──────▼──────┐
│ Entity Search  │  │ Edge Search     │  │  Graph      │
│ "similar to X" │  │ "similar rels"  │  │  Traversal  │
└────────────────┘  └─────────────────┘  └─────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │  Hybrid Results  │
                    │  (RRF Fusion)    │
                    └──────────────────┘
                             │
                (Optional: StructLM reasoning)
                             │
                    ┌────────▼─────────┐
                    │  Final Answer    │
                    └──────────────────┘
```

### Model Selection Summary

| Task | Model | Size | Purpose |
|------|-------|------|---------|
| **Triple Extraction** | SciPhi/Triplex | 3.8B | Extract [s,p,o] from code/docs |
| **Embeddings** | IBM Granite | 125M-278M | Vectorize entities and edges |
| **Query Analysis** | IBM Granite 3.1 2B/8B | 2B-8B | Classify query types for hybrid search |
| **Reasoning (Optional)** | TIGER-Lab/StructLM-7B | 7B (Q4) | Infer missing links, complex queries |

**Resource Requirements:**
- **Minimum (CPU):** Triplex (3.8B) + Granite Embedding (125M) = ~4-5GB RAM
- **Recommended (CPU):** + Granite 3.1 2B for query analysis = ~6-7GB RAM
- **Full Stack (CPU):** + StructLM-7B Q4 = ~10-12GB RAM
- **GPU:** All models run significantly faster with CUDA/Metal acceleration

## Implementation Plan

### Phase 1: Database Setup

#### 1.1 Install sqlite-vec

```bash
# Add to package.json dependencies
npm install sqlite-vec
```

#### 1.2 Extend GraphDatabaseConnection

**File:** `src/lib/graph-database.ts`

```typescript
import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

export class GraphDatabaseConnection {
  private db: Database.Database;
  private vecExtensionLoaded: boolean = false;

  constructor(dbPath: string = 'data/graph_database.sqlite') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    // Load sqlite-vec extension
    this.loadVecExtension();

    // Initialize complete schema
    this.initializeSchema();
  }

  private loadVecExtension(): void {
    try {
      // Find sqlite-vec shared library
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);

      // Platform-specific extension paths
      const platform = process.platform;
      let vecPath: string;

      if (platform === 'darwin') {
        vecPath = resolve(__dirname, '../../node_modules/sqlite-vec/lib/vec0.dylib');
      } else if (platform === 'win32') {
        vecPath = resolve(__dirname, '../../node_modules/sqlite-vec/lib/vec0.dll');
      } else {
        vecPath = resolve(__dirname, '../../node_modules/sqlite-vec/lib/vec0.so');
      }

      // Load extension
      this.db.loadExtension(vecPath);
      this.vecExtensionLoaded = true;

    } catch (error) {
      console.warn('Failed to load sqlite-vec extension:', error);
      console.warn('Semantic search will not be available');
      this.vecExtensionLoaded = false;
    }
  }

  private initializeSchema(): void {
    // 1. Repositories table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        name TEXT,
        indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        version TEXT,
        branch TEXT,
        commit_hash TEXT,
        metadata TEXT,
        embedding_model TEXT
      )
    `);

    // 2. Nodes table (updated with repo column)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        repo TEXT NOT NULL,
        type TEXT,
        name TEXT,
        properties TEXT,
        FOREIGN KEY (repo) REFERENCES repositories(id)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_nodes_repo ON nodes(repo)
    `);

    // 3. Edges table (updated with repo columns)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS edges (
        source TEXT,
        target TEXT,
        source_repo TEXT,
        target_repo TEXT,
        relationship TEXT,
        weight REAL,
        metadata TEXT,
        PRIMARY KEY (source, target, relationship),
        FOREIGN KEY (source) REFERENCES nodes(id),
        FOREIGN KEY (target) REFERENCES nodes(id)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_edges_repos ON edges(source_repo, target_repo)
    `);

    // 4. Cross-references table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cross_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_repo TEXT NOT NULL,
        from_entity TEXT NOT NULL,
        to_repo TEXT NOT NULL,
        to_entity TEXT NOT NULL,
        type TEXT NOT NULL,
        strength REAL,
        context TEXT,
        FOREIGN KEY (from_repo) REFERENCES repositories(id),
        FOREIGN KEY (to_repo) REFERENCES repositories(id)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cross_refs_from
      ON cross_references(from_repo, from_entity)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cross_refs_to
      ON cross_references(to_repo, to_entity)
    `);

    // 5. Embeddings virtual table (only if sqlite-vec loaded)
    if (this.vecExtensionLoaded) {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
            chunk_id TEXT PRIMARY KEY,
            repo TEXT,
            entity_id TEXT,
            chunk_type TEXT,
            content TEXT,
            embedding FLOAT[768],
            metadata TEXT
          )
        `);

        // Indexes for embeddings
        this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_embeddings_repo
          ON embeddings(repo)
        `);

        this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_embeddings_entity
          ON embeddings(entity_id)
        `);

      } catch (error) {
        console.warn('Failed to create embeddings table:', error);
        this.vecExtensionLoaded = false;
      }
    }
  }

  isVecExtensionLoaded(): boolean {
    return this.vecExtensionLoaded;
  }

  // ... rest of existing methods
}
```

### Phase 2: Indexing Pipeline

#### 2.1 Repository Indexer

**File:** `src/lib/repository-indexer.ts` (NEW)

```typescript
import { GraphDatabaseConnection } from './graph-database.js';
import { DocumentProcessor } from './document-processor.js';
import { GraphManager } from './graph-manager.js';
import { EmbeddingManager } from './embedding-manager.js';
import { Logger } from './logger.js';

export interface RepositoryMetadata {
  id: string;           // "vercel/ai"
  name: string;         // "Vercel AI SDK"
  version?: string;     // "3.4.0"
  branch?: string;      // "main"
  commit_hash?: string; // Git commit
  docs_path?: string;   // Path to docs
  language?: string;    // "typescript"
}

export class RepositoryIndexer {
  private db: GraphDatabaseConnection;
  private documentProcessor: DocumentProcessor;
  private graphManager: GraphManager;
  private embeddingManager: EmbeddingManager;
  private logger: Logger;

  constructor(
    db: GraphDatabaseConnection,
    documentProcessor: DocumentProcessor,
    graphManager: GraphManager,
    embeddingManager: EmbeddingManager,
    logger: Logger
  ) {
    this.db = db;
    this.documentProcessor = documentProcessor;
    this.graphManager = graphManager;
    this.embeddingManager = embeddingManager;
    this.logger = logger;
  }

  /**
   * Index a repository
   */
  async indexRepository(
    repoId: string,
    documents: string[],
    metadata: RepositoryMetadata
  ): Promise<void> {
    this.logger.info(`Indexing repository: ${repoId}`);

    // 1. Register repository
    this.registerRepository(repoId, metadata);

    // 2. Process documents into chunks
    const chunks = this.documentProcessor.splitDocuments(documents);
    this.logger.info(`Split into ${chunks.length} chunks`);

    // 3. Extract entities and relationships (graph)
    const elements = await this.documentProcessor.extractElements(chunks);
    const summaries = await this.documentProcessor.summarizeElements(elements);
    this.graphManager.buildGraph(summaries, repoId); // Pass repoId

    // 4. Generate embeddings (semantic)
    if (this.db.isVecExtensionLoaded()) {
      await this.indexEmbeddings(repoId, chunks);
    } else {
      this.logger.warn('Skipping embeddings (sqlite-vec not available)');
    }

    this.logger.info(`Repository ${repoId} indexed successfully`);
  }

  /**
   * Register repository metadata
   */
  private registerRepository(
    repoId: string,
    metadata: RepositoryMetadata
  ): void {
    const stmt = this.db.getSession().prepare(`
      INSERT OR REPLACE INTO repositories
      (id, name, version, branch, commit_hash, metadata, embedding_model)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      repoId,
      metadata.name,
      metadata.version || null,
      metadata.branch || null,
      metadata.commit_hash || null,
      JSON.stringify({
        docs_path: metadata.docs_path,
        language: metadata.language,
      }),
      'granite-125m' // Current embedding model
    );
  }

  /**
   * Index embeddings for all chunks
   */
  private async indexEmbeddings(
    repoId: string,
    chunks: string[]
  ): Promise<void> {
    this.logger.info(`Generating embeddings for ${chunks.length} chunks`);

    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      // Generate embeddings
      const embeddings = await this.embeddingManager.embedBatch(batch);

      // Insert into database
      const stmt = this.db.getSession().prepare(`
        INSERT INTO embeddings
        (chunk_id, repo, entity_id, chunk_type, content, embedding, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (let j = 0; j < batch.length; j++) {
        const chunkId = `${repoId}::chunk::${i + j}`;
        const embedding = embeddings[j];

        stmt.run(
          chunkId,
          repoId,
          null, // entity_id (can be enhanced later)
          'documentation', // chunk_type
          batch[j],
          JSON.stringify(embedding), // sqlite-vec expects JSON array
          JSON.stringify({ chunk_index: i + j })
        );
      }

      this.logger.info(`Indexed embeddings ${i}-${i + batch.length}`);
    }
  }

  /**
   * Build cross-references between repositories
   */
  async buildCrossReferences(repoIds: string[]): Promise<void> {
    this.logger.info('Building cross-repository references');

    // For each pair of repositories
    for (let i = 0; i < repoIds.length; i++) {
      for (let j = i + 1; j < repoIds.length; j++) {
        await this.findCrossReferences(repoIds[i], repoIds[j]);
      }
    }

    this.logger.info('Cross-references built');
  }

  /**
   * Find cross-references between two repositories
   */
  private async findCrossReferences(
    repo1: string,
    repo2: string
  ): Promise<void> {
    // Get all entities from both repos
    const entities1 = this.db.getSession()
      .prepare('SELECT id, name FROM nodes WHERE repo = ?')
      .all(repo1) as { id: string; name: string }[];

    const entities2 = this.db.getSession()
      .prepare('SELECT id, name FROM nodes WHERE repo = ?')
      .all(repo2) as { id: string; name: string }[];

    // Find matching entity names (simple heuristic - can be enhanced)
    const stmt = this.db.getSession().prepare(`
      INSERT OR IGNORE INTO cross_references
      (from_repo, from_entity, to_repo, to_entity, type, strength)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const e1 of entities1) {
      for (const e2 of entities2) {
        // Check if entity names match or are similar
        if (e1.name === e2.name) {
          stmt.run(
            repo1,
            e1.id,
            repo2,
            e2.id,
            'shared_name',
            1.0 // Perfect match
          );
        } else if (
          e1.name.toLowerCase().includes(e2.name.toLowerCase()) ||
          e2.name.toLowerCase().includes(e1.name.toLowerCase())
        ) {
          stmt.run(
            repo1,
            e1.id,
            repo2,
            e2.id,
            'similar_name',
            0.7 // Partial match
          );
        }
      }
    }
  }
}
```

#### 2.2 Update GraphManager

**File:** `src/lib/graph-manager.ts`

Add `repoId` parameter to all methods:

```typescript
buildGraph(summaries: string[], repoId: string): void {
  // ... existing code ...

  // When inserting nodes, include repo
  this.db.insertNode({
    id: `${repoId}::${entityName}`,
    repo: repoId,
    type: 'entity',
    name: entityName,
    properties: { /* ... */ }
  });

  // When inserting edges, include repos
  this.db.insertEdge({
    source: `${repoId}::${source}`,
    target: `${repoId}::${target}`,
    source_repo: repoId,
    target_repo: repoId,
    relationship: rel,
    weight: strength
  });
}
```

### Phase 3: CLI Tool

#### 3.1 CLI Structure

**File:** `src/cli/index.ts` (NEW)

```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import { indexRepository } from './commands/index-repo.js';
import { buildCrossRefs } from './commands/build-cross-refs.js';
import { listRepositories } from './commands/list-repos.js';
import { query } from './commands/query.js';

const program = new Command();

program
  .name('graphrag')
  .description('GraphRAG CLI - Index and query code repositories')
  .version('1.0.0');

// Index a repository
program
  .command('index')
  .description('Index a repository')
  .argument('<repo>', 'Repository ID (e.g., vercel/ai)')
  .option('-n, --name <name>', 'Repository display name')
  .option('-p, --path <path>', 'Local path to repository')
  .option('-b, --branch <branch>', 'Git branch', 'main')
  .action(indexRepository);

// Build cross-references
program
  .command('cross-refs')
  .description('Build cross-repository references')
  .action(buildCrossRefs);

// List indexed repositories
program
  .command('list')
  .description('List indexed repositories')
  .action(listRepositories);

// Query the knowledge base
program
  .command('query')
  .description('Query the knowledge base')
  .argument('<question>', 'Natural language question')
  .option('-r, --repos <repos...>', 'Limit to specific repositories')
  .action(query);

program.parse();
```

#### 3.2 Index Command

**File:** `src/cli/commands/index-repo.ts` (NEW)

```typescript
import { GraphDatabaseConnection } from '../../lib/graph-database.js';
import { DocumentProcessor } from '../../lib/document-processor.js';
import { GraphManager } from '../../lib/graph-manager.js';
import { GraniteEmbeddingProvider, EmbeddingManager } from '../../lib/embedding-manager.js';
import { RepositoryIndexer } from '../../lib/repository-indexer.js';
import { Logger } from '../../lib/logger.js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { createLanguageModel } from '../../providers/factory.js';
import { loadProviderConfigFromEnv } from '../../providers/config.js';

export async function indexRepository(
  repoId: string,
  options: {
    name?: string;
    path?: string;
    branch?: string;
  }
): Promise<void> {
  const logger = new Logger();
  logger.info(`Indexing repository: ${repoId}`);

  // Initialize database
  const db = new GraphDatabaseConnection('.graphrag/database.sqlite');

  // Initialize LLM for entity extraction
  const providerConfig = loadProviderConfigFromEnv();
  const model = createLanguageModel(providerConfig);

  // Initialize embedding provider
  const embeddingProvider = new GraniteEmbeddingProvider(logger);
  await embeddingProvider.initialize();
  const embeddingManager = new EmbeddingManager(embeddingProvider);

  // Initialize processors
  const documentProcessor = new DocumentProcessor(model, logger);
  const graphManager = new GraphManager(db, logger);

  // Initialize indexer
  const indexer = new RepositoryIndexer(
    db,
    documentProcessor,
    graphManager,
    embeddingManager,
    logger
  );

  // Read documents from path
  const repoPath = options.path || `./${repoId.split('/')[1]}`;
  const documents = await readDocuments(repoPath);

  logger.info(`Found ${documents.length} documents`);

  // Index the repository
  await indexer.indexRepository(
    repoId,
    documents,
    {
      id: repoId,
      name: options.name || repoId,
      branch: options.branch,
    }
  );

  logger.info('✓ Repository indexed successfully');
  db.close();
}

async function readDocuments(path: string): Promise<string[]> {
  const documents: string[] = [];

  // Read markdown and text files recursively
  // Note: { recursive: true } requires Node.js v18.17.0+ or v20.1.0+
  const files = await readdir(path, { recursive: true, withFileTypes: true });

  for (const file of files) {
    if (file.isFile() && /\.(md|txt|ts|js|tsx|jsx)$/.test(file.name)) {
      const filePath = join(file.path, file.name);
      const content = await readFile(filePath, 'utf-8');
      documents.push(content);
    }
  }

  return documents;
}
```

### Phase 4: Integration Testing

#### 4.1 Test Script

**File:** `src/cli/commands/test-integration.ts` (NEW)

```typescript
export async function testIntegration(): Promise<void> {
  const logger = new Logger();

  // 1. Test database initialization
  logger.info('Testing database initialization...');
  const db = new GraphDatabaseConnection('.graphrag/test.sqlite');
  logger.info(`✓ sqlite-vec loaded: ${db.isVecExtensionLoaded()}`);

  // 2. Test embedding generation
  logger.info('Testing embedding generation...');
  const embeddingProvider = new GraniteEmbeddingProvider(logger);
  await embeddingProvider.initialize();
  const embedding = await embeddingProvider.embed('test document');
  logger.info(`✓ Embedding dimension: ${embedding.length}`);

  // 3. Test embedding insertion
  logger.info('Testing embedding insertion...');
  const stmt = db.getSession().prepare(`
    INSERT INTO embeddings
    (chunk_id, repo, entity_id, chunk_type, content, embedding, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    'test::chunk::1',
    'test/repo',
    null,
    'test',
    'test document',
    JSON.stringify(embedding),
    '{}'
  );
  logger.info('✓ Embedding inserted');

  // 4. Test vector search
  logger.info('Testing vector search...');
  const queryEmbedding = await embeddingProvider.embed('test query');
  const results = db.getSession().prepare(`
    SELECT
      chunk_id,
      content,
      vec_distance_cosine(embedding, ?) as distance
    FROM embeddings
    WHERE distance < 0.5
    ORDER BY distance ASC
    LIMIT 5
  `).all(JSON.stringify(queryEmbedding));

  logger.info(`✓ Found ${results.length} results`);

  // Cleanup
  db.close();
  logger.info('✓ All tests passed');
}
```

## File Structure

```
src/
├── lib/
│   ├── graph-database.ts         (UPDATED - schema, vec loading)
│   ├── graph-manager.ts          (UPDATED - add repoId)
│   ├── repository-indexer.ts     (NEW - main indexing logic)
│   └── embedding-manager.ts      (EXISTING)
├── cli/
│   ├── index.ts                  (NEW - CLI entry point)
│   └── commands/
│       ├── index-repo.ts         (NEW - index command)
│       ├── build-cross-refs.ts   (NEW - cross-ref command)
│       ├── list-repos.ts         (NEW - list command)
│       ├── query.ts              (NEW - query command)
│       └── test-integration.ts   (NEW - tests)
├── mcp/
│   ├── server.ts                 (EXISTING)
│   ├── tools/
│   │   └── query-engine.ts       (EXISTING - already supports vec)
│   └── attendant/
│       └── granite-micro.ts      (EXISTING)
└── types/
    └── index.ts                  (UPDATED - add new types)
```


## Dependencies to Add

```json
{
  "dependencies": {
    "sqlite-vec": "^0.1.0",
    "commander": "^12.0.0"
  },
  "bin": {
    "graphrag": "./dist/cli/index.js"
  }
}
```

## Usage Flow

### 1. Index Repositories

```bash
# Index Vercel AI SDK
graphrag index vercel/ai \
  --name "Vercel AI SDK" \
  --path ./repos/ai \
  --branch main

# Index AG-UI
graphrag index ag-grid/ag-ui \
  --name "AG-UI" \
  --path ./repos/ag-ui

# Index CoPilotKit
graphrag index copilotkit/copilotkit \
  --name "CoPilotKit" \
  --path ./repos/copilotkit
```

### 2. Build Cross-References

```bash
graphrag cross-refs
```

### 3. Query via CLI

```bash
graphrag query "How do I use streaming with Vercel AI SDK?"
```

### 4. Query via MCP Server

Connect Claude Desktop → uses MCP server → queries local database with vec search

## Testing Strategy

1. **Unit Tests:**
   - Database schema creation
   - sqlite-vec extension loading
   - Embedding insertion/query

2. **Integration Tests:**
   - Full indexing pipeline
   - Cross-reference building
   - Hybrid query (graph + semantic)

3. **E2E Tests:**
   - Index real repository
   - Query through MCP server
   - Verify results

## Migration Path

For existing users:

```typescript
// Migration script
async function migrate() {
  const db = new GraphDatabaseConnection('.graphrag/database.sqlite');

  // Add new columns to existing tables
  db.getSession().exec('ALTER TABLE nodes ADD COLUMN repo TEXT');
  db.getSession().exec('ALTER TABLE edges ADD COLUMN source_repo TEXT');
  db.getSession().exec('ALTER TABLE edges ADD COLUMN target_repo TEXT');

  // Create new tables
  // ... (repositories, cross_references, embeddings)

  // Re-index existing data
  // ...
}
```

## Performance Targets

- **Indexing:** ~1,000 chunks/minute (with embeddings)
- **Query:** <100ms (vector search) + <50ms (graph traversal)
- **Storage:** ~2MB per 1,000 chunks (embeddings + graph)

## Next Steps

1. Install dependencies (sqlite-vec, commander)
2. Update GraphDatabaseConnection with vec loading
3. Create RepositoryIndexer
4. Build CLI tool
5. Test with real repository
6. Update MCP server (already compatible!)
7. Document complete workflow

---

**Ready to implement!** This is the complete architecture for sqlite-vec integration.
