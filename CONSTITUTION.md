# GraphRAG Constitution

**Version:** 1.0.0
**Last Updated:** November 2, 2025
**Status:** Canonical Source of Truth

---

## Purpose

This document serves as the **canonical source of truth** for all architectural decisions, model specifications, and core principles governing the GraphRAG project. All other documentation (`CLAUDE.md`, `AGENTS.md`, planning docs, etc.) must align with and reference this document.

**When in doubt, this document takes precedence.**

---

## Core Principles

### 1. Local-First Architecture
- **100% offline operation** - All core functionality works without internet
- Local models via llama.cpp for LLM operations
- Local embedding models via Transformers.js
- Optional API fallback for complex queries (Gemini 2.5 Pro)

### 2. Multi-Strategy Retrieval
- **4-way hybrid search** (Dense + Sparse + Pattern + Graph)
- Dynamic query-based weighting via LLM analysis
- Reciprocal Rank Fusion (RRF) for result combination
- Transparent ranking explanations

### 3. Knowledge Graph First
- Graph relationships are first-class citizens
- Triple extraction from all sources
- Both entities AND edges are embedded
- Cross-repository relationship discovery

### 4. Type Safety & Quality
- Strict TypeScript mode enforced
- Comprehensive error handling
- Structured error types with context
- 90%+ test coverage target

---

## Model Specifications

### Official Model Stack

> **IMPORTANT:** These are the ONLY models approved for the MVP. Any deviation requires updating this document first.

| **Role** | **Model** | **HuggingFace ID** | **Size** | **Dimensions** | **Status** |
|----------|-----------|-------------------|----------|----------------|------------|
| **Triple Extraction** | SciPhi Triplex | `SciPhi/Triplex` | 3.8B (Phi-3) | N/A | ✅ **PRIMARY** |
| **Embeddings** | IBM Granite Embedding | `ibm-granite/granite-embedding-125m-english` | 125M | 768 | ✅ **PRIMARY** |
| **Query Analysis** | IBM Granite 4.0 Micro | `ibm-granite/granite-4.0-micro` | ~3B | N/A | ✅ **PRIMARY** |
| **MCP Attendant** | IBM Granite 4.0 Micro | `ibm-granite/granite-4.0-micro` | ~3B | N/A | ✅ **PRIMARY** (shared) |
| **Advanced Reasoning** | TIGER-Lab StructLM-7B | `TIGER-Lab/StructLM-7B` | 7B (Q4 quant) | N/A | 📋 **OPTIONAL** |

### Model Roles Explained

#### Triple Extraction: SciPhi/Triplex
**Purpose:** Extract structured knowledge graph triples from unstructured text

**Why This Model:**
- Fine-tuned Phi-3 specifically for KG extraction
- Produces high-quality [subject, predicate, object] triples
- Excellent understanding of code structure and documentation
- Efficient on consumer hardware (3.8B)

**Input Format:**
```typescript
// Raw code or documentation
const input = `
  export function useChat() {
    return new StreamingTextResponse(...);
  }
`;
```

**Output Format:**
```typescript
{
  subject: "useChat",
  predicate: "returns",
  object: "StreamingTextResponse",
  context: "Hook returns StreamingTextResponse for chat streaming",
  strength: 0.9
}
```

**Fallback:** If Triplex underperforms, fall back to Granite 4.0 Micro with custom extraction prompts.

#### Embeddings: IBM Granite Embedding 125M
**Purpose:** Vectorize entities and edges for semantic similarity search

**Why This Model:**
- Optimized for code and technical documentation
- Good balance of quality vs. resource usage (125M params)
- Produces 768-dimensional embeddings (standard size)
- Fast inference on CPU and GPU

**Dual Embedding Strategy:**

**Entity Embeddings:**
```typescript
// Format: "name :: kind :: hints"
const entityText = "AuthModule :: class :: Handles authentication, in src/auth/AuthModule.ts";
const embedding = await granite.embed(entityText); // → Float[768]
```

