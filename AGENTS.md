# AGENTS.md

> **📖 Source of Truth:** See [CONSTITUTION.md](./CONSTITUTION.md) for canonical model specifications and architectural invariants.

This file provides guidance to autonomous coding agents (Cursor, Aider, Claude Code, etc.) when working with code in this repository.

## Project Overview

GraphRAG with SQLite is a TypeScript implementation that combines knowledge graphs with dynamic hybrid search. It extracts entities and relationships from code/documentation, stores them in SQLite, and enables sophisticated multi-strategy queries using:
- **Dense search** (semantic embeddings)
- **Sparse search** (BM25 keyword matching)
- **Pattern search** (fuzzy/trigram matching)
- **Graph search** (entity-relationship traversal)

The project runs 100% offline with local models and includes an MCP server for Claude Desktop integration.

## Commands

### Development
```bash
# Run without building (uses tsx)
npm run dev

# Type checking
npm run typecheck

# Run MCP server in development mode
npm run mcp:dev

# Run embedding integration example
npm run examples:embedding
```

### Production
```bash
# Build project
npm run build

# Run built application
npm start

# Run MCP server (production)
npm run mcp
```

### Graph Export
```bash
# Export graph data for D3.js visualization
npm run export

# Then serve the public directory
npx serve public
# or
python -m http.server --directory public 8000
```

## Architecture Overview

### Core Data Flow

```
Documents
   ↓
Triplex Extractor (3.8B)
   ↓ [subject, predicate, object] triples
   ↓
┌──────────────────────┬───────────────────────┐
│ Graph Storage        │ Embedding Layer       │
│ (nodes + edges)      │ (semantic vectors)    │
└──────────────────────┴───────────────────────┘
   ↓
4-Way Hybrid Search:
  - Dense (semantic)
  - Sparse (BM25)
  - Pattern (fuzzy)
  - Graph (relationships)
   ↓
RRF Fusion (LLM-weighted)
   ↓
Results
```

### Database Schema

**Location:** `.graphrag/database.sqlite`

Key tables:
- `nodes` - Graph entities
- `edges` - Graph relationships
- `chunks` - Text content for hybrid search
- `chunks_fts` - FTS5 virtual table for BM25 keyword search
- `chunks_trigram` - Trigram index for fuzzy matching
- `embeddings` - Vector embeddings for entities and edges (sqlite-vec)

### Embedding Generation (Phase 3)

**Core Components:**

**Entity Embedder** (`src/lib/entity-embedder.ts`)
- Generates embeddings for graph entities (nodes)
- Format: `"name :: kind :: hints"`
- Example: `"AuthModule :: class :: Handles authentication, in src/auth/AuthModule.ts"`
- Batch processing: 50 entities per batch
- Transaction-safe storage in `embeddings` table

**Edge Embedder** (`src/lib/edge-embedder.ts`)
- Generates embeddings for graph relationships (edges)
- Format: `"S <predicate> O :: context: ..."`
- Example: `"AuthModule <uses> UserService :: context: AuthModule (class) uses UserService (service), strong relationship"`
- Batch processing: 100 edges per batch
- SQL JOIN for rich context extraction from both endpoints
- Supports cross-repository edges

**Repository Indexer** (`src/lib/repository-indexer.ts`)
- Complete indexing pipeline from source code to embeddings
- Steps:
  1. File scanning (TypeScript, JavaScript, Markdown)
  2. Content chunking (600 chars, 100 overlap)
  3. Entity extraction via DocumentProcessor
  4. Graph building via GraphManager
  5. Entity embedding generation via EntityEmbedder
  6. Edge embedding generation via EdgeEmbedder
- Multi-repository support with repository isolation
- Progress tracking and error resilience

### Hybrid Search System

**Core Concept:** Query analysis determines optimal weights for each search strategy.

**Files:**
- `src/lib/query-analyzer.ts` - LLM-based query classification (6 types)
- `src/lib/reciprocal-rank-fusion.ts` - RRF algorithm for combining scores
- `src/mcp/tools/hybrid-search.ts` - Unified search interface
- `src/mcp/tools/query-engine.ts` - Individual search strategies
- `src/utils/trigram.ts` - Trigram generation for fuzzy matching

