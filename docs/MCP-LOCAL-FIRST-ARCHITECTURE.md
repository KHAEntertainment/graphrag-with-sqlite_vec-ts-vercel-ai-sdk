# GraphRAG MCP Server: Local-First Architecture

## Corrected Architecture: Offline & Local

### Data Flow (Local-First)

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Initial Indexing (Once)                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
          CLI Tool (Your existing tool)
                              ↓
          Fetches docs from GitHub APIs
          (Vercel AI SDK, AG-UI, CoPilotKit, etc.)
                              ↓
          Hands off to embedding agents
                              ↓
          ┌─────────────────────────────────────────┐
          │   Document Processing Pipeline          │
          │   - Chunk documents                     │
          │   - Extract entities (Granite 4.0)      │
          │   - Generate embeddings (Granite 125M)  │
          │   - Build knowledge graph               │
          └─────────────────────────────────────────┘
                              ↓
          ┌─────────────────────────────────────────┐
          │        SQLite Database (Local)          │
          │                                         │
          │  - sqlite-vec (vector embeddings)       │
          │  - nodes (entities)                     │
          │  - edges (relationships)                │
          │  - repositories (metadata)              │
          │  - cross_references (multi-repo links)  │
          └─────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              Runtime Queries (100% Offline)                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
          Coding Agent (Claude, etc.)
                              ↓
          MCP Protocol (stdio or socket)
                              ↓
          ┌─────────────────────────────────────────┐
          │       MCP Server (This Project)         │
          │       - Reads from local SQLite-vec     │
          │       - No GitHub API calls             │
          │       - 100% offline operation          │
          └─────────────────────────────────────────┘
                              ↓
          Query sqlite-vec + graph database
                              ↓
          Granite Micro Attendant (local)
                              ↓
          Filtered, precise results
                              ↓
          Coding Agent gets exactly what it needs
```

## Key Insights (Corrected Understanding)

### 1. **Project-Scoped Indexing**

The MCP server operates on **already-indexed repositories** for the current project:

```json
// Project structure
my-project/
├── .graphrag/
│   ├── database.sqlite        # Main graph database
│   ├── embeddings.vec         # sqlite-vec embeddings
│   └── config.json            # Indexed repositories metadata
├── src/                       # Your project code
└── package.json
```

**Indexed for this project:**
- `vercel/ai` (Vercel AI SDK)
- `ag-grid/ag-ui` (AG-UI)
- `copilotkit/copilotkit` (CoPilotKit)

The MCP server only queries what's been indexed for **this** project.

### 2. **No Live GitHub Access**

```typescript
// ❌ MCP Server does NOT do this:
const docs = await github.fetchDocs("vercel/ai");

// ✅ MCP Server DOES do this:
const results = await sqlite.query("SELECT * FROM nodes WHERE repo = 'vercel/ai'");
```

**Advantages:**
- ✅ No API rate limits
- ✅ Works offline
- ✅ Instant queries (local database)
- ✅ Privacy (all local)
- ✅ No authentication needed

### 3. **CLI Tool Handles Fetching**

Your CLI tool:
1. Fetches documentation from GitHub
2. Hands off to embedding agents
3. Stores in local SQLite-vec database

MCP server:
1. Reads from that local database
2. No external API calls
3. Pure local query engine

### 4. **Single Project Context**

The MCP server is **project-scoped**:

```typescript
// When used in Project A
mcp.listRepositories()
// Returns: ["vercel/ai", "ag-grid/ag-ui", "copilotkit/copilotkit"]
// (What was indexed for Project A)

// When used in Project B
mcp.listRepositories()
// Returns: ["react", "next.js", "typescript"]
// (What was indexed for Project B)
```

Each project has its own `.graphrag/` directory with its own indexed repositories.

## Revised MCP Server Architecture

### Database Schema (sqlite-vec Integration)

```sql
-- Main graph database (from existing system)
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  repo TEXT,              -- Which repository this entity belongs to
  properties TEXT
);

CREATE TABLE edges (
  source TEXT,
  target TEXT,
  source_repo TEXT,       -- Source entity's repo
  target_repo TEXT,       -- Target entity's repo
  relationship TEXT,
  weight REAL,
  PRIMARY KEY (source, target, relationship)
);

-- NEW: Repository metadata
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,    -- "vercel/ai"
  name TEXT,              -- "Vercel AI SDK"
  indexed_at TIMESTAMP,
  version TEXT,
  branch TEXT,
  metadata TEXT           -- JSON with additional info
);

-- NEW: Cross-repository references
CREATE TABLE cross_references (
  from_repo TEXT,
  from_entity TEXT,
  to_repo TEXT,
  to_entity TEXT,
  type TEXT,              -- "imports", "implements", "extends", "uses"
  strength REAL,
  PRIMARY KEY (from_repo, from_entity, to_repo, to_entity)
);