**Edge Embeddings:**
```typescript
// Format: "S <predicate> O :: context:..."
const edgeText = "AuthModule <uses> UserService :: context: AuthModule (class) uses UserService (service), strong relationship";
const embedding = await granite.embed(edgeText); // → Float[768]
```

**Storage:** All embeddings stored in `embeddings` virtual table (sqlite-vec)

#### Query Analysis & MCP Attendant: IBM Granite 4.0 Micro
**Purpose:**
1. **Query Analysis** - Classify user queries and determine optimal search strategy weights
2. **MCP Attendant** - Filter and prioritize search results for surgical precision

**Why This Model:**
- Excellent at classification and structured reasoning
- 128k context window (handles large result sets)
- Fast inference (~3B parameters)
- Single model for two roles (efficiency)

**Query Analysis Example:**
```typescript
// Input: "Find StreamingTextResponse"
// Analysis:
{
  query_type: "identifier",
  weights: {
    dense: 0.2,
    sparse: 0.3,
    pattern: 0.4,
    graph: 0.1
  },
  confidence: 0.9
}
```

**Attendant Filtering Example:**
```typescript
// Input: 500 search results (10,000 tokens)
// Output: Filtered to 8 most relevant results (500 tokens)
// Reduction: 95%
```

**No Alternative:** Granite 4.0 Micro is the canonical model for these roles.

#### Optional Reasoning: StructLM-7B
**Purpose:** Advanced graph reasoning, link prediction, complex queries

**When to Use:**
- After KG is built with Triplex
- Complex multi-hop queries
- Link inference ("What connections might exist?")
- Graph completion tasks

**Not Used For:**
- Real-time retrieval (too slow)
- Primary query answering
- Entity extraction

---

## Architectural Invariants

### These Must Never Change Without Consensus

1. **4-Way Hybrid Search**
   - Dense (semantic via embeddings)
   - Sparse (keyword via FTS5 BM25)
   - Pattern (fuzzy via trigrams + Levenshtein)
   - Graph (relationships via traversal)

2. **Triple Format**
   - Subject, Predicate, Object
   - Optional context and strength
   - Extracted via Triplex (or fallback LLM)

3. **Embedding Dimensions**
   - 768 dimensions (Granite Embedding 125M)
   - Stored as `FLOAT[768]` in sqlite-vec
   - Fixed dimension (no dynamic sizing)

4. **Database Schema**
   - Single SQLite database (`.graphrag/database.sqlite`)
   - Migration-based schema evolution
   - Foreign key constraints enforced
   - WAL mode enabled

5. **Type Safety**
   - Strict TypeScript mode
   - No `any` types allowed (ESLint enforced)
   - Explicit return types required
   - Zod validation for LLM outputs

---

## Implementation Guidelines

### For AI Coding Agents

When implementing features, always:

1. **Check This Document First**
   - Verify model choices match this spec
   - Confirm architectural decisions align
   - Reference this doc in code comments

2. **Use Exact Model IDs**
   ```typescript
   // ✅ CORRECT
   const TRIPLEX_MODEL = "SciPhi/Triplex";
   const GRANITE_EMBEDDING = "ibm-granite/granite-embedding-125m-english";
   const GRANITE_MICRO = "ibm-granite/granite-4.0-micro";

   // ❌ WRONG
   const model = "triplex-3.8b"; // Too vague
   const embedding = "granite-125m"; // Missing namespace
   ```

3. **Maintain Dual Embedding Strategy**
   - Always embed BOTH entities and edges
   - Use specified format strings
   - Store in same `embeddings` table

4. **Never Skip Error Handling**
   - Use structured error types from `src/types/errors.ts`
   - Provide context metadata
   - Log with appropriate severity

5. **Reference Constitution in Comments**
   ```typescript
   /**
    * Extract triples using SciPhi/Triplex (3.8B)
    *
    * @see CONSTITUTION.md - Model Specifications
    */
   ```

---

## Resource Requirements

### Minimum (MVP Testing)

