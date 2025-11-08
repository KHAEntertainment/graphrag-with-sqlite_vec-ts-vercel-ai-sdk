# MCP Code Execution Analysis & Recommendations

> **Date:** 2025-01-08  
> **Status:** Planning & Discussion  
> **Related:** Anthropic's "Code execution with MCP" announcement

## Executive Summary

Anthropic has introduced a new pattern for building more efficient MCP servers using **code execution** instead of multiple discrete tool definitions. This approach can reduce context overhead by **up to 98.7%** and significantly improve query latency.

**Recommendation:** Implement code execution for GraphRAG MCP using `isolated-vm` for sandboxed JavaScript execution. This aligns with our local-first architecture and provides substantial efficiency gains.

---

## Background: Anthropic's Code Execution Pattern

### The Problem with Traditional MCP Tools

Current MCP servers define multiple tools with detailed schemas:

```typescript
// Traditional approach: ~200-300 tokens PER TOOL
{
  name: "query_repositories",
  description: "Query across multiple indexed repositories with dynamic hybrid search...",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "..." },
      repositories: { type: "array", items: { type: "string" }, description: "..." },
      attendant: { type: "string", enum: [...], description: "..." },
      maxTokens: { type: "number", description: "..." }
    }
  }
}
```

**Token Cost:** ~1500 tokens for 5 tools (query_repositories, query_dependency, get_cross_references, list_repositories, smart_query)

### The Code Execution Solution

Instead of multiple tools, expose **one code execution tool** with a simple API:

```typescript
// Code execution approach: ~100 tokens TOTAL
{
  name: "execute_graphrag_code",
  description: "Execute code to perform GraphRAG queries",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "JavaScript code to execute" }
    }
  }
}
```

**Token Cost:** ~100 tokens (tool) + ~300 tokens (API reference) = ~400 tokens

**Token Reduction:** ~73% (1500 → 400 tokens)

---

## Benefits for GraphRAG

### 1. Multi-Step Queries Without Round-Trips

**Current (3 tool calls = 3 LLM inferences):**
```
Agent → query_repositories → Agent → query_dependency → Agent → get_cross_references
Time: ~5000ms (3 × LLM + 3 × network)
```

**Code Execution (1 tool call = 1 LLM inference):**
```javascript
// Agent writes code once
const results = query_repositories({
  query: 'streaming API',
  repositories: ['vercel/ai', 'ag-grid/ag-ui']
});

if (results.analysis.query_type === 'identifier') {
  const details = query_dependency({
    dependency: results.results[0].id,
    aspect: 'implementation'
  });
}

return { results, details };
```
Time: ~2900ms (1 × LLM + 1 × network + local execution)

**Speedup:** 42% faster

### 2. Complex Query Composition

```javascript
// Parallel searches
const results = await Promise.all([
  query_repositories({ query: 'streaming', repos: ['vercel/ai'] }),
  query_repositories({ query: 'streaming', repos: ['ag-grid/ag-ui'] }),
  query_repositories({ query: 'streaming', repos: ['copilotkit/copilotkit'] })
]);

// Merge and find patterns
const merged = merge_results(results);
const cross_refs = find_integration_patterns(merged);

// Dynamic attendant selection
const attendant = merged.length > 1000 ? 'gemini-2.5-pro' : 'granite-micro';
return filter_results(merged, attendant, 500);
```

### 3. Token Efficiency

| Approach | Tool Definitions | API Docs | Total Tokens |
|----------|-----------------|----------|--------------|
| **Current (5 discrete tools)** | ~1500 | N/A | ~1500 |
| **Code execution** | ~100 | ~300 | ~400 |
| **Savings** | | | **73%** |

### 4. Better Agent Experience

- More natural programming interface
- Familiar JavaScript syntax
- Full control over query flow
- Can implement custom logic

---

## Sandbox Options Analysis

### Important Clarification

**Anthropic's announcement describes a PATTERN, not a built-in feature.**

The MCP SDK (v1.21.1) does **NOT** provide execution sandboxing. We must implement our own secure execution environment.

### Option 1: isolated-vm ✅ **RECOMMENDED**

**Installation:**
```bash
npm install isolated-vm
```

**Pros:**
- ✅ True V8 isolate (separate heap, proper sandboxing)
- ✅ Fast (in-process, no container overhead)
- ✅ Well-maintained and actively developed
- ✅ Secure (proper isolation boundaries)
- ✅ Memory limits and timeouts
- ✅ Perfect for synchronous operations
- ✅ JavaScript native (our codebase is TypeScript)
- ✅ Local execution (aligns with offline-first design)