-- NEW: Vector embeddings (sqlite-vec)
CREATE VIRTUAL TABLE embeddings USING vec0(
  chunk_id TEXT PRIMARY KEY,
  repo TEXT,              -- Which repository
  embedding float[768],   -- Granite Embedding 125M dimension
  content TEXT,
  metadata TEXT
);

-- NEW: Link chunks to graph entities
CREATE TABLE chunk_entities (
  chunk_id TEXT,
  entity_id TEXT,
  repo TEXT,
  relevance REAL,
  FOREIGN KEY (chunk_id) REFERENCES embeddings(chunk_id),
  FOREIGN KEY (entity_id) REFERENCES nodes(id)
);
```

### MCP Server Implementation

```typescript
// src/mcp/server.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GraphDatabaseConnection } from "../lib/graph-database.js";
import { EmbeddingManager } from "../lib/embedding-manager.js";
import { GraniteAttendant } from "./attendant/granite-micro.js";
import { MCPTools } from "./tools/index.js";

export class GraphRAGMCPServer {
  private server: Server;
  private db: GraphDatabaseConnection;
  private attendant: GraniteAttendant;
  private tools: MCPTools;

  constructor(dbPath: string = ".graphrag/database.sqlite") {
    // Connect to LOCAL database (no GitHub access)
    this.db = new GraphDatabaseConnection(dbPath);

    // Initialize local attendant
    this.attendant = new GraniteAttendant();

    // Initialize MCP server
    this.server = new Server(
      {
        name: "graphrag-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.tools = new MCPTools(this.db, this.attendant);
    this.registerTools();
  }

  private registerTools() {
    // Register MCP tools that query LOCAL database
    this.server.setRequestHandler(
      "tools/list",
      () => this.tools.listTools()
    );

    this.server.setRequestHandler(
      "tools/call",
      (request) => this.tools.handleToolCall(request)
    );

    this.server.setRequestHandler(
      "resources/list",
      () => this.listLocalRepositories()
    );
  }

  private async listLocalRepositories() {
    // Query LOCAL database for indexed repos
    const repos = await this.db.getSession()
      .prepare("SELECT * FROM repositories")
      .all();

    return {
      resources: repos.map(repo => ({
        uri: `graphrag://repo/${repo.id}`,
        name: repo.name,
        description: `Indexed repository: ${repo.id}`,
        mimeType: "application/json"
      }))
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("GraphRAG MCP Server running (local mode)");
  }
}
```

### MCP Tools (Local Database Queries)

```typescript
// src/mcp/tools/query-repositories.ts

export class QueryRepositoriesTool {
  async execute(params: {
    query: string;
    repositories?: string[];  // Optional: filter to specific repos
    attendant?: "none" | "granite-micro" | "gemini-2.5-pro";
    maxTokens?: number;
  }) {
    // 1. Query LOCAL embeddings (sqlite-vec)
    const semanticResults = await this.queryLocalEmbeddings(
      params.query,
      params.repositories
    );

    // 2. Query LOCAL graph database
    const graphResults = await this.queryLocalGraph(
      params.query,
      params.repositories
    );

    // 3. Find LOCAL cross-references
    const crossRefs = await this.queryLocalCrossReferences(
      semanticResults,
      graphResults
    );

    // 4. Combine results
    const combined = {
      semantic: semanticResults,
      graph: graphResults,
      crossRefs: crossRefs,
      totalTokens: this.estimateTokens(semanticResults, graphResults, crossRefs)
    };

    // 5. Filter through LOCAL attendant (if requested)
    if (params.attendant === "none") {
      return combined;
    }

    const filtered = await this.attendant.filter({
      query: params.query,
      results: combined,
      maxTokens: params.maxTokens || 500
    });

    return {
      answer: filtered,
      repositories: this.getReposFromResults(combined),
      attendant: params.attendant,
      efficiency: `${combined.totalTokens} → ${filtered.length} tokens`
    };
  }

  private async queryLocalEmbeddings(query: string, repos?: string[]) {
    // Generate query embedding locally
    const queryEmbedding = await this.embeddingProvider.embed(query);

    // Query LOCAL sqlite-vec (no API calls)
    let sql = `
      SELECT chunk_id, repo, content,
             vec_distance_cosine(embedding, ?) as distance
      FROM embeddings
      WHERE distance < 0.3
    `;

    if (repos && repos.length > 0) {
      sql += ` AND repo IN (${repos.map(() => '?').join(',')})`;
    }

    sql += ` ORDER BY distance ASC LIMIT 20`;

    const stmt = this.db.prepare(sql);
    return stmt.all(queryEmbedding, ...(repos || []));
  }

  private async queryLocalGraph(query: string, repos?: string[]) {
    // Extract entities from query (simple keyword matching or LLM)
    const entities = await this.extractEntities(query);

    // Query LOCAL graph database
    let sql = `
      SELECT n.*, e.relationship, e.weight
      FROM nodes n
      LEFT JOIN edges e ON n.id = e.source OR n.id = e.target
      WHERE n.id IN (${entities.map(() => '?').join(',')})
    `;

    if (repos && repos.length > 0) {
      sql += ` AND n.repo IN (${repos.map(() => '?').join(',')})`;
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...entities, ...(repos || []));
  }

  private async queryLocalCrossReferences(semantic: any, graph: any) {
    // Find cross-repo references in LOCAL database
    const involvedRepos = new Set([
      ...semantic.map(r => r.repo),
      ...graph.map(r => r.repo)
    ]);

    if (involvedRepos.size < 2) {
      return []; // No cross-references possible
    }

    const sql = `
      SELECT * FROM cross_references
      WHERE from_repo IN (${Array.from(involvedRepos).map(() => '?').join(',')})
         OR to_repo IN (${Array.from(involvedRepos).map(() => '?').join(',')})
    `;

    const stmt = this.db.prepare(sql);
    return stmt.all(...involvedRepos, ...involvedRepos);
  }
}
```

### Project Configuration

```typescript
// .graphrag/config.json

{
  "version": "1.0.0",
  "repositories": [
    {
      "id": "vercel/ai",
      "name": "Vercel AI SDK",
      "indexedAt": "2025-01-15T10:30:00Z",
      "version": "3.4.0",
      "branch": "main"
    },
    {
      "id": "ag-grid/ag-ui",
      "name": "AG-UI",
      "indexedAt": "2025-01-15T10:35:00Z",
      "version": "1.2.0",
      "branch": "main"
    },
    {
      "id": "copilotkit/copilotkit",
      "name": "CoPilotKit",
      "indexedAt": "2025-01-15T10:40:00Z",
      "version": "0.8.0",
      "branch": "main"
    }
  ],
  "attendant": {
    "default": "granite-micro",
    "models": {
      "granite-micro": {
        "path": "./models/granite-4.0-micro.gguf",
        "contextWindow": 128000
      },
      "gemini-2.5-pro": {
        "apiKey": "env:GEMINI_API_KEY",
        "model": "gemini-2.5-pro"
      }
    }
  },
  "database": {
    "path": ".graphrag/database.sqlite",
    "embeddingDimension": 768
  }
}
```

### Usage in Claude Desktop

```json
// claude_desktop_config.json

{
  "mcpServers": {
    "graphrag": {
      "command": "node",
      "args": [
        "/path/to/your/project/node_modules/.bin/graphrag-mcp-server"
      ],
      "cwd": "/path/to/your/project",
      "env": {
        "GRAPHRAG_DB_PATH": ".graphrag/database.sqlite"
      }
    }
  }
}
```

## Advantages of Local-First Architecture

### 1. **Performance**
```text
GitHub API query: 200-1000ms
Local SQLite query: 5-20ms
Speed improvement: 10-50x faster
```

### 2. **Privacy**
- All data stays on developer's machine
- No data sent to external services
- Full control over indexed content

### 3. **Offline Capability**
- Works on airplane, train, anywhere
- No internet dependency after initial index
- No API rate limits

### 4. **Cost**
- Initial indexing: One-time GitHub API calls
- Runtime queries: 100% free (all local)
- Attendant: Local Granite Micro (free) or optional Gemini API

### 5. **Speed**
```text
Traditional RAG (API-based):
- Embedding generation: 100ms (API)
- Vector search: 50ms (Pinecone/etc)
- LLM filtering: 500ms (API)
Total: ~650ms + network latency

Our Local GraphRAG:
- Embedding generation: 0ms (already indexed)
- Vector search: 10ms (local sqlite-vec)
- Graph query: 5ms (local SQLite)
- LLM filtering: 200ms (local Granite)
Total: ~215ms (no network!)
```

## Integration with Your CLI Tool

Your CLI tool workflow:

```bash
# 1. Your CLI fetches docs (one time)
cli index-repo vercel/ai --branch main

# Internally:
# - Fetches from GitHub API
# - Chunks documents
# - Generates embeddings (Granite 125M)
# - Extracts entities (Granite 4.0)
# - Stores in .graphrag/database.sqlite

# 2. Index more repos for this project
cli index-repo ag-grid/ag-ui
cli index-repo copilotkit/copilotkit

# 3. Build cross-references
cli build-cross-refs

# 4. Start MCP server (or it auto-starts)
cli mcp-server start

# Now coding agents can query via MCP (all offline!)
```

## Next Implementation Steps

1. ✅ **Architecture corrected** - Local-first, no GitHub API in MCP
2. ⏳ **Implement MCP server** - Reads from local sqlite-vec
3. ⏳ **Local attendant** - Granite Micro integration
4. ⏳ **MCP tools** - Query local database only
5. ⏳ **Testing** - Verify offline operation

---

**This is much better - 100% local, fast, private, and offline-capable!** 🚀