**CPU-Only Setup:**
```
- Triplex (3.8B): ~4GB RAM
- Granite Embedding (125M): ~500MB RAM
- Granite 4.0 Micro (3B): ~3GB RAM
- System overhead: ~2GB
---
Total: ~9-10GB RAM
```

**Recommended:**
- MacBook Pro M1/M2/M3 with 16GB+ RAM
- Linux workstation with 16GB+ RAM
- Metal/CUDA acceleration for embeddings

### With Optional StructLM-7B

**CPU-Only Setup (Q4 Quantization):**
```
- Above minimum: ~9-10GB
- StructLM-7B (Q4): ~4-5GB
---
Total: ~14-15GB RAM
```

---

## Resource Management

### Resource Guard System

**Status:** Canonical architectural feature for efficient resource utilization

> **📖 Full Specification:** See [docs/planning/RESOURCE-GUARD-SYSTEM.md](./docs/planning/RESOURCE-GUARD-SYSTEM.md)

The **Resource Guard System** provides intelligent container lifecycle management for DMR-based deployments, enabling GraphRAG to run efficiently on developer machines with limited RAM (16-32GB) by automatically orchestrating model container start/stop operations based on workload requirements.

#### Core Concept

GraphRAG uses 4 different AI models (Triplex, Granite Embedding, Granite 4.0 Micro, optional StructLM) totaling ~10.5GB RAM. The Resource Guard System ensures only required models are loaded at any given time, reducing peak RAM usage by up to 70% without sacrificing functionality.

#### Resource Modes

**Mode 1: Standard** (64GB+ RAM)
- All containers run continuously
- No automatic orchestration
- Maximum performance, zero latency
- Peak RAM: ~10.5GB

**Mode 2: Efficiency** (16-32GB RAM) - **Default**
- Maximum 2 models loaded simultaneously
- Automatic start/stop based on operation type
- 70% RAM reduction vs. Standard
- Peak RAM: ~3GB

**Mode 3: Ultra-Efficient** (8-16GB RAM)
- Only Granite Embedding runs locally (~500MB)
- Triplex + Granite 4.0 Micro use cloud APIs (HuggingFace Inference)
- 95% RAM reduction vs. Standard
- Peak RAM: ~500MB local + cloud API costs

#### Operation-Based Orchestration

**Efficiency Mode Container States:**

| Operation | Running Containers | RAM Usage |
|-----------|-------------------|-----------|
| **Indexing** | Triplex + Granite Embedding | ~3GB |
| **Query** | Granite 4.0 Micro + Granite Embedding | ~3GB |
| **Idle** | Granite 4.0 Micro (MCP attendant) | ~2.5GB |

**Ultra-Efficient Mode:**
- Granite Embedding always local (required for both indexing and query)
- Heavy models (Triplex, Granite 4.0 Micro) routed to cloud APIs
- Automatic fallback to local if cloud unavailable

#### Configuration

**Environment Variables:**
```bash
# Resource mode selection
DMR_RESOURCE_MODE=efficiency  # standard | efficiency | ultra-efficient

# Container configuration
DMR_CONTAINER_STARTUP_TIMEOUT=30000  # milliseconds
DMR_CONTAINER_SHUTDOWN_TIMEOUT=10    # seconds

# Cloud hybrid configuration (ultra-efficient mode)
HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxx
DMR_CLOUD_ROUTED_MODELS=SciPhi/Triplex,ibm-granite/granite-4.0-micro
```

#### Performance Targets

| Metric | Target |
|--------|--------|
| Peak RAM (Efficiency) | ≤ 3GB |
| Idle RAM | ≤ 2.5GB |
| Peak RAM (Ultra-Efficient) | ≤ 500MB |
| Container Startup Time | < 10 seconds |
| Container Shutdown Time | < 5 seconds |
| Transition Time (Operation Switch) | < 15 seconds |

#### Architectural Integration

