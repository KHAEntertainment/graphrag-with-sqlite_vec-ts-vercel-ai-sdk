# MCP Server Architecture Planning

## Vision

Create a context-efficient MCP (Model Context Protocol) server for GraphRAG that uses **Granite Micro 4.0 (128k context)** as an intelligent "attendant" to provide surgical precision information to coding agents without context pollution.

## The Problem

Traditional RAG systems dump large amounts of retrieved information into the agent's context, which:
- 🔴 **Wastes precious context window space**
- 🔴 **Distracts agents** from their primary task
- 🔴 **Reduces reasoning quality** (more noise = worse performance)
- 🔴 **Costs more** (larger prompts = higher API costs)

## The Solution: Intelligent Attendant Pattern

```
Coding Agent (e.g., Claude, GPT-4)
    ↓
    "I need info about X dependency"
    ↓
MCP Server
    ↓
GraphRAG Query (semantic + graph)
    ↓
Granite Micro "Attendant" (128k context)
    ↓
    - Analyzes full results
    - Filters for relevance
    - Synthesizes concise answer
    - Returns ONLY what's needed
    ↓
Coding Agent receives:
    - Precise information
    - No bloat
    - Ready to use
```

## Key Design Questions

### 1. Attendant Model Selection

**Option A: Granite 4.0 Micro (Recommended)**
- ✅ 128k context window (can see entire graph results)
- ✅ 1.5B params (fast inference)
- ✅ Already in your CLI
- ✅ Good at code understanding
- ✅ Enterprise-focused (stable)

**Option B: Phi-4 Mini**
- ✅ Already in your CLI
- ✅ Strong reasoning
- ❌ Smaller context window
- ✅ Good at synthesis

**Option C: Both (Dynamic Selection)**
- Granite for graph-heavy queries
- Phi-4 for synthesis tasks

**Question:** Which attendant model(s) should we use?

### 2. MCP Server Architecture

#### Option A: Attendant Always Active (Intelligent Filter)
```typescript
async function mcpQuery(request: QueryRequest): Promise<QueryResponse> {
  // 1. Query GraphRAG (full results)
  const graphResults = await graphrag.query(request.query);
  const semanticResults = await embeddings.search(request.query);

  // 2. Send to Granite Micro attendant for filtering
  const attendantPrompt = `
    Agent needs: ${request.query}
    Agent context: ${request.agentContext}

    Full results: ${graphResults} + ${semanticResults}

    Task: Return ONLY the most relevant information for this specific query.
    Be surgical - no extra information.
  `;

  const filtered = await graniteMicro.filter(attendantPrompt);

  // 3. Return concise result
  return { answer: filtered, metadata: { ... } };
}
```

**Pros:**
- Always context-efficient
- Smart filtering
- Adapts to agent's needs

**Cons:**
- Extra latency (one more LLM call)
- Attendant could make mistakes

#### Option B: Attendant On-Demand (Agent Chooses)
```typescript
// MCP exposes two tools:
tools: [
  {
    name: "query_graphrag_raw",
    description: "Get raw GraphRAG results (use for detailed analysis)"
  },
  {
    name: "query_graphrag_filtered",
    description: "Get filtered results via Granite Micro (use for quick facts)"
  }
]
```

**Pros:**
- Agent has control
- Can skip attendant if needed
- More flexible

**Cons:**
- Agent might choose wrong mode
- Defeats "surgical precision" goal

#### Option C: Hybrid (Smart Routing)
```typescript
async function mcpQuery(request: QueryRequest): Promise<QueryResponse> {
  // Determine if attendant is needed
  const resultsSize = estimateSize(graphResults);
  const needsFiltering = resultsSize > threshold || request.mode === 'concise';

  if (needsFiltering) {
    return await withAttendant(graphResults);
  } else {
    return graphResults; // Already small enough
  }
}
```

**Question:** Which architecture pattern makes most sense?

### 3. MCP Tools/Resources to Expose

#### Core Tools

**A. Query Tools**
```typescript
{
  name: "query_dependency",
  description: "Find information about a code dependency",
  parameters: {
    dependency: string;  // e.g., "logger", "database"
    aspect?: string;     // e.g., "usage", "relationships", "implementation"
  }
}

{
  name: "query_similar_code",
  description: "Find similar code patterns or implementations",
  parameters: {
    codeSnippet: string;
    context?: string;
  }
}

{
  name: "query_relationships",
  description: "Explore relationships between entities",
  parameters: {
    entity: string;
    depth?: number;  // How many hops in graph
  }
}
```

**B. Graph Exploration**
```typescript
{
  name: "get_centrality",
  description: "Get most important/connected entities",
  parameters: {
    topN?: number;
  }
}

{
  name: "traverse_graph",
  description: "Walk the dependency graph from a starting point",
  parameters: {
    start: string;
    direction: "dependencies" | "dependents" | "both";
    maxDepth?: number;
  }
}
```

**C. Hybrid Queries**
```typescript
{
  name: "smart_query",
  description: "Ask a natural language question (uses attendant)",
  parameters: {
    question: string;
    maxTokens?: number;  // How much context agent can handle
  }
}
```

**Question:** Which tools are most valuable for coding agents?

### 4. Attendant Prompting Strategy

How should Granite Micro filter results?

**Option A: Task-Aware Filtering**
```typescript
const attendantPrompt = `
You are a coding assistant's research attendant.

