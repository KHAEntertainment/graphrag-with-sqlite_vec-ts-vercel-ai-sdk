# GraphRAG MCP Server: Enhanced Multi-Repository Architecture

## Vision: Beyond DeepWiki

### DeepWiki Limitations
- ❌ **One repository at a time** - Can't see cross-project relationships
- ❌ **Pure semantic RAG** - No graph relationships
- ❌ **No attendant** - Dumps all results into context
- ❌ **Fixed intelligence** - Can't escalate to more powerful models

### Our Advantages
- ✅ **Multi-repository indexing** - Index entire ecosystems together
- ✅ **GraphRAG** - Semantic + relationship understanding
- ✅ **Intelligent attendant** - Granite Micro filters for precision
- ✅ **Escalation paths** - Gemini 2.5 Pro when needed
- ✅ **Cross-project relationships** - Understand how projects interact

## Use Case: Vercel AI SDK + AG-UI + CoPilotKit

### With DeepWiki (Limited)
```typescript
// Must query each separately
const vercelDocs = await deepwiki.ask("vercel-ai-sdk", "How do I stream?");
const agDocs = await deepwiki.ask("ag-ui", "How do I integrate streaming?");
const copilotDocs = await deepwiki.ask("copilotkit", "How do I use with AG?");

// Developer manually correlates the information
// No understanding of relationships between projects
```

### With Our GraphRAG MCP (Superior)
```typescript
// Query across all three projects at once
const result = await graphrag.smartQuery({
  query: "How do I use Vercel AI SDK streaming with AG-UI and CoPilotKit together?",
  repositories: ["vercel/ai", "ag-grid/ag-ui", "copilotkit/copilotkit"],
  attendant: "granite-micro"  // Or "gemini-2.5-pro" for complex reasoning
});

// Returns:
// - How all three projects interact
// - Cross-project dependencies
// - Integration patterns
// - Version compatibility
// - Code examples from all three
```

## MCP Server Architecture

### Modeled After DeepWiki, But Better

```typescript
// DeepWiki Tools (Limited)
tools: [
  "ask_question",           // One repo at a time
  "read_wiki_contents",     // Static docs
  "read_wiki_structure"     // File tree
]

// Our GraphRAG Tools (Enhanced)
tools: [
  // Core query tools
  "query_repositories",     // Multi-repo semantic + graph query
  "query_dependency",       // Dependency analysis (single or multi-repo)
  "query_relationships",    // Cross-project relationships
  "traverse_graph",         // Walk dependency trees

  // Advanced tools
  "query_integration",      // How projects work together
  "query_compatibility",    // Version compatibility checks
  "smart_query",           // Natural language with attendant

  // Exploration tools
  "get_centrality",        // Most important entities across repos
  "list_repositories",     // Show indexed repos
  "get_cross_references"   // Find cross-project references
]
```

## Multi-Repository Indexing

### Repository Index Structure

```typescript
interface RepositoryIndex {
  repositories: Repository[];
  crossReferences: CrossReference[];
  sharedDependencies: Dependency[];
}

interface Repository {
  id: string;                    // "vercel/ai"
  name: string;                  // "Vercel AI SDK"
  indexed: Date;
  graph: KnowledgeGraph;         // Entities + relationships
  embeddings: EmbeddingIndex;    // Semantic search
  metadata: {
    version: string;
    mainBranch: string;
    language: string[];
  };
}

interface CrossReference {
  from: { repo: string; entity: string };
  to: { repo: string; entity: string };
  type: "imports" | "implements" | "extends" | "uses";
  strength: number;
}
```

### Example: Vercel AI SDK + AG-UI + CoPilotKit Index