**Query Types:**
1. **Conceptual** - Broad questions (high semantic weight)
2. **Identifier** - Specific class/function names (high keyword/pattern weight)
3. **Relationship** - "What uses X?" (high graph weight)
4. **Fuzzy** - Typos/partial matches (high pattern weight)
5. **Pattern** - Regex/code patterns (high pattern weight)
6. **Mixed** - Combination of above

### MCP Server Architecture

**Entry Point:** `src/mcp/server.ts`

**Key Features:**
- Local-first (100% offline)
- Multi-repository support
- Intelligent attendant filtering (Granite 4.0 Micro + optional Gemini 2.5 Pro)
- Dynamic hybrid search integration

**Attendant System:**
- `src/mcp/attendant/granite-micro.ts` - Local filtering with Granite 4.0 Micro
- Automatic escalation to Gemini 2.5 Pro for complex queries

### AI Provider System

**Factory Pattern:** `src/providers/factory.ts`

**Supported Providers:**
- **llamacpp** - Local inference with llama.cpp
- **openai** - OpenAI cloud models
- **dmr** - Docker Model Runner (OpenAI-compatible API) - *Coming Soon*

**Configuration:** `src/providers/config.ts` loads from environment variables

## Canonical Model Specifications

> **⚠️ IMPORTANT:** All model specifications are locked in [CONSTITUTION.md](./CONSTITUTION.md). Refer to that document for:
> - Official model stack (Triplex, Granite Embedding, Granite 4.0 Micro, StructLM-7B)
> - HuggingFace model IDs
> - Resource requirements
> - Fallback strategies

### Quick Reference

| Role | Model | HuggingFace ID |
|------|-------|----------------|
| **Triple Extraction** | SciPhi Triplex | `SciPhi/Triplex` |
| **Embeddings** | IBM Granite Embedding 125M | `ibm-granite/granite-embedding-125m-english` |
| **Query Analysis** | IBM Granite 4.0 Micro | `ibm-granite/granite-4.0-micro` |
| **MCP Attendant** | IBM Granite 4.0 Micro | `ibm-granite/granite-4.0-micro` |
| **Optional Reasoning** | TIGER-Lab StructLM-7B | `TIGER-Lab/StructLM-7B` |

See [CONSTITUTION.md](./CONSTITUTION.md) for complete details, dimensions, and use cases.

## Key Technical Details

### TypeScript Configuration
- **Strict mode enabled** - All strict TypeScript checks active
- **ESM modules** - Uses `"type": "module"` in package.json
- **Node 20+** - Requires Node.js 20 or higher
- **Import extensions** - All imports must use `.js` extension (even for `.ts` files)

### Database Connection
- **File:** `src/lib/graph-database.ts`
- **Pragmas:** Uses WAL mode and foreign keys enforcement
- **Schema initialization:** Automatic on connection
- **FTS5 support:** Graceful degradation if unavailable

### Embedding Integration
- **File:** `src/lib/embedding-manager.ts`
- **Dual embedding strategy:**
  - Entities: Embed node properties
  - Edges: Embed relationship context
- **Batch processing:** Chunks processed in batches of 10

## Important Patterns for Agents

### Error Handling
The codebase uses try-catch blocks with graceful degradation:
```typescript
// Example: FTS5 table creation fails gracefully
try {
  this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts ...`);
} catch (error) {
  console.warn('Failed to create FTS5 table (sparse search unavailable):', error);
}
```

### Database Transactions
Use transactions for bulk operations:
```typescript
const transaction = this.db.transaction(() => {
  for (const chunk of chunks) {
    this.insertChunk(chunk);
  }
});
transaction();
```

### Import Path Convention
Always use `.js` extensions in imports (TypeScript compiles `.ts` to `.js`):
```typescript
import { GraphDatabaseConnection } from '../lib/graph-database.js';
```

### Referencing Constitution in Code Comments
Always reference CONSTITUTION.md in code comments for model-specific implementations:
```typescript
/**
 * Extract triples using SciPhi/Triplex (3.8B)
 *
 * @see CONSTITUTION.md - Model Specifications - Triple Extraction
 */