**Core Components:**
- `src/lib/resource-guard/manager.ts` - Central orchestration
- `src/lib/resource-guard/container-controller.ts` - Docker lifecycle management (dockerode)
- `src/lib/resource-guard/health-checker.ts` - Container health verification

**Integration Points:**
- `src/lib/repository-indexer.ts` - Ensures indexing models before operations
- `src/mcp/tools/query-engine.ts` - Ensures query models before searches
- `src/mcp/server.ts` - Initializes Resource Guard, handles graceful shutdown

#### API Example

```typescript
import { ResourceGuardManager } from './lib/resource-guard/manager.js';

// Initialize with mode
const resourceGuard = new ResourceGuardManager('efficiency');

// Before indexing operation
await resourceGuard.ensureModelsForOperation('indexing');
// → Triplex + Granite Embedding now running

// Perform indexing
await repositoryIndexer.indexRepository('./my-repo');

// After indexing, transition to idle
await resourceGuard.transitionToIdle();
// → Triplex stopped, Granite 4.0 Micro started (MCP ready)

// Before query operation
await resourceGuard.ensureModelsForOperation('query');
// → Granite 4.0 Micro + Granite Embedding verified running

// Graceful shutdown
await resourceGuard.shutdown();
// → All containers stopped cleanly
```

#### Design Principles

1. **Automatic Orchestration** - No manual container management required
2. **Operation-Aware** - Container state matches workload requirements
3. **Graceful Transitions** - Health checks ensure models ready before operations
4. **Mode Flexibility** - Single environment variable switches between modes
5. **Cloud Hybrid Support** - Seamless local/cloud mixing in ultra-efficient mode

#### Resource Mode Selection

**Decision Tree:**
```
Available RAM for GraphRAG?
├─ 10GB+ → Use Standard Mode (maximum performance)
├─ 5-10GB → Use Efficiency Mode (default, 70% RAM reduction)
└─ < 5GB → Use Ultra-Efficient Mode (95% RAM reduction, cloud hybrid)
```

#### Invariants

**These Must Be Maintained:**
1. Granite Embedding ALWAYS runs locally (required for both indexing and query)
2. Maximum 2 containers in Efficiency Mode, 1 in Ultra-Efficient Mode
3. Transitions complete within 15 seconds or throw timeout error
4. Health checks verify model availability before marking ready
5. Graceful shutdown stops all containers before exit

#### Cost Estimates (Ultra-Efficient Mode)

**HuggingFace Inference API (as of Nov 2025):**
- Small repo (~1000 files): ~$0.02
- Medium repo (~5000 files): ~$0.10
- Large repo (~20000 files): ~$0.50

**Monthly estimates:**
- Light dev (1-2 repos): Free (under 100K token tier)
- Moderate dev (5-10 repos): $0.50 - $2.00
- Heavy dev (20+ repos): $5.00 - $15.00

#### Implementation Status

**Status:** Planning Phase (Full SDP/PRP completed)
**Dependencies:** DMR Integration Plan (Phase 1-2 required)
**Timeline:** 9-14 days implementation (5 phases)
**Priority:** High (developer accessibility feature)

**References:**
- Full specification: `docs/planning/RESOURCE-GUARD-SYSTEM.md`
- DMR integration: `docs/planning/DMR-INTEGRATION-PLAN.md`
- Model specifications: This document (Resource Requirements section)

---

## Documentation Hierarchy

All documentation must reference this Constitution and maintain consistency.

### 1. **CONSTITUTION.md** (This File)
   - **Role:** Canonical source of truth
   - **Audience:** All developers, AI agents, maintainers
   - **Updates:** Require consensus and version bump

### 2. **CLAUDE.md**
   - **Role:** Guidance for Claude Code AI
   - **Audience:** Claude Code, coding agents
   - **Must Align:** Model specs, architecture, commands
   - **Reference:** Link to Constitution at top

### 3. **AGENTS.md** (To Be Created)
   - **Role:** Agent-specific instructions and workflows
   - **Audience:** Autonomous coding agents (Cursor, Aider, etc.)
   - **Must Align:** All implementation details
   - **Reference:** Link to Constitution at top