```json
{
  repositories: [
    {
      id: "vercel/ai",
      graph: {
        entities: ["StreamingTextResponse", "useChat", "generateText", ...],
        relationships: [...]
      }
    },
    {
      id: "ag-grid/ag-ui",
      graph: {
        entities: ["AgentRuntime", "StreamHandler", ...],
        relationships: [...]
      }
    },
    {
      id: "copilotkit/copilotkit",
      graph: {
        entities: ["useCopilotChat", "CopilotRuntime", ...],
        relationships: [...]
      }
    }
  ],

  crossReferences: [
    {
      from: { repo: "ag-grid/ag-ui", entity: "StreamHandler" },
      to: { repo: "vercel/ai", entity: "StreamingTextResponse" },
      type: "implements",
      strength: 0.95
    },
    {
      from: { repo: "copilotkit/copilotkit", entity: "CopilotRuntime" },
      to: { repo: "vercel/ai", entity: "generateText" },
      type: "uses",
      strength: 0.88
    }
  ]
}
```

## Attendant Escalation Strategy

### Three Intelligence Levels

```typescript
type AttendantMode =
  | "none"              // Raw results (for large context agents)
  | "granite-micro"     // Default: fast, local, efficient
  | "gemini-2.5-pro";   // Complex reasoning, API-based

interface QueryOptions {
  attendant?: AttendantMode;
  maxTokens?: number;
  reasoning?: "simple" | "complex" | "multi-step";
}
```

### Escalation Decision Matrix

| Query Complexity | Recommended Attendant | Reasoning |
|-----------------|----------------------|-----------|
| Simple fact lookup | `granite-micro` | Fast, local, sufficient |
| Multi-repo integration | `granite-micro` | Can handle with 128k context |
| Complex architecture decision | `gemini-2.5-pro` | Needs deep reasoning |
| Multi-step refactoring plan | `gemini-2.5-pro` | Needs planning capability |
| Raw data needed | `none` | Agent has enough context |

### Auto-Escalation (Optional)

```typescript
async function selectAttendant(
  query: string,
  repositories: string[],
  resultSize: number
): Promise<AttendantMode> {

  // Auto-escalate based on query complexity
  if (repositories.length > 3) {
    return "gemini-2.5-pro";  // Many repos = complex
  }

  if (resultSize > 5000) {
    return "gemini-2.5-pro";  // Lots of results = needs smart filtering
  }

  if (query.includes("refactor") || query.includes("architecture")) {
    return "gemini-2.5-pro";  // Design questions need reasoning
  }

  // Default to fast local attendant
  return "granite-micro";
}
```

## MCP Tool Implementations

### 1. `query_repositories` (Multi-Repo Query)

```json
{
  name: "query_repositories",
  description: "Query across multiple repositories with semantic + graph search",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural language query or specific technical question"
      },
      repositories: {
        type: "array",
        items: { type: "string" },
        description: "Repository IDs (e.g., ['vercel/ai', 'copilotkit/copilotkit'])"
      },
      attendant: {
        type: "string",
        enum: ["none", "granite-micro", "gemini-2.5-pro"],
        default: "granite-micro",
        description: "Attendant mode for filtering results"
      },
      maxTokens: {
        type: "number",
        default: 500,
        description: "Maximum tokens in response"
      }
    },
    required: ["query", "repositories"]
  }
}
```

### 2. `query_integration` (Cross-Project Integration)

```json
{
  name: "query_integration",
  description: "Understand how multiple projects integrate together",
  inputSchema: {
    type: "object",
    properties: {
      projects: {
        type: "array",
        items: { type: "string" },
        description: "Projects to analyze for integration patterns"
      },
      aspect: {
        type: "string",
        enum: ["api", "types", "runtime", "all"],
        default: "all",
        description: "Focus on specific integration aspect"
      },
      attendant: {
        type: "string",
        enum: ["granite-micro", "gemini-2.5-pro"],
        default: "granite-micro"
      }
    },
    required: ["projects"]
  }
}
```

### 3. `smart_query` (Natural Language with Auto-Escalation)