```

## Agent Development Workflow

### Working with Hybrid Search

1. **Query Classification** happens in `query-analyzer.ts`
2. **Individual searches** execute in parallel via `query-engine.ts`
3. **Fusion** combines results using RRF in `reciprocal-rank-fusion.ts`
4. **Attendant filtering** reduces results to most relevant

### Adding New Search Strategies

1. Add method to `QueryEngine` class (`src/mcp/tools/query-engine.ts`)
2. Update `QueryAnalysis` type in `src/types/query-analysis.ts`
3. Modify `HybridSearchEngine.search()` to include new strategy
4. Update RRF fusion to handle new result type
5. **IMPORTANT:** Verify alignment with CONSTITUTION.md invariants (4-way hybrid search)

### Extending MCP Server Tools

1. Add tool definition to `server.ts` in `list_tools` handler
2. Implement tool logic in `call_tool` handler
3. Update `GraphRAGMCPConfig` interface if configuration needed
4. Test with Claude Desktop or other MCP-compatible clients

### Making Model Changes

**⚠️ CRITICAL:** Model changes require Constitution update first. See [CONSTITUTION.md - Deviation Protocol](./CONSTITUTION.md#deviation-protocol).

1. **Never** hardcode model names - use generic interfaces
2. **Always** document model choice in code comments with Constitution reference
3. **If fallback needed** - Log the fallback event and reason
4. **If proposing new model** - Update CONSTITUTION.md first

## Environment Variables

**Required:**
```bash
AI_PROVIDER=llamacpp|openai|dmr
```

**For llamacpp:**
```bash
LLAMACPP_MODEL_PATH=./models/granite-4.0-micro.gguf
```

**For OpenAI:**
```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

**For DMR (Coming Soon):**
```bash
DMR_API_URL=http://localhost:8080
DMR_MODEL=granite-4.0-micro
```

**Optional:**
```bash
DB_PATH=.graphrag/database.sqlite
LOG_LEVEL=INFO|DEBUG|WARN|ERROR
GRAPHRAG_DEFAULT_ATTENDANT=granite-micro|gemini-2.5-pro
GRAPHRAG_AUTO_ESCALATE=true|false
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-pro
```

## File Organization

### Core Libraries (`src/lib/`)
- `graph-database.ts` - SQLite connection and schema
- `graph-manager.ts` - Graph construction and centrality analysis
- `document-processor.ts` - Document chunking and entity extraction
- `query-handler.ts` - Query processing
- `embedding-manager.ts` - Embedding generation
- `entity-embedder.ts` - Entity embedding generation with "name :: kind :: hints" format
- `edge-embedder.ts` - Edge embedding generation with "S <predicate> O :: context" format
- `repository-indexer.ts` - Complete repository indexing pipeline
- `query-analyzer.ts` - LLM-based query classification
- `reciprocal-rank-fusion.ts` - RRF fusion algorithm
- `logger.ts` - Logging utilities

### MCP Server (`src/mcp/`)
- `server.ts` - Main MCP server
- `tools/hybrid-search.ts` - Unified hybrid search
- `tools/query-engine.ts` - Individual search strategies
- `attendant/granite-micro.ts` - Granite 4.0 Micro and Gemini attendants

### Type Definitions (`src/types/`)
- `index.ts` - Core types (GraphNode, GraphEdge, etc.)
- `embedding.ts` - Embedding types
- `query-analysis.ts` - Query classification types
- `schema.ts` - Zod schemas for validation
- `errors.ts` - Error classes (DatabaseError, EmbeddingError, etc.)
- `database.ts` - Database type definitions

### Utilities (`src/utils/`)
- `trigram.ts` - Trigram generation and fuzzy matching
- `cache.ts` - Caching utilities
- `file-helpers.ts` - File I/O helpers

## Implementation Status

### ✅ Completed Phases