### 4. **README.md**
   - **Role:** User-facing quick start
   - **Audience:** End users, new contributors
   - **Alignment:** High-level model recommendations
   - **Reference:** Link to Constitution for details

### 5. **docs/**
   - **Role:** Detailed technical documentation
   - **Audience:** Developers, integrators
   - **Alignment:** All model specs, architecture decisions
   - **Reference:** Link to Constitution where relevant

---

## Deviation Protocol

### When You Need to Diverge

If you believe a change to models or architecture is needed:

1. **Document the Reason**
   - What problem does it solve?
   - Why can't current spec handle it?
   - What are the tradeoffs?

2. **Propose in Issue/PR**
   - Create GitHub issue for discussion
   - Tag with `constitution-change`
   - Await consensus

3. **Update Constitution First**
   - Get PR approved for Constitution change
   - Version bump (e.g., 1.0.0 → 1.1.0)
   - Then update dependent docs

4. **Cascade Updates**
   - Update CLAUDE.md
   - Update AGENTS.md
   - Update relevant docs/
   - Update code comments

### Emergency Fallbacks

If a model fails or is unavailable:

**Triplex Extraction → Granite 4.0 Micro**
- Use custom extraction prompts
- Maintain triple format
- Document as fallback in logs

**Granite Embedding → Nomic Embed Text v1.5**
- Alternative: 768 dimensions, general-purpose
- Requires re-embedding all entities/edges
- Document model change in DB metadata

**Granite 4.0 Micro → API Fallback (Gemini 2.5 Pro)**
- Only for MCP Attendant role
- Query Analysis should retry or use heuristic fallback
- Log API usage for cost tracking

---

## Future Enhancements

### Planned Provider Additions

**Docker Model Runner (DMR) Provider** - *Documentation Only*
- OpenAI-compatible API for Docker-based model serving
- **Adds DMR as an additional provider option** alongside llamacpp and OpenAI
- Enables Legilimens CLI to use DMR for its deployment model
- Maintains same model stack (Triplex, Granite Embedding, Granite 4.0 Micro)
- Implementation: Straightforward OpenAI SDK adapter with custom base URL
- Configuration: `AI_PROVIDER=dmr`, `DMR_BASE_URL`, and model-specific environment variables
- Status: Planned for CLI integration
- **Does NOT deprecate llamacpp** - both remain fully supported as equal provider options

**Provider Architecture (After DMR Integration):**
- **llamacpp** - Local inference with GGUF models (fully supported)
- **openai** - Cloud API via OpenAI (fully supported)
- **dmr** - Docker-based local inference (fully supported)

This provider addition does **not** affect the canonical model stack defined in this document.

---

## Version History

### 1.0.0 (November 2, 2025)
- Initial constitution
- Locked model specs:
  - Triplex for triple extraction
  - Granite Embedding 125M for embeddings
  - Granite 4.0 Micro for query analysis and attendant
  - StructLM-7B as optional reasoning
- Established 4-way hybrid search as invariant
- Defined documentation hierarchy
- Created deviation protocol

---

## Quick Reference Card

**For AI Agents - Copy/Paste This Into Prompts:**

```
Model Stack (CONSTITUTION.md v1.0.0):
- Triple Extraction: SciPhi/Triplex (3.8B)
- Embeddings: ibm-granite/granite-embedding-125m-english (768d)
- Query Analysis: ibm-granite/granite-4.0-micro
- MCP Attendant: ibm-granite/granite-4.0-micro (shared)
- Optional Reasoning: TIGER-Lab/StructLM-7B (Q4)

Invariants:
- 4-way hybrid search (Dense, Sparse, Pattern, Graph)
- Dual embedding (entities + edges)
- Triple format: [subject, predicate, object, context, strength]
- 768-dimensional embeddings
- Strict TypeScript, no `any` types

When in doubt: Check CONSTITUTION.md first.
```

---

**END OF CONSTITUTION v1.0.0**