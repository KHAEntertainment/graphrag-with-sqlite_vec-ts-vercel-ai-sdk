# MCP Code Execution Implementation Plan

> **Branch:** `feature/mcp-code-execution`  
> **Status:** Planning Complete - Awaiting Approval  
> **Estimated Duration:** 6-9 days

## Overview

This plan outlines the implementation of a **NEW** MCP server with code execution capabilities, running **alongside** the existing traditional MCP server. Users will be able to choose which server to use based on their needs.

## Architecture Decision

### Two Separate MCP Servers

**Existing Server (Traditional):**
- File: `src/mcp/server.ts`
- Tools: 5 discrete tools (query_repositories, query_dependency, etc.)
- Use case: Simple, single-step queries
- Token cost: ~1500 tokens (tool definitions)

**New Server (Code Execution):**
- File: `src/mcp/server-code-execution.ts`
- Tools: 1 code execution tool + 5 traditional tools (hybrid)
- Use case: Complex, multi-step queries
- Token cost: ~400 tokens (tool definitions)

**Why Two Servers:**
- ✅ Zero risk to existing functionality
- ✅ Easy comparison and benchmarking
- ✅ Users can choose based on needs
- ✅ Can deprecate traditional server later if code execution proves superior

## File Structure

```
src/mcp/
├── server.ts                          # Existing (unchanged)
├── server-code-execution.ts           # NEW: Code execution MCP server
├── api/
│   └── graphrag-api.ts               # NEW: Simple API wrapper
├── execution/
│   └── sandbox.ts                    # NEW: isolated-vm wrapper
├── tools/                            # Existing (reused)
│   ├── hybrid-search.ts
│   ├── query-engine.ts
│   └── ...
└── attendant/                        # Existing (reused)
    └── granite-micro.ts

docs/
├── MCP-CODE-EXECUTION-API.md         # NEW: API reference for agents
├── MCP-CODE-EXECUTION-ANALYSIS.md    # Created (design doc)
└── planning/
    └── MCP-CODE-EXECUTION-IMPLEMENTATION-PLAN.md  # This file

examples/
└── code-execution-demo.ts            # NEW: Demo of code execution

tests/
└── mcp/
    ├── sandbox.test.ts               # NEW: Sandbox unit tests
    └── code-execution-e2e.test.ts    # NEW: Integration tests
```

## Implementation Phases

### Phase 1: Dependencies & Foundation (Day 1)

#### Task 1.1: Install isolated-vm
```bash
npm install isolated-vm
npm install --save-dev @types/isolated-vm
```

**Validation:**
- [ ] Package installed successfully
- [ ] TypeScript types available
- [ ] Native compilation successful (C++ addon)

#### Task 1.2: Create TypeScript Types
File: `src/types/code-execution.ts`

**Validation:**
- [ ] Types defined for sandbox options
- [ ] Types defined for API responses
- [ ] No TypeScript errors

---

### Phase 2: API Wrapper (Day 2)

#### Task 2.1: Create GraphRAG API Wrapper
File: `src/mcp/api/graphrag-api.ts`

**Purpose:** Expose all GraphRAG operations as simple async functions

**Functions to implement:**
- `queryRepositories(options): Promise<any>`
- `queryDependency(options): Promise<any>`
- `getCrossReferences(options): Promise<any>`
- `listRepositories(): Promise<any>`
- `smartQuery(options): Promise<any>`

**Requirements:**
- All functions return plain serializable objects (no class instances)
- All functions are async
- Parameters are simple objects
- Reuse existing HybridSearchEngine and QueryEngine

**Validation:**
- [ ] Can call all functions with test data
- [ ] Returns serializable results
- [ ] No complex types in return values
- [ ] TypeScript compiles without errors

---

### Phase 3: Sandbox Implementation (Day 2-3)

#### Task 3.1: Create GraphRAGSandbox Class
File: `src/mcp/execution/sandbox.ts`

**Purpose:** Secure execution environment using isolated-vm

**Key features:**
- 128MB memory limit
- 5s timeout per execution
- Inject GraphRAG API functions
- Console.log support for debugging
- Proper cleanup (dispose isolates)