```json
{
  name: "smart_query",
  description: "Ask any question - automatically selects attendant and strategy",
  inputSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "Any natural language question about indexed repositories"
      },
      context: {
        type: "string",
        description: "What you're trying to accomplish (helps attendant filter)"
      },
      forceAttendant: {
        type: "string",
        enum: ["none", "granite-micro", "gemini-2.5-pro"],
        description: "Override auto-selection"
      }
    },
    required: ["question"]
  }
}
```

### 4. `get_cross_references` (Cross-Project Dependencies)

```json
{
  name: "get_cross_references",
  description: "Find how projects reference each other",
  inputSchema: {
    type: "object",
    properties: {
      entity: {
        type: "string",
        description: "Entity to find references to (e.g., 'StreamingTextResponse')"
      },
      sourceRepo: {
        type: "string",
        description: "Repository where entity is defined"
      },
      minStrength: {
        type: "number",
        default: 0.7,
        description: "Minimum relationship strength (0-1)"
      }
    },
    required: ["entity"]
  }
}
```

## Implementation Flow

### Query Flow with Attendant

```typescript
async function handleSmartQuery(params: SmartQueryParams): Promise<MCPResponse> {
  // 1. Determine scope
  const relevantRepos = await identifyRelevantRepositories(params.question);

  // 2. Query both semantic and graph
  const semanticResults = await embeddings.search(params.question, relevantRepos);
  const graphResults = await graph.query(params.question, relevantRepos);
  const crossRefs = await findCrossReferences(semanticResults, graphResults);

  // 3. Combine results (potentially large)
  const combinedResults = {
    semantic: semanticResults,  // ~2000 tokens
    graph: graphResults,        // ~1500 tokens
    crossRefs: crossRefs,       // ~800 tokens
    total: "~4300 tokens"
  };

  // 4. Select attendant (auto or forced)
  const attendant = params.forceAttendant ||
                   await selectAttendant(params.question, relevantRepos, 4300);

  // 5. Filter through attendant
  if (attendant === "none") {
    return combinedResults;  // Raw results
  }

  const attendantPrompt = buildAttendantPrompt(
    params.question,
    params.context,
    combinedResults
  );

  let filtered: string;
  if (attendant === "granite-micro") {
    filtered = await graniteMicro.filter(attendantPrompt);  // Local, fast
  } else {
    filtered = await gemini25Pro.filter(attendantPrompt);   // API, powerful
  }

  // 6. Return surgical precision result
  return {
    answer: filtered,           // ~300 tokens
    repositories: relevantRepos,
    attendant: attendant,
    originalSize: 4300,
    filteredSize: 300,
    efficiency: "93% reduction"
  };
}
```

### Attendant Prompts

#### Granite Micro Prompt (Simple)
```typescript
const graniteMicroPrompt = `
You are a coding assistant's research attendant.

Agent's question: "${question}"
Agent's task: ${context}
Agent's context budget: ${maxTokens} tokens

Full results across ${repositories.length} repositories:
${combinedResults}

Task: Extract ONLY the most relevant information.
Focus on: actionable facts, code examples, integration patterns.
Omit: redundant info, historical context, tangential details.

Format as:
Summary: [one line]
Key Points: [3-5 bullets]
Code Example: [if relevant]
Cross-References: [if multiple repos involved]

Maximum: ${maxTokens} tokens
`;
```

#### Gemini 2.5 Pro Prompt (Complex)
```typescript
const gemini25ProPrompt = `
You are an expert software architect helping a coding agent.

Agent's Goal: ${context}
Agent's Question: "${question}"

Available Information:
${combinedResults}

Your Task:
1. Analyze relationships between ${repositories.join(", ")}
2. Identify integration patterns and dependencies
3. Assess compatibility and potential issues
4. Provide actionable recommendations

Consider:
- How these projects interact at runtime
- Type compatibility and API contracts
- Best practices for integration
- Potential gotchas or version conflicts

