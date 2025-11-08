# GraphRAG Code Execution API Reference

> **For:** AI agents using the code execution MCP server  
> **Server:** `graphrag-mcp-server-code-execution`  
> **Tool:** `execute_graphrag_code`

## Overview

The code execution API allows you to compose complex multi-step GraphRAG queries in a single JavaScript function. All code runs in a secure sandbox with 5s timeout and 128MB memory limit.

**Benefits:**
- **Single tool call** instead of multiple round-trips
- **Compose operations** with custom logic
- **Parallel queries** using Promise.all
- **Conditional logic** based on results

---

## Available Functions

### `query_repositories(options)`

Query across multiple repositories with dynamic hybrid search.

**Parameters:**
```typescript
{
  query: string;              // Natural language query (required)
  repositories?: string[];     // Repository IDs to search
  attendant?: 'none' | 'granite-micro' | 'gemini-2.5-pro';
  maxTokens?: number;         // Max tokens in response (default: 500)
  explain?: boolean;          // Include ranking explanations
}
```

**Returns:**
```typescript
{
  results: Array<{
    id: string;
    repo: string;
    content: string;
    score: number;
    sources: { dense?: number; sparse?: number; pattern?: number; graph?: number };
    metadata?: Record<string, unknown>;
  }>;
  analysis: {
    query_type: string;
    confidence: number;
    reasoning: string;
    weights: { dense: number; sparse: number; pattern: number; graph: number };
  };
  metrics: {
    denseTime: number;
    sparseTime: number;
    patternTime: number;
    graphTime: number;
    fusionTime: number;
    totalTime: number;
  };
  coverage: {
    dense: number;
    sparse: number;
    pattern: number;
    graph: number;
  };
}
```

**Example:**
```javascript
const results = await query_repositories({
  query: 'streaming API',
  repositories: ['vercel/ai', 'ag-grid/ag-ui']
});
```

---

### `query_dependency(options)`

Find information about a specific entity or dependency.

**Parameters:**
```typescript
{
  dependency: string;          // Entity name to search (required)
  repositories?: string[];      // Repositories to search
  aspect?: 'usage' | 'relationships' | 'implementation' | 'all';
}
```

**Returns:**
```typescript
{
  entities: Array<{
    id: string;
    repo: string;
    properties: Record<string, unknown>;
    relationship?: string;
    weight?: number;
  }>;
  relationships?: Array<{
    id: string;
    repo: string;
    properties: Record<string, unknown>;
    relationship: string;
    weight: number;
  }>;
}
```

**Example:**
```javascript
const dep = await query_dependency({
  dependency: 'StreamingTextResponse',
  aspect: 'relationships'
});
```

---

### `get_cross_references(options)`

Find cross-repository references for an entity.

**Parameters:**
```typescript
{
  entity: string;             // Entity to find refs for (required)
  sourceRepo?: string;        // Source repository
  minStrength?: number;       // Min strength (0-1, default: 0.7)
}
```

**Returns:**
```typescript
Array<{
  from_repo: string;
  from_entity: string;
  to_repo: string;
  to_entity: string;
  type: string;
  strength: number;
}>
```

**Example:**
```javascript
const refs = await get_cross_references({
  entity: 'StreamingTextResponse',
  sourceRepo: 'vercel/ai'
});
```

---

### `list_repositories()`

List all indexed repositories.

**Parameters:** None

**Returns:**
```typescript
Array<{
  id: string;
  name: string;
  indexed_at: string;
  version?: string;
  branch?: string;
  metadata?: string;
}>
```

**Example:**
```javascript
const repos = await list_repositories();
console.log(`Found ${repos.length} repositories`);
```

---

### `smart_query(options)`

Natural language query with automatic attendant selection.

**Parameters:**
```typescript
{
  question: string;            // Natural language question (required)
  context?: string;            // What you're trying to accomplish
  forceAttendant?: 'none' | 'granite-micro' | 'gemini-2.5-pro';
  maxTokens?: number;          // Max tokens (default: 500)
}
```

**Returns:** Same as `query_repositories()`

**Example:**
```javascript
const answer = await smart_query({
  question: 'How do I implement streaming chat?',
  context: 'Building a chat interface with AG-UI'
});
```

---

## Usage Patterns

### Pattern 1: Simple Query

```javascript
// Single operation
const results = await query_repositories({
  query: 'authentication',
  repositories: ['vercel/ai']
});

return results;
```

### Pattern 2: Multi-Step Query

```javascript
// Step 1: Find relevant results
const results = await query_repositories({
  query: 'streaming API'
});

// Step 2: Get details about top result
if (results.results.length > 0) {
  const topResult = results.results[0];
  const details = await query_dependency({
    dependency: topResult.id
  });
  
  return { overview: results, details };
}

return { overview: results };
```

### Pattern 3: Parallel Queries

```javascript
// Query multiple repos in parallel
const [vercelResults, agResults, copilotResults] = await Promise.all([
  query_repositories({ query: 'streaming', repositories: ['vercel/ai'] }),
  query_repositories({ query: 'streaming', repositories: ['ag-grid/ag-ui'] }),
  query_repositories({ query: 'streaming', repositories: ['copilotkit/copilotkit'] })
]);

// Merge results
const allResults = [
  ...vercelResults.results,
  ...agResults.results,
  ...copilotResults.results
];

return { merged: allResults, count: allResults.length };
```

### Pattern 4: Conditional Logic