**Phase 1: sqlite-vec Integration** (October 28, 2025)
- ✅ Installed sqlite-vec extension (v0.1.6)
- ✅ Added `embeddings` virtual table with vec0
- ✅ Integrated semantic search into QueryEngine
- See: `docs/.archive/PHASE-1-COMPLETION-SUMMARY.md`

**Phase 2: Core sqlite-vec Integration** (October 28, 2025)
- ✅ Extension loading with graceful fallback
- ✅ Dense search integration
- ✅ Comprehensive test coverage (26/26 tests passing)
- See: `docs/.archive/PHASE-2-COMPLETION-SUMMARY.md`

**Phase 3: Entity & Edge Embedding Generation** (October 28, 2025)
- ✅ EntityEmbedder implementation (277 lines)
- ✅ EdgeEmbedder implementation (364 lines)
- ✅ Repository indexing pipeline (641 lines)
- ✅ Comprehensive testing (69 tests, 90% pass rate)
- ✅ End-to-end integration with sample repository
- See: `docs/.archive/PHASE-3-COMPLETION-SUMMARY.md`

### 🔮 Future Work (Phase 4 Options)

**Phase 4: Legilimens CLI Integration** (Planned - see `docs/planning/PHASE-4-INTEGRATION-PLAN.md`)
- GraphRAG as monorepo workspace package
- Automatic documentation indexing during generation
- CLI commands for GraphRAG management
- Claude Desktop MCP server setup automation
- Agent instruction file generation

**Future Performance & Scalability:**
- Parallel file processing with worker threads
- Incremental indexing with change detection
- Batch embedding API integration
- Memory optimization for large repositories

**Future Advanced Features:**
- DMR (Docker Model Runner) provider integration
- Dynamic embedding dimensions
- Model versioning and migration tools
- Community detection and PageRank
- Temporal queries (git history integration)

**Phase 4D: CLI Tool**
- `graphrag index` command for repositories
- `graphrag query` command with hybrid search
- `graphrag migrate` for embedding model changes
- Optional reasoning with StructLM-7B

**Phase 4E: Quality & Monitoring**
- Embedding quality metrics
- Entity extraction validation
- Performance dashboards
- A/B testing framework

## File Organization Standards

### Documentation Location Rules

**IMPORTANT:** Do NOT create documentation files in the repository root (except CONSTITUTION.md, CLAUDE.md, AGENTS.md, README.md, and governance docs).

**Correct locations:**
- **Architecture/Usage docs:** `docs/` directory
- **Planning documents:** `docs/planning/` directory
- **Historical archives:** `docs/.archive/` directory
- **Governance:** Root level (CONSTITUTION.md, CLAUDE.md, AGENTS.md)
- **README:** `README.md` (root only)

**Examples:**
- ✅ `docs/EMBEDDING-ARCHITECTURE.md` - Current architecture
- ✅ `docs/planning/PHASE-4-INTEGRATION-PLAN.md` - Future plans
- ✅ `docs/.archive/PHASE-1-COMPLETION-SUMMARY.md` - Historical record
- ✅ `CONSTITUTION.md` - Governance (root level)
- ❌ `EMBEDDING-ARCHITECTURE.md` - WRONG (root clutter)
- ❌ `PLANNING.md` - WRONG (belongs in docs/planning/)

### Documentation Lifecycle

1. **Active documentation** - Lives in `docs/`
2. **Future planning** - Lives in `docs/planning/`
3. **Completed phases** - Move to `docs/.archive/`
4. **Superseded docs** - Move to `docs/.archive/` with note

### When to Archive

Archive documents when:
- Feature is implemented (move implementation plan to archive)
- Document is superseded by newer version
- Information is historical context only
- Status changes from "planned" to "complete"

**Keep active:**
- Current architecture documentation
- Usage guides for implemented features
- API references
- Setup/configuration guides

## Agent Best Practices

### Before Starting Work

1. **Read CONSTITUTION.md** - Understand model specs and invariants
2. **Check existing tests** - See how features are tested
3. **Review error types** - Use structured errors from `src/types/errors.ts`
4. **Verify TypeScript config** - Ensure strict mode compliance