**Cons:**
- ❌ JavaScript only (but we don't need Python)
- ❌ More complex API than vm2
- ❌ Requires native compilation

**Security Features:**
- Timeout protection (e.g., 5s limit)
- Memory limits (e.g., 128MB)
- No access to Node.js APIs (fs, net, etc.)
- Isolated heap (no access to parent context)

**Example:**
```typescript
import ivm from 'isolated-vm';

const isolate = new ivm.Isolate({ memoryLimit: 128 });
const context = await isolate.createContext();

// Inject GraphRAG API
const jail = context.global;
await jail.set('query_repositories', new ivm.Reference(
  async (opts) => graphrag.queryRepositories(opts)
));

// Execute agent code with timeout
const script = await isolate.compileScript(code);
const result = await script.run(context, { timeout: 5000 });
```

### Option 2: Docker/Containers ❌ **NOT RECOMMENDED**

**Technologies:** Docker, Dagger, Podman

**Pros:**
- ✅ Industry-standard isolation
- ✅ Multi-language support
- ✅ Maximum security

**Cons:**
- ❌ **Too heavyweight** for our use case
- ❌ Requires Docker daemon
- ❌ High latency (container startup ~500-2000ms)
- ❌ Complex deployment
- ❌ **Breaks offline-first design** (requires Docker)
- ❌ Overkill for trusted agent code

**When to use:** Untrusted code, multi-language support, system-level operations

**Why NOT for GraphRAG:** We execute trusted agent code locally with simple database queries

### Option 3: E2B/Code Execution APIs ❌ **NOT RECOMMENDED**

**Services:** E2B, Replit, CodeSandbox APIs

**Pros:**
- ✅ Managed service (no infrastructure)
- ✅ Multi-language support

**Cons:**
- ❌ **Not local** (defeats offline-first architecture!)
- ❌ Costs money
- ❌ Network latency
- ❌ Privacy concerns (external service)
- ❌ Requires internet connection

### Option 4: QuickJS ⚠️ **ALTERNATIVE**

**Installation:**
```bash
npm install quickjs-emscripten
```

**Pros:**
- ✅ Very small footprint
- ✅ Fast startup
- ✅ Easier API than isolated-vm

**Cons:**
- ❌ Slower execution than V8
- ❌ Limited ES6+ features
- ❌ Smaller ecosystem

**Use case:** If isolated-vm proves too complex

---

## Recommendation: Use isolated-vm

### Why isolated-vm is the Best Fit

Our requirements perfectly match isolated-vm's strengths:

| Requirement | isolated-vm | Docker | E2B | QuickJS |
|-------------|-------------|--------|-----|---------|
| **Local-first** | ✅ | ⚠️ | ❌ | ✅ |
| **Fast (<100ms overhead)** | ✅ | ❌ | ❌ | ✅ |
| **Secure enough** | ✅ | ✅ | ✅ | ⚠️ |
| **JavaScript** | ✅ | ✅ | ✅ | ✅ |
| **Sync DB access** | ✅ | ⚠️ | ❌ | ✅ |
| **Easy deployment** | ✅ | ❌ | ✅ | ✅ |

### Security Assessment

**What isolated-vm protects against:**
- ✅ Infinite loops (via timeout)
- ✅ Memory exhaustion (via memory limit)
- ✅ Access to Node.js APIs (isolated heap)
- ✅ File system access (no fs module)
- ✅ Network access (no net module)

**What it doesn't protect against:**
- ❌ CPU exhaustion within timeout
- ❌ Malicious SQL queries (mitigated by parameterized API)
- ❌ Logic bombs (agent code is trusted)

**Why this is sufficient for GraphRAG:**
- Agent code comes from Claude (trusted source)
- Local database (no external attack surface)
- User's own machine (not multi-tenant)
- API layer provides SQL injection protection
- Execution is isolated from main process

---

## Implementation Plan

### Phase 1: Sandbox Infrastructure (2-3 days)

**1.1 Install Dependencies**
```bash
npm install isolated-vm
npm install --save-dev @types/isolated-vm
```

**1.2 Create Sandbox Class**

File: `src/mcp/execution/sandbox.ts`

```typescript
import ivm from 'isolated-vm';
import { GraphRAGAPI } from '../api/graphrag-api.js';

export class GraphRAGSandbox {
  private isolate: ivm.Isolate;
  private context: ivm.Context;
  private api: GraphRAGAPI;

  constructor(dbPath: string) {
    // 128MB memory limit, reasonable for graph queries
    this.isolate = new ivm.Isolate({ memoryLimit: 128 });
    this.api = new GraphRAGAPI(dbPath);
  }

  async initialize(): Promise<void> {
    this.context = await this.isolate.createContext();
    const jail = this.context.global;

    // Inject GraphRAG API functions
    await jail.set('query_repositories', 
      new ivm.Reference(async (options: any) => {
        return await this.api.queryRepositories(options);
      })
    );

    await jail.set('query_dependency',
      new ivm.Reference(async (options: any) => {
        return await this.api.queryDependency(options);
      })
    );

    await jail.set('get_cross_references',
      new ivm.Reference(async (options: any) => {
        return await this.api.getCrossReferences(options);
      })
    );

    await jail.set('list_repositories',
      new ivm.Reference(async () => {
        return await this.api.listRepositories();
      })
    );

    await jail.set('smart_query',
      new ivm.Reference(async (options: any) => {
        return await this.api.smartQuery(options);
      })
    );

    // Utility: console.log for debugging
    await jail.set('console', {
      log: new ivm.Reference((...args: any[]) => {
        console.log('[Sandbox]', ...args);
      })
    });
  }

  async execute(code: string, timeout = 5000): Promise<any> {
    try {
      const script = await this.isolate.compileScript(code);
      const result = await script.run(this.context, { timeout });
      
      // Copy result out of isolate (deep copy)
      return await result.copy();
    } catch (error: any) {
      if (error.message?.includes('timeout')) {
        throw new Error(`Code execution timeout (${timeout}ms limit exceeded)`);
      }
      throw new Error(`Execution error: ${error.message}`);
    }
  }

  dispose(): void {
    this.context.release();
    this.isolate.dispose();
  }
}
```

### Phase 2: GraphRAG API Wrapper (1-2 days)

File: `src/mcp/api/graphrag-api.ts`

```typescript
import { GraphDatabaseConnection } from '../../lib/graph-database.js';
import { HybridSearchEngine } from '../tools/hybrid-search.js';
import { QueryEngine } from '../tools/query-engine.js';

/**
 * Simplified API for code execution sandbox
 * All functions return plain objects (no complex types)
 */
export class GraphRAGAPI {
  private db: GraphDatabaseConnection;
  private hybridSearch: HybridSearchEngine;
  private queryEngine: QueryEngine;

  constructor(dbPath: string) {
    this.db = new GraphDatabaseConnection(dbPath);
    this.hybridSearch = new HybridSearchEngine(this.db.getSession());
    this.queryEngine = new QueryEngine(this.db.getSession());
  }

  async queryRepositories(options: {
    query: string;
    repositories?: string[];
    attendant?: 'none' | 'granite-micro' | 'gemini-2.5-pro';
    maxTokens?: number;
    explain?: boolean;
  }): Promise<any> {
    const result = await this.hybridSearch.search(options.query, {
      repositories: options.repositories,
      maxResults: 20,
      explain: options.explain || false
    });

    // Return serializable object
    return {
      results: result.results,
      analysis: result.analysis,
      metrics: result.metrics,
      coverage: result.coverage
    };
  }

  async queryDependency(options: {
    dependency: string;
    repositories?: string[];
    aspect?: 'usage' | 'relationships' | 'implementation' | 'all';
  }): Promise<any> {
    const entities = await this.queryEngine.searchEntity(
      options.dependency,
      { repositories: options.repositories }
    );

    let relationships = [];
    if (options.aspect === 'relationships' || options.aspect === 'all') {
      if (entities.length > 0) {
        relationships = await this.queryEngine.getEntityRelationships(
          entities[0].id,
          { repositories: options.repositories }
        );
      }
    }

    return { entities, relationships };
  }

  async getCrossReferences(options: {
    entity: string;
    sourceRepo?: string;
    minStrength?: number;
  }): Promise<any> {
    // Find entity's repo if not provided
    let entityRepo = options.sourceRepo;
    if (!entityRepo) {
      const entities = await this.queryEngine.searchEntity(options.entity);
      if (entities.length > 0) {
        entityRepo = entities[0].repo;
      }
    }

    // Get all repositories
    const repos = await this.listRepositories();
    const repoIds = repos.map((r: any) => r.id);

    // Query cross-references
    const crossRefs = await this.queryEngine.queryCrossReferences(
      repoIds,
      options.minStrength || 0.7
    );

    // Filter for this entity
    return crossRefs.filter((ref: any) =>
      ref.from_entity.includes(options.entity) ||
      ref.to_entity.includes(options.entity) ||
      (entityRepo && (ref.from_repo === entityRepo || ref.to_repo === entityRepo))
    );
  }

  async listRepositories(): Promise<any[]> {
    const repos = this.db.getSession()
      .prepare('SELECT * FROM repositories')
      .all();
    return repos;
  }

  async smartQuery(options: {
    question: string;
    context?: string;
    forceAttendant?: 'none' | 'granite-micro' | 'gemini-2.5-pro';
    maxTokens?: number;
  }): Promise<any> {
    // Implementation similar to queryRepositories
    // but with smart attendant selection
    return await this.queryRepositories({
      query: options.question,
      attendant: options.forceAttendant || 'granite-micro',
      maxTokens: options.maxTokens || 500
    });
  }
}
```

### Phase 3: MCP Server Integration (1 day)

Update: `src/mcp/server.ts`

```typescript
import { GraphRAGSandbox } from './execution/sandbox.js';

export class GraphRAGMCPServer {
  private sandbox: GraphRAGSandbox;

  constructor(config: GraphRAGMCPConfig = {}) {
    // ... existing setup ...
    
    // Initialize sandbox
    this.sandbox = new GraphRAGSandbox(this.config.dbPath);
  }

  async start(): Promise<void> {
    // Initialize sandbox before starting
    await this.sandbox.initialize();
    
    // ... existing start logic ...
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // ... existing tools ...
          
          // NEW: Code execution tool
          {
            name: 'execute_graphrag_code',
            description: 
              'Execute JavaScript code to perform complex multi-step GraphRAG queries. ' +
              'Available functions: query_repositories(opts), query_dependency(opts), ' +
              'get_cross_references(opts), list_repositories(), smart_query(opts). ' +
              'Use async/await for all queries. Code runs in secure sandbox with 5s timeout.',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'JavaScript code to execute. Returns last expression value.'
                }
              },
              required: ['code']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'execute_graphrag_code') {
        return await this.handleCodeExecution(args);
      }
      
      // ... existing tool handlers ...
    });
  }

  private async handleCodeExecution(args: { code: string }): Promise<MCPResponse> {
    try {
      const result = await this.sandbox.execute(args.code);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error: any) {
      this.logger.error('Code execution error:', error.message);
      
      return {
        content: [{
          type: 'text',
          text: `Execution error: ${error.message}\n\nTips:\n` +
                `- Use async/await for all queries\n` +
                `- Check function names and parameters\n` +
                `- Execution timeout is 5 seconds`
        }]
      };
    }
  }

  async close(): Promise<void> {
    this.sandbox.dispose();
    // ... existing cleanup ...
  }
}
```

### Phase 4: API Documentation (1 day)

File: `docs/MCP-CODE-EXECUTION-API.md`

Create comprehensive API reference for agents (~300 tokens):

```markdown
# GraphRAG Code Execution API

## Available Functions

### query_repositories(options)
Query across multiple repositories with hybrid search.

**Parameters:**
- `query` (string, required): Natural language query
- `repositories` (string[], optional): Repository IDs to search
- `attendant` ('granite-micro' | 'gemini-2.5-pro' | 'none', optional)
- `maxTokens` (number, optional): Max tokens in response
- `explain` (boolean, optional): Include ranking explanations

**Returns:** `{ results, analysis, metrics, coverage }`

### query_dependency(options)
Find information about a specific dependency or entity.

**Parameters:**
- `dependency` (string, required): Entity name
- `repositories` (string[], optional): Limit to specific repos
- `aspect` ('usage' | 'relationships' | 'implementation' | 'all', optional)

**Returns:** `{ entities, relationships }`

[... continue for all functions ...]

## Example Usage

```javascript
// Multi-step query
const results = await query_repositories({
  query: 'streaming API',
  repositories: ['vercel/ai', 'ag-grid/ag-ui']
});

// Conditional deep dive
if (results.analysis.query_type === 'identifier') {
  const details = await query_dependency({
    dependency: results.results[0].content.match(/\w+/)[0],
    aspect: 'implementation'
  });
  
  return { results, details };
}

return results;
```
```

### Phase 5: Testing & Validation (1-2 days)

**5.1 Unit Tests**
```typescript
describe('GraphRAGSandbox', () => {
  it('should execute simple queries', async () => {
    const result = await sandbox.execute(`
      const repos = await list_repositories();
      repos.length;
    `);
    expect(result).toBeGreaterThan(0);
  });

  it('should handle timeouts', async () => {
    await expect(
      sandbox.execute('while(true) {}')
    ).rejects.toThrow('timeout');
  });

  it('should prevent access to Node.js APIs', async () => {
    await expect(
      sandbox.execute('require("fs")')
    ).rejects.toThrow();
  });
});
```

**5.2 Integration Tests**
- Test multi-step queries
- Test parallel queries
- Test error handling
- Test with Claude Desktop

---

## Expected Results

### Token Efficiency

| Metric | Current | Code Execution | Improvement |
|--------|---------|---------------|-------------|
| **Tool definitions** | ~1500 tokens | ~100 tokens | **93% reduction** |
| **API reference** | N/A | ~300 tokens | N/A |
| **Total overhead** | ~1500 tokens | ~400 tokens | **73% reduction** |

### Performance

| Query Type | Current | Code Execution | Improvement |
|-----------|---------|---------------|-------------|
| **Simple (1 tool)** | ~800ms | ~900ms | -12% (acceptable) |
| **Complex (3+ tools)** | ~5000ms | ~2900ms | **42% faster** |
| **Parallel queries** | Not possible | ~1200ms | **76% faster** |

### Developer Experience

**Before:**
```typescript
// Agent must make 3 separate tool calls
1. query_repositories → wait → analyze
2. query_dependency → wait → analyze
3. get_cross_references → wait → done
```

**After:**
```javascript
// Agent writes one program
const results = await query_repositories(...);
const details = await query_dependency(...);
const refs = await get_cross_references(...);
return { results, details, refs };
```

---

## Migration Strategy

### Backwards Compatibility

**Keep existing tools:**
- Don't remove current 5-tool interface
- Add code execution as 6th tool
- Let agents choose which to use

**Gradual adoption:**
1. Launch with both interfaces
2. Monitor usage patterns
3. Provide examples of both approaches
4. Eventually deprecate old tools if code execution proves superior

### Documentation

**For Claude Desktop users:**
```markdown
# GraphRAG supports two query modes:

## Simple queries (use individual tools)
- `query_repositories` - Single search
- `query_dependency` - Lookup entity
- `get_cross_references` - Find links

## Complex queries (use code execution)
- `execute_graphrag_code` - Multi-step queries
- Compose multiple operations
- Add custom logic
- Better performance
```

---

## Risks & Mitigations

### Risk 1: Sandbox Escape
**Impact:** Medium  
**Likelihood:** Low  
**Mitigation:** 
- Use isolated-vm (well-tested library)
- Regular security updates
- Monitor execution logs
- Keep timeouts strict (5s)

### Risk 2: Performance Regression
**Impact:** Medium  
**Likelihood:** Low  
**Mitigation:**
- Benchmark before/after
- Keep both interfaces available
- Profile sandbox overhead
- Optimize hot paths

### Risk 3: Agent Confusion
**Impact:** Low  
**Likelihood:** Medium  
**Mitigation:**
- Clear documentation
- Good error messages
- Provide examples
- Support both interfaces

### Risk 4: Memory Leaks
**Impact:** Medium  
**Likelihood:** Low  
**Mitigation:**
- Dispose isolates after use
- Monitor memory usage
- Set memory limits (128MB)
- Implement cleanup hooks

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| **Phase 1: Sandbox** | 2-3 days | isolated-vm installation |
| **Phase 2: API Wrapper** | 1-2 days | Phase 1 |
| **Phase 3: Integration** | 1 day | Phase 1, 2 |
| **Phase 4: Documentation** | 1 day | Phase 2 |
| **Phase 5: Testing** | 1-2 days | Phase 3 |
| **Total** | **6-9 days** | |

---

## Next Steps

1. **Decision Point:** Approve implementation plan
2. **Spike:** 1-day proof of concept with isolated-vm
3. **Measure:** Token savings and performance improvements
4. **Implement:** Full rollout if successful
5. **Document:** Update MCP quickstart guide

---

## References

- [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [isolated-vm on npm](https://www.npmjs.com/package/isolated-vm)
- [MCP SDK TypeScript](https://github.com/modelcontextprotocol/typescript-sdk)
- [GraphRAG Current Architecture](./MCP-LOCAL-FIRST-ARCHITECTURE.md)
- [GraphRAG Hybrid Search](./DYNAMIC-HYBRID-SEARCH-INTEGRATION.md)

---

## Conclusion

Implementing code execution for GraphRAG MCP with `isolated-vm` is **highly recommended**:

✅ **73% token reduction** (1500 → 400 tokens)  
✅ **42% latency improvement** for complex queries  
✅ **100% local execution** (aligns with offline-first design)  
✅ **Secure sandboxing** (timeout, memory limits, isolation)  
✅ **Better agent experience** (natural programming interface)  
✅ **Backwards compatible** (keep existing tools)

This positions GraphRAG as one of the most efficient and capable MCP servers available, with performance characteristics that exceed traditional tool-based approaches.

**Status:** Ready for implementation pending approval.