Agent's current task: ${agentTask}
Agent's question: ${query}
Agent's context budget: ${maxTokens} tokens

Full GraphRAG results:
${fullResults}

CRITICAL: Return ONLY information directly relevant to the agent's task.
- Remove tangential details
- Prioritize actionable information
- If relationships matter, include them; otherwise omit
- Format for easy consumption

Target: ${maxTokens * 0.8} tokens (leave room for agent's work)
`;
```

**Option B: Relevance Scoring**
```typescript
const attendantPrompt = `
Score each piece of information (0-10) for relevance to: ${query}

Then return only items scoring 8+, ordered by relevance.
`;
```

**Option C: Summarization + Key Facts**
```typescript
const attendantPrompt = `
Provide:
1. One-line summary
2. 3-5 key facts (bullet points)
3. Most relevant relationships (if any)
4. Code examples (if relevant)

Maximum: ${maxTokens} tokens total
`;
```

**Question:** What filtering/synthesis approach works best?

### 5. Context Budget Management

How to ensure we don't bloat the agent's context?

**Option A: Hard Limits**
```typescript
interface QueryOptions {
  maxTokens: number;  // Hard cap on response size
  priority: "breadth" | "depth";  // Favor coverage vs detail
}
```

**Option B: Adaptive Sizing**
```typescript
// Attendant estimates agent's remaining context
// Returns smaller results if agent is "context-heavy"
async function estimateAgentContext(agentState: unknown): Promise<number> {
  // Could integrate with agent's context tracker
}
```

**Option C: Tiered Responses**
```typescript
interface TieredResponse {
  summary: string;        // Always fits in 100 tokens
  details?: string;       // If agent has room
  fullContext?: object;   // For deep dives
}
```

**Question:** How should we manage context budgets?

### 6. Performance Considerations

**Latency:**
```
Standard query: GraphRAG (50-200ms) + Attendant (200-500ms) = 250-700ms
Without attendant: GraphRAG only = 50-200ms

Trade‑off: Slightly slower, but much more useful results
```

**Cost:**
```
Granite Micro 4.0: ~1.5B params
- Local inference: Free, fast (your setup)
- API cost: Minimal (if you host it)

Per query:
- GraphRAG: Free (local embeddings + SQLite)
- Attendant: Free (local Granite Micro)
Total: $0 per query (100% local!)
```

**Question:** Is 200-500ms attendant latency acceptable?

## Proposed Architecture

### High-Level Flow

```text
┌─────────────────────────────────────────────┐
│         Coding Agent (Claude/GPT-4)         │
│         "What uses the logger?"             │
└────────────────┬────────────────────────────┘
                 │ MCP Protocol
         ┌───────▼────────┐
         │   MCP Server   │
         │   (TypeScript) │
         └───────┬────────┘
                 │
         ┌───────▼────────────────────────────┐
         │     Query Orchestrator             │
         │  - Parse intent                    │
         │  - Route to semantic vs graph      │
         │  - Combine results                 │
         └───────┬────────────────────────────┘
                 │
     ┌───────────┴──────────┐
     │                      │
┌────▼─────┐         ┌─────▼──────┐
│Semantic  │         │  Graph     │
│Search    │         │  Query     │
│(Granite  │         │  (Cypher-  │
│Embedding)│         │   like)    │
└────┬─────┘         └─────┬──────┘
     │                     │
     └──────────┬──────────┘
                │
        ┌───────▼────────────────────────────┐
        │   Granite Micro "Attendant"        │
        │   (128k context window)            │
        │                                    │
        │   Tasks:                           │
        │   - Analyze full results           │
        │   - Filter for relevance           │
        │   - Synthesize concise answer      │
        │   - Respect context budget         │
        └───────┬────────────────────────────┘
                │
         ┌──────▼─────────┐
         │  Concise Result│
         │  (Surgical     │
         │   Precision)   │
         └──────┬─────────┘
                │
         ┌──────▼─────────┐
         │  Coding Agent  │
         │  Gets exactly  │
         │  what it needs │
         └────────────────┘
```

### MCP Server Structure

```typescript
// src/mcp/
├── server.ts           // MCP server implementation
├── tools/
│   ├── query-dependency.ts
│   ├── query-similar-code.ts
│   ├── traverse-graph.ts
│   └── smart-query.ts
├── attendant/
│   ├── granite-micro.ts      // Granite Micro integration
│   ├── filter-strategy.ts    // Filtering logic
│   └── context-budget.ts     // Token management
└── orchestrator.ts     // Query routing and coordination
```

## Key Decisions Needed

1. **Attendant Model**: Granite 4.0 Micro only, or support multiple?
2. **Architecture Pattern**: Always-on attendant, on-demand, or hybrid?
3. **MCP Tools**: Which tools are most valuable?
4. **Filtering Strategy**: Task-aware, relevance scoring, or summarization?
5. **Context Management**: Hard limits, adaptive, or tiered?
6. **Latency Tradeoff**: Is 200-500ms attendant overhead acceptable?

## Next Steps (After Discussion)

1. Design MCP protocol schema
2. Implement attendant integration
3. Create filtering strategies
4. Build core MCP tools
5. Test with real coding scenarios
6. Measure context efficiency improvements

---

**Let's discuss these design decisions before implementation!** 🎯