### During Implementation

1. **Use type-safe patterns** - No `any` types (enforced by ESLint)
2. **Add comprehensive tests** - Target 90%+ coverage
3. **Document in code comments** - Reference CONSTITUTION.md where relevant
4. **Handle errors gracefully** - Use structured error types
5. **Follow import conventions** - Always use `.js` extensions

### After Implementation

1. **Run tests** - `npm test` (target 90%+ pass rate)
2. **Type check** - `npm run typecheck` (must pass)
3. **Lint** - `npm run lint` (must pass)
4. **Update docs** - If architecture or APIs changed
5. **Commit messages** - Clear, descriptive, reference issues/PRs

## Documentation

**Primary docs location:** `docs/`

**Governance:**
- `CONSTITUTION.md` - **Canonical source of truth** for models and architecture
- `AGENTS.md` - This file (agent guidance)
- `CLAUDE.md` - Claude Code specific guidance

**Current Architecture & Status:**
- `docs/SQLITE-VEC-STATUS-CURRENT.md` - Current implementation status (Phase 1-3 complete)
- `docs/DYNAMIC-HYBRID-SEARCH-INTEGRATION.md` - Hybrid search architecture (fully implemented)
- `docs/EMBEDDING-ARCHITECTURE.md` - Hybrid symbolic + embedding approach
- `docs/EMBEDDING-USAGE.md` - Embedding integration guide
- `docs/EDGE_EMBEDDER_USAGE.md` - Edge embedding details
- `docs/SQLITE-VEC-INTEGRATION-PLAN.md` - Complete sqlite-vec roadmap

**MCP Server:**
- `docs/MCP-QUICKSTART.md` - MCP server setup guide
- `docs/MCP-LOCAL-FIRST-ARCHITECTURE.md` - Local-first design principles
- `docs/MCP-MULTI-REPO-ARCHITECTURE.md` - Multi-repository support details

**Future Planning:**
- `docs/planning/PHASE-4-INTEGRATION-PLAN.md` - Legilimens CLI integration plan

**Historical Archives:**
- `docs/.archive/PHASE-1-COMPLETION-SUMMARY.md` - Phase 1 implementation summary
- `docs/.archive/PHASE-2-COMPLETION-SUMMARY.md` - Phase 2 implementation summary
- `docs/.archive/PHASE-3-COMPLETION-SUMMARY.md` - Phase 3 implementation summary

## Testing

Automated testing with Vitest:
- `npm test` - Run all tests
- `npm test -- tests/lib/entity-embedder.test.ts` - Entity embedder tests (13 tests)
- `npm test -- tests/lib/edge-embedder.test.ts` - Edge embedder tests (17 tests)
- `npm test -- tests/lib/repository-indexer.test.ts` - Repository indexer tests (20 tests)
- `npm test -- tests/integration/embedding-generation-e2e.test.ts` - End-to-end tests (21 tests)

**Test Coverage:**
- 69 tests total (60 unit + 21 integration)
- 90% pass rate (19/21 integration tests passing)
- Sample TypeScript repository fixture for realistic testing

**Manual Testing:**
- `npm run dev` - Run main application
- `npm run examples:embedding` - Test embedding integration
- `npm run mcp:dev` - Test MCP server

## Agent-Specific Notes

### For Cursor / Copilot

- Use `@workspace` context for codebase-wide questions
- Reference CONSTITUTION.md explicitly when making model decisions
- Always run `npm run validate` before committing

### For Aider

- Use `/ask` to clarify architecture before implementing
- Use `/add` to include CONSTITUTION.md in context for model-related changes
- Use `/test` to run test suite after changes

### For Claude Code

- See CLAUDE.md for Claude Code specific guidance
- Use beads (`bd`) for complex multi-step features
- Follow task management workflow in CLAUDE.md

### For Other Agents

- Always read CONSTITUTION.md before making architectural decisions
- Use generic LLM interfaces (don't hardcode model names)
- Add tests for all new features
- Update documentation when adding features