**Security requirements:**
- No access to fs, net, child_process
- No access to require()
- Isolated heap (cannot access parent)
- Timeout protection
- Memory limit enforcement

**Validation:**
- [ ] Can execute simple code
- [ ] Injected functions work
- [ ] Timeout triggers correctly
- [ ] Memory limit enforced
- [ ] Cannot access Node.js APIs
- [ ] No memory leaks (test with 100 executions)

#### Task 3.2: Error Handling
Add comprehensive error handling:
- Timeout errors (clear message)
- Syntax errors (show line number)
- Runtime errors (show stack trace)
- Memory errors (clear message)

**Validation:**
- [ ] Each error type has clear message
- [ ] Stack traces are useful
- [ ] Errors don't crash the server

---

### Phase 4: New MCP Server (Day 3-4)

#### Task 4.1: Create New Server File
File: `src/mcp/server-code-execution.ts`

**Strategy:**
1. Copy `src/mcp/server.ts` → `src/mcp/server-code-execution.ts`
2. Import GraphRAGSandbox
3. Initialize sandbox in constructor
4. Keep all existing tools (backwards compatible)
5. Add new `execute_graphrag_code` tool

**Validation:**
- [ ] Server starts without errors
- [ ] All existing tools still work
- [ ] Sandbox initializes correctly
- [ ] TypeScript compiles

#### Task 4.2: Add Code Execution Tool
Add to tool list:

```typescript
{
  name: 'execute_graphrag_code',
  description: 'Execute JavaScript code to perform complex GraphRAG queries...',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute' }
    },
    required: ['code']
  }
}
```

**Validation:**
- [ ] Tool appears in list_tools response
- [ ] Tool schema is valid
- [ ] Description is clear

#### Task 4.3: Implement Tool Handler
```typescript
private async handleCodeExecution(args: { code: string }): Promise<MCPResponse> {
  try {
    const result = await this.sandbox.execute(args.code);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (error) {
    // Return helpful error message
  }
}
```

**Validation:**
- [ ] Can execute simple code
- [ ] Returns results correctly
- [ ] Errors handled gracefully
- [ ] Logs execution attempts

#### Task 4.4: Cleanup on Server Close
Ensure sandbox is disposed when server closes:

```typescript
async close(): Promise<void> {
  this.sandbox.dispose();
  // ... rest of cleanup
}
```

**Validation:**
- [ ] No memory leaks on server restart
- [ ] Isolate disposed correctly

---

### Phase 5: Configuration & Scripts (Day 4)

#### Task 5.1: Add npm Scripts
Update `package.json`:

```json
{
  "scripts": {
    "mcp": "node dist/mcp/server.js",
    "mcp:dev": "tsx src/mcp/server.ts",
    "mcp:code-exec": "node dist/mcp/server-code-execution.js",
    "mcp:code-exec:dev": "tsx src/mcp/server-code-execution.ts"
  }
}
```

**Validation:**
- [ ] `npm run mcp:code-exec:dev` starts server
- [ ] Both servers can run (different processes)
- [ ] Scripts work in dev and production

#### Task 5.2: Update Build Script
Update `package.json` build script:

```json
{
  "scripts": {
    "build": "tsup src/app.ts src/export-graph-data.ts src/mcp/server.ts src/mcp/server-code-execution.ts --format esm --dts --clean"
  }
}
```

**Validation:**
- [ ] `npm run build` includes new server
- [ ] Both servers build correctly
- [ ] Type definitions generated

---

### Phase 6: Documentation (Day 5)

#### Task 6.1: Create API Reference
File: `docs/MCP-CODE-EXECUTION-API.md`

**Contents:**
- Available functions (query_repositories, etc.)
- Parameter descriptions
- Return value structures
- Example code snippets
- Common patterns
- Error handling tips

**Target:** ~300 tokens (for agent prompts)

**Validation:**
- [ ] All functions documented
- [ ] Examples are correct
- [ ] Token count is reasonable