Synthesize into:
- Summary (2-3 sentences)
- Integration Pattern (architecture-level)
- Key Dependencies (what depends on what)
- Code Approach (specific implementation guidance)
- Warnings (if any compatibility issues)

Target: ${maxTokens} tokens, prioritize clarity over completeness.
`;
```

## Configuration

### Repository Management

```typescript
// Add repositories to index
await mcp.addRepository({
  repo: "vercel/ai",
  branch: "main",
  indexDepth: "full"  // or "partial" for speed
});

await mcp.addRepository({
  repo: "ag-grid/ag-ui",
  branch: "main"
});

await mcp.addRepository({
  repo: "copilotkit/copilotkit",
  branch: "main"
});

// Build cross-references
await mcp.buildCrossReferences([
  "vercel/ai",
  "ag-grid/ag-ui",
  "copilotkit/copilotkit"
]);
```

### Attendant Configuration

```typescript
// Configure default attendant
mcp.configure({
  defaultAttendant: "granite-micro",
  autoEscalate: true,  // Auto-switch to Gemini for complex queries
  escalationThreshold: {
    repositoryCount: 3,
    resultSize: 5000,
    complexKeywords: ["architecture", "refactor", "design", "integrate"]
  }
});

// Configure Gemini API (for escalation)
mcp.setGeminiConfig({
  apiKey: process.env.GEMINI_API_KEY,
  model: "gemini-2.5-pro",
  fallback: "granite-micro"  // Fall back if API fails
});
```

## Advantages Over DeepWiki

| Feature | DeepWiki | Our GraphRAG MCP |
|---------|----------|------------------|
| **Repositories** | One at a time | Multiple simultaneously |
| **Search Type** | Semantic only | Semantic + Graph |
| **Context Efficiency** | Raw dump | Attendant-filtered |
| **Cross-Project** | Manual correlation | Automatic relationships |
| **Intelligence** | Fixed | Escalatable (Granite → Gemini) |
| **Cost** | Free (limited) | 100% local (Granite) or API (Gemini) |
| **Use Case** | Single project | Ecosystem understanding |

## Example Queries

### Query 1: Integration Pattern
```typescript
await mcp.queryIntegration({
  projects: ["vercel/ai", "ag-grid/ag-ui"],
  aspect: "api",
  attendant: "granite-micro"
});

// Returns:
// "AG-UI uses Vercel AI SDK's StreamingTextResponse through the
//  AgentRuntime.streamText() method. Key integration points:
//  1. Import { streamText } from 'ai'
//  2. Wrap in AgentRuntime.createStream()
//  3. Handle via StreamHandler callback
//  Code example: [shows integration code]"
```

### Query 2: Complex Architecture
```typescript
await mcp.smartQuery({
  question: "How should I architect a system using all three: Vercel AI SDK, AG-UI, and CoPilotKit?",
  context: "Building a collaborative AI coding assistant",
  forceAttendant: "gemini-2.5-pro"  // Complex question, use Gemini
});

// Returns deep architectural guidance across all three projects
```

### Query 3: Version Compatibility
```typescript
await mcp.queryCompatibility({
  projects: [
    { repo: "vercel/ai", version: "3.4.0" },
    { repo: "copilotkit/copilotkit", version: "1.2.0" }
  ],
  attendant: "granite-micro"
});

// Returns compatibility matrix and upgrade recommendations
```

## Next Steps

1. ✅ **Design Complete** - Multi-repo GraphRAG MCP with attendant escalation
2. ⏳ **Implementation** - Build MCP server with tools
3. ⏳ **Indexing** - Create multi-repository indexing system
4. ⏳ **Attendant Integration** - Granite Micro + Gemini 2.5 Pro
5. ⏳ **Testing** - Vercel AI SDK + AG-UI + CoPilotKit test case

---

**This is the architecture that beats DeepWiki!** 🚀