```javascript
// Adaptive querying based on results
const initial = await query_repositories({
  query: 'API integration'
});

let strategy;
if (initial.analysis.query_type === 'identifier') {
  // Specific entity found - get relationships
  strategy = 'deep-dive';
  const entity = initial.results[0].content.match(/\w+/)[0];
  const details = await query_dependency({
    dependency: entity,
    aspect: 'all'
  });
  return { strategy, details };
} else {
  // Broad query - get overview
  strategy = 'broad-search';
  return { strategy, results: initial };
}
```

### Pattern 5: Custom Filtering

```javascript
// Custom result processing
const results = await query_repositories({
  query: 'configuration options',
  explain: false
});

// Filter for specific repos
const vercelOnly = results.results.filter(r => r.repo === 'vercel/ai');

// Sort by score
const topResults = vercelOnly
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);

// Get cross-refs for top results
const crossRefs = [];
for (const result of topResults) {
  const refs = await get_cross_references({
    entity: result.id
  });
  crossRefs.push(...refs);
}

return {
  topResults,
  crossRefs,
  summary: `Found ${topResults.length} results with ${crossRefs.length} cross-references`
};
```

---

## Error Handling

### Timeout Errors

```javascript
try {
  // Long-running query
  const results = await query_repositories({
    query: 'complex architecture patterns'
  });
  return results;
} catch (error) {
  if (error.message.includes('timeout')) {
    // Query took too long - try simpler approach
    return { error: 'Query timeout', suggestion: 'Try narrowing search' };
  }
  throw error;
}
```

### Empty Results

```javascript
const results = await query_repositories({ query: 'nonexistent' });

if (results.results.length === 0) {
  // No results - try alternative search
  const alternative = await smart_query({
    question: 'What APIs are available?'
  });
  return { original: results, alternative };
}

return results;
```

---

## Best Practices

### ✅ DO

- **Use async/await** for all queries
- **Handle empty results** gracefully
- **Combine operations** for efficiency
- **Return structured data** (objects, arrays)
- **Add error handling** for robustness
- **Use console.log** for debugging

### ❌ DON'T

- **Don't use blocking loops** (will timeout)
- **Don't access Node.js APIs** (fs, net, etc.) - not available
- **Don't exceed timeout** (5s default, 10s max)
- **Don't allocate excessive memory** (128MB limit)
- **Don't use require()** - not available in sandbox

---

## Debugging

### Console Logging

```javascript
console.log('Starting query...');

const results = await query_repositories({ query: 'test' });

console.log(`Found ${results.results.length} results`);
console.log('Query type:', results.analysis.query_type);

return results;
```

**Output:** Logs appear in server logs with `[Sandbox Code]` prefix

### Inspect Results

```javascript
const results = await query_repositories({ query: 'api' });

// Inspect structure
console.log('Keys:', Object.keys(results));
console.log('First result keys:', Object.keys(results.results[0]));

return results;
```

---

## Limits & Constraints

| Limit | Value | Notes |
|-------|-------|-------|
| **Timeout** | 5s default, 10s max | Configurable per execution |
| **Memory** | 128MB | Cannot be changed |
| **Code size** | ~50KB recommended | Larger code is slower to compile |
| **API calls** | Unlimited | But respect timeout |
| **Result size** | No hard limit | But consider performance |

---

## Example: Complete Workflow

```javascript
// GOAL: Find streaming implementations and their integration patterns

// Step 1: List available repositories
const repos = await list_repositories();
console.log(`Searching ${repos.length} repositories`);

// Step 2: Parallel search across all repos
const searchPromises = repos.map(repo =>
  query_repositories({
    query: 'streaming implementation',
    repositories: [repo.id],
    maxTokens: 100
  })
);

const allResults = await Promise.all(searchPromises);

// Step 3: Find repos with results
const reposWithResults = allResults
  .map((result, idx) => ({
    repo: repos[idx],
    count: result.results.length,
    topScore: result.results[0]?.score || 0
  }))
  .filter(r => r.count > 0)
  .sort((a, b) => b.topScore - a.topScore);

console.log(`Found results in ${reposWithResults.length} repositories`);

// Step 4: Get cross-references between top repos
if (reposWithResults.length >= 2) {
  const topRepos = reposWithResults.slice(0, 2);
  const crossRefs = await get_cross_references({
    entity: 'streaming',
    minStrength: 0.6
  });
  
  return {
    summary: `Found streaming in ${reposWithResults.length} repos`,
    topRepositories: topRepos,
    integrations: crossRefs,
    recommendation: crossRefs.length > 0
      ? 'These repos integrate well together'
      : 'Consider checking compatibility'
  };
}

// Step 5: Return results
return {
  summary: `Found ${reposWithResults.length} repos with streaming`,
  repositories: reposWithResults
};
```

---

## Token Efficiency

**Traditional approach (5 tool calls):**
```
Tool definitions: ~1500 tokens
Agent reasoning: ~800 tokens per call × 5 = ~4000 tokens
Total: ~5500 tokens
```

**Code execution approach (1 tool call):**
```
Tool definition: ~100 tokens
This API reference: ~300 tokens
Agent reasoning: ~600 tokens
Total: ~1000 tokens (82% reduction!)
```

---

## Support

**Error messages include:**
- Available functions list
- Usage tips
- Timeout/memory info
- Example code

**For help:**
- Check error message for specific guidance
- Review examples in this document
- Inspect server logs for [Sandbox] messages

---

**Version:** 1.0.0  
**Server:** graphrag-mcp-server-code-execution  
**Last updated:** 2025-11-08