#### Task 6.2: Update MCP Quickstart
File: `docs/MCP-QUICKSTART.md`

**Add section:**
- Two server options
- When to use each
- Configuration examples
- Claude Desktop setup for both

**Validation:**
- [ ] Clear guidance on choosing server
- [ ] Both configurations documented
- [ ] Examples are tested

---

### Phase 7: Testing (Day 5-6)

#### Task 7.1: Unit Tests for Sandbox
File: `tests/mcp/sandbox.test.ts`

**Test cases:**
- ✅ Execute simple code
- ✅ Execute async code
- ✅ Timeout enforcement
- ✅ Memory limit enforcement
- ✅ Cannot access Node.js APIs
- ✅ Console.log works
- ✅ Error handling
- ✅ Proper cleanup (no leaks)

**Validation:**
- [ ] All tests pass
- [ ] Coverage >90%

#### Task 7.2: Integration Tests
File: `tests/mcp/code-execution-e2e.test.ts`

**Test cases:**
- ✅ Multi-step query execution
- ✅ Parallel query execution
- ✅ Conditional logic
- ✅ Error recovery
- ✅ Result serialization
- ✅ Full MCP protocol flow

**Validation:**
- [ ] All tests pass
- [ ] Tests use real database

#### Task 7.3: Example Demo
File: `examples/code-execution-demo.ts`

**Demonstrate:**
- Simple query
- Multi-step query
- Parallel queries
- Custom logic (filtering, merging)
- Error handling

**Validation:**
- [ ] Example runs successfully
- [ ] Code is well-commented
- [ ] Shows best practices

---

### Phase 8: Manual Testing (Day 6-7)

#### Task 8.1: Claude Desktop Integration
Configure Claude Desktop with new server:

```json
{
  "mcpServers": {
    "graphrag-code-execution": {
      "command": "node",
      "args": ["/path/to/dist/mcp/server-code-execution.js"],
      "cwd": "/path/to/project"
    }
  }
}
```

**Test scenarios:**
1. Simple query (should work like traditional)
2. Multi-step query (agent writes code)
3. Parallel query (agent uses Promise.all)
4. Complex logic (agent implements custom filtering)
5. Error handling (intentional errors)

**Validation:**
- [ ] Server connects to Claude Desktop
- [ ] All tools visible
- [ ] Code execution works
- [ ] Results are correct
- [ ] Errors are helpful

#### Task 8.2: Performance Benchmarking
Compare traditional vs code execution server:

**Metrics:**
- Token count (tool definitions)
- Latency (simple query)
- Latency (3-step query)
- Memory usage
- Error rate

**Validation:**
- [ ] Token reduction confirmed (~73%)
- [ ] Latency improvement confirmed (~42% for multi-step)
- [ ] No memory leaks
- [ ] Error rate acceptable

---

### Phase 9: Finalization (Day 7-8)

#### Task 9.1: Code Review Prep
- [ ] All TypeScript errors resolved
- [ ] All tests passing
- [ ] ESLint checks passing
- [ ] Prettier formatting applied
- [ ] No console.logs (except in sandbox logs)
- [ ] Comments added to complex code
- [ ] TODOs resolved or documented

#### Task 9.2: Documentation Review
- [ ] API reference complete
- [ ] Quickstart updated
- [ ] Analysis document accurate
- [ ] Implementation plan updated
- [ ] README mentions both servers

#### Task 9.3: Create Summary Report
File: `docs/MCP-CODE-EXECUTION-COMPLETION-SUMMARY.md`

**Contents:**
- Implementation summary
- Performance results
- Test results
- Known limitations
- Future improvements

---

## Success Criteria

### Functional Requirements
- ✅ New MCP server runs alongside existing server
- ✅ Code execution tool works correctly
- ✅ All security measures in place (timeout, memory limit, isolation)
- ✅ Multi-step queries execute in single call
- ✅ Parallel queries work
- ✅ Error handling is robust
- ✅ Backwards compatible (traditional tools still work)

### Performance Requirements
- ✅ Token reduction: >70% (target: 73%)
- ✅ Multi-step query speedup: >30% (target: 42%)
- ✅ Memory usage: <200MB per server
- ✅ No memory leaks
- ✅ Timeout enforcement: <5.1s

### Quality Requirements
- ✅ Test coverage: >90%
- ✅ All tests passing
- ✅ TypeScript strict mode: no errors
- ✅ ESLint: no warnings
- ✅ Documentation: complete and accurate

### User Experience Requirements
- ✅ Clear documentation for choosing server
- ✅ Helpful error messages
- ✅ Examples demonstrate value
- ✅ Claude Desktop integration works

---

## Risk Management

### High Priority Risks

**Risk 1: isolated-vm compilation fails**
- **Likelihood:** Low
- **Impact:** High (blocks implementation)
- **Mitigation:** Test installation immediately; have QuickJS as backup

**Risk 2: Performance worse than expected**
- **Likelihood:** Medium
- **Impact:** Medium (defeats purpose)
- **Mitigation:** Benchmark early; optimize hot paths; keep traditional server

**Risk 3: Sandbox escape or security issue**
- **Likelihood:** Low
- **Impact:** High (security)
- **Mitigation:** Use well-tested library; regular updates; strict limits

### Medium Priority Risks

**Risk 4: Agent confusion (which server to use)**
- **Likelihood:** Medium
- **Impact:** Low (UX)
- **Mitigation:** Clear docs; good examples; support both

**Risk 5: Memory leaks**
- **Likelihood:** Medium
- **Impact:** Medium (reliability)
- **Mitigation:** Proper cleanup; leak testing; monitoring

---

## Rollback Plan

If implementation fails or shows poor results:

1. **Keep feature branch** - Don't merge to main
2. **Traditional server unchanged** - Users unaffected
3. **Document learnings** - Update analysis document
4. **Consider alternatives** - QuickJS, different approach

---

## Post-Implementation

### Immediate (Week 1)
- [ ] Monitor error rates
- [ ] Gather user feedback
- [ ] Fix critical bugs
- [ ] Performance tuning

### Short-term (Month 1)
- [ ] Analyze usage patterns
- [ ] Optimize common queries
- [ ] Add more examples
- [ ] Consider deprecating traditional server

### Long-term (Quarter 1)
- [ ] Advanced features (stateful execution, imports)
- [ ] Multi-language support (Python via Pyodide?)
- [ ] Streaming execution results
- [ ] Integration with other MCP servers

---

## Dependencies

### External Dependencies
- `isolated-vm` (critical)
- `@types/isolated-vm` (development)

### Internal Dependencies
- Existing GraphRAG components (HybridSearchEngine, QueryEngine, etc.)
- Existing MCP infrastructure (server, tools, attendant)
- SQLite database schema (unchanged)

### Development Dependencies
- Vitest (testing)
- TypeScript (type checking)
- ESLint (linting)
- tsx (development)

---

## Team Responsibilities

**Implementation:** Background agent (autonomous)  
**Review:** Human approval at key milestones  
**Testing:** Automated + manual (Claude Desktop)  
**Documentation:** Created during implementation  

---

## Timeline

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| 1. Dependencies | 0.5 day | Day 1 | Day 1 |
| 2. API Wrapper | 1 day | Day 1 | Day 2 |
| 3. Sandbox | 1.5 days | Day 2 | Day 3 |
| 4. New Server | 1.5 days | Day 3 | Day 4 |
| 5. Config/Scripts | 0.5 day | Day 4 | Day 4 |
| 6. Documentation | 1 day | Day 5 | Day 5 |
| 7. Testing | 1.5 days | Day 5 | Day 6 |
| 8. Manual Testing | 1 day | Day 6 | Day 7 |
| 9. Finalization | 1 day | Day 7 | Day 8 |
| **Total** | **8 days** | | |

---

## Next Steps

**Awaiting approval to begin implementation.**

Once approved, I will:
1. Mark first task as in-progress
2. Begin with isolated-vm installation
3. Proceed through phases sequentially
4. Update task list as I progress
5. Report completion of each phase

**Ready to begin on your command.** 🚀
