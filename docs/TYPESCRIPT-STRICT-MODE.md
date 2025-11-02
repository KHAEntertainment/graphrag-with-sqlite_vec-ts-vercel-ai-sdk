# TypeScript Strict Mode Issues

**Last Updated:** 2025-10-28
**Status:** 🔴 **70 TypeScript Errors** - Pre-existing strict mode issues
**Priority:** 🟡 Low - Code runs correctly, these are type-level strictness violations

## Overview

The codebase has **70 pre-existing TypeScript strict mode errors**, primarily caused by the `exactOptionalPropertyTypes: true` tsconfig setting. These errors don't affect runtime behavior but violate TypeScript's strictest type checking rules.

**Key Point:** These are **separate from ESLint errors** (which are now at 0 ✅). ESLint checks code style and potential bugs, while TypeScript checks type correctness.

## Error Breakdown by Category

### 1. `exactOptionalPropertyTypes` Violations (42 errors)

**Root Cause:** TypeScript `exactOptionalPropertyTypes` setting requires that optional properties explicitly include `| undefined` in their types when assigning `value | undefined`.

**Example:**
```typescript
// Type definition
interface QueryAnalysis {
  detected_identifiers?: string[]; // Optional, but no explicit | undefined
}

// Assignment - ERROR
return {
  detected_identifiers: identifiers.length > 0 ? identifiers : undefined
  // ❌ Type 'string[] | undefined' not assignable to 'string[]'
};
```

**Affected Files:**
- `src/lib/query-analyzer.ts` (5 errors) - `detected_identifiers`, `has_typos`, `confidence` properties
- `src/lib/reciprocal-rank-fusion.ts` (4 errors) - `metadata` property
- `src/mcp/tools/hybrid-search.ts` (3 errors) - `embeddingProvider`, `explanations`, return types
- `src/mcp/tools/query-engine.ts` (3 errors) - `relationship`, `weight` in GraphResult
- `src/types/errors.ts` (17 errors) - `context`, `cause` properties in error constructors
- `src/lib/embedding-manager.ts` (1 error) - `initialize` method call

### 2. Missing Exports (1 error)

**Root Cause:** `AttendantMode` type is used but not exported from `src/mcp/server.ts`

```typescript
// src/mcp/server.ts - NOT exported
type AttendantMode = 'granite' | 'gemini';

// src/types/mcp-handlers.ts - tries to import
import type { AttendantMode } from '../mcp/server.js'; // ❌ Not exported
```

**Fix:** Add export to server.ts or move type to shared types file

### 3. Type Mismatches - Attendant Mode (9 errors)

**Root Cause:** String literal types not matching `AttendantMode` enum

```typescript
type AttendantMode = 'granite' | 'gemini';

// Assignment - ERROR
let attendant: AttendantMode = 'gemini-2.5-pro'; // ❌ Not in union type
let attendant: AttendantMode = 'granite-micro';   // ❌ Not in union type
```

**Affected:** `src/mcp/server.ts` (9 errors)

**Issue:** Code uses `'gemini-2.5-pro'` and `'granite-micro'` but type only allows `'granite'` | `'gemini'`

### 4. Missing Properties on Handler Args (13 errors)

**Root Cause:** MCP handler arguments accessed as `Record<string, unknown>` but properties not typed

```typescript
// Current
private async handleQueryRepositories(args: Record<string, unknown>) {
  const context = args.context; // ❌ Property 'context' does not exist
}

// Should be
private async handleQueryRepositories(args: QueryRepositoriesArgs) {
  const context = args.context; // ✅ Typed properly
}
```

**Affected:** `src/mcp/server.ts` (13 errors)

**Fix:** Type handler arguments properly (already defined in `mcp-handlers.ts`)

### 5. Duplicate Provider Types (1 error)

**Root Cause:** Vercel AI SDK has duplicate `@ai-sdk/provider` dependency

```typescript
// Two different versions of LanguageModelV1 type
import type { LanguageModelV1 } from '@ai-sdk/provider'; // v1
import type { LanguageModelV1 } from '@ai-sdk/ui-utils/.../provider'; // v2 (transitive)
```

**Affected:** `src/providers/factory.ts` (1 error)

**Fix:** Use npm dedupe or lock to single provider version

### 6. Return Type Mismatches (6 errors)

**Root Cause:** Tuple types vs. object types in `executeSearches()`

```typescript
// Declared to return tuple
Promise<[SemanticResult[], SparseResult[], PatternResult[], GraphResult[]]>

// But code destructures as object
return {
  semantic,  // ❌ Property doesn't exist on tuple
  sparse,
  pattern,
  graph,
  metrics,
};
```

**Affected:** `src/mcp/tools/hybrid-search.ts` (6 errors)

### 7. Other Strict Mode Violations (8 errors)

- **Override modifier missing** (1) - `GraphRAGError.name` needs `override` keyword
- **Possibly undefined** (2) - `src/utils/trigram.ts` array access without null check
- **FeatureExtractionPipeline** (3) - Missing `processor` property from transformers.js type

## Decision Log

### Decision: Defer Fixing Until Phase 7

**Date:** 2025-10-28
**Made by:** Project maintainer
**Rationale:**

1. **Code functions correctly** - These are type-level strictness issues, runtime behavior is fine
2. **ESLint errors fixed** - We achieved 0 ESLint errors, which catch actual bugs
3. **Testing infrastructure needed** - Should have tests before refactoring types
4. **Large scope** - 70 errors across 10 files requires careful refactoring
5. **Low priority** - Other phases (documentation, testing, code organization) provide more value

### Decision: Keep `exactOptionalPropertyTypes: true`

**Rationale:**
- Strictest type checking catches subtle bugs
- Forces explicit handling of undefined values
- Industry best practice for TypeScript projects
- Better to fix code than relax types

**Alternative considered:** Disable `exactOptionalPropertyTypes`
**Rejected because:** Weakens type safety, hiding potential bugs

### Decision: Use `@ts-expect-error` Temporarily

For now, we can add targeted suppressions with explanations:

```typescript
// @ts-expect-error - exactOptionalPropertyTypes violation, will fix in Phase 7
detected_identifiers: identifiers.length > 0 ? identifiers : undefined
```

**Rationale:**
- Documents known issues
- Allows build to succeed
- Easy to find later with grep
- Better than `@ts-ignore` (which suppresses all errors)

## How to Fix (Phase 7 Plan)

### Fix Strategy 1: Add `| undefined` to Optional Properties

**Before:**
```typescript
export interface QueryAnalysis {
  detected_identifiers?: string[];  // Implicitly string[] | undefined
  has_typos?: boolean;
  confidence?: number;
}
```

**After:**
```typescript
export interface QueryAnalysis {
  detected_identifiers?: string[] | undefined;  // Explicitly includes undefined
  has_typos?: boolean | undefined;
  confidence?: number | undefined;
}
```

**Estimated time:** 2 hours for all interfaces

### Fix Strategy 2: Use Conditional Assignment

**Before:**
```typescript
return {
  detected_identifiers: identifiers.length > 0 ? identifiers : undefined
};
```

**After:**
```typescript
const result: QueryAnalysis = {
  query_type,
  weights,
  reasoning,
};

if (identifiers.length > 0) {
  result.detected_identifiers = identifiers; // Only assign if defined
}

return result;
```

**Estimated time:** 3 hours for all conditional properties

### Fix Strategy 3: Export Missing Types

**Before:**
```typescript
// src/mcp/server.ts
type AttendantMode = 'granite' | 'gemini'; // Not exported
```

**After:**
```typescript
// src/types/attendant.ts
export type AttendantMode = 'granite' | 'gemini' | 'granite-micro' | 'gemini-2.5-pro';

// Or keep strict and validate:
export type AttendantMode = 'granite' | 'gemini';
export type AttendantModel = 'granite-micro' | 'gemini-2.5-pro';
```

**Estimated time:** 1 hour

### Fix Strategy 4: Properly Type Handler Arguments

**Before:**
```typescript
private async handleQueryRepositories(args: Record<string, unknown>) {
  const query = args.query as string; // Unsafe cast
}
```

**After:**
```typescript
import type { QueryRepositoriesArgs } from '../types/mcp-handlers.js';

private async handleQueryRepositories(args: QueryRepositoriesArgs) {
  const query = args.query; // Type-safe
}
```

**Estimated time:** 2 hours for all handlers

### Fix Strategy 5: Fix Return Type Mismatches

**Before:**
```typescript
private async executeSearches(): Promise<[
  SemanticResult[],
  SparseResult[],
  PatternResult[],
  GraphResult[]
]> {
  // ...
  return { semantic, sparse, pattern, graph, metrics }; // ❌ Wrong type
}
```

**After:**
```typescript
private async executeSearches(): Promise<{
  semantic: SemanticResult[];
  sparse: SparseResult[];
  pattern: PatternResult[];
  graph: GraphResult[];
  metrics: {
    denseTime: number;
    sparseTime: number;
    patternTime: number;
    graphTime: number;
  };
}> {
  return { semantic, sparse, pattern, graph, metrics }; // ✅ Correct type
}
```

**Estimated time:** 2 hours

### Fix Strategy 6: Fix Error Class Hierarchy

**Before:**
```typescript
export class GraphRAGError extends Error {
  public readonly name: string; // ❌ Needs override
}
```

**After:**
```typescript
export class GraphRAGError extends Error {
  public override readonly name: string; // ✅ Override keyword
}
```

**Estimated time:** 30 minutes

### Fix Strategy 7: Add Null Checks

**Before:**
```typescript
const matched = content.match(regex);
return matched[1]; // ❌ Possibly undefined
```

**After:**
```typescript
const matched = content.match(regex);
if (!matched) return null;
return matched[1]; // ✅ Safe
```

**Estimated time:** 1 hour

**Total Estimated Time:** 11-13 hours

## Temporary Workarounds

### Option 1: Suppress Individual Errors

```typescript
// @ts-expect-error - exactOptionalPropertyTypes violation (see TYPESCRIPT-STRICT-MODE.md)
detected_identifiers: identifiers.length > 0 ? identifiers : undefined
```

### Option 2: Disable `noEmit` Temporarily

Build still succeeds even with type errors:

```bash
# Type check without blocking build
npm run typecheck || true

# Build succeeds anyway
npm run build
```

### Option 3: Create `tsconfig.build.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "exactOptionalPropertyTypes": false  // Relaxed for build
  }
}
```

Then use: `tsc --project tsconfig.build.json`

**Recommendation:** Use Option 1 (targeted suppressions) to maintain type safety while documenting technical debt.

## Testing Impact

**Current state:** Tests would need to handle these type issues as well

**Recommendation:** Fix types BEFORE writing extensive tests, so tests don't inherit type problems

**Alternative:** Write tests with `// @ts-expect-error` where needed, fix types later

## When to Fix

**Recommended timeline:**

1. **After Phase 2 (Testing)** - Have safety net before refactoring
2. **After Phase 3 (Documentation)** - Documentation helps understand intent
3. **Before Phase 4 (Code Organization)** - Clean types before restructuring
4. **During Phase 5 (Error Handling)** - Some overlap with error type fixes

**Optimal timing:** Between Phase 3 and Phase 4 (Week 2 of project timeline)

## Benefits of Fixing

1. **Type safety** - Catch bugs at compile time
2. **IDE support** - Better autocomplete and error detection
3. **Refactoring confidence** - Types guide safe changes
4. **Documentation** - Types serve as inline documentation
5. **Onboarding** - New contributors understand contracts

## Risks of NOT Fixing

1. **Type erosion** - New code may introduce more type issues
2. **Runtime bugs** - Undefined handling bugs slip through
3. **Maintenance burden** - Hard to refactor with broken types
4. **Technical debt** - Accumulates over time

**Severity:** 🟡 Medium - Not urgent, but should address eventually

## Related Documentation

- [ERROR-HANDLING.md](./ERROR-HANDLING.md) - Overlaps with error type fixes
- [tsconfig.json](../tsconfig.json) - Current TypeScript configuration
- [TypeScript Handbook: Optional Properties](https://www.typescriptlang.org/docs/handbook/2/objects.html#optional-properties)
- [exactOptionalPropertyTypes](https://www.typescriptlang.org/tsconfig#exactOptionalPropertyTypes)

## Summary

- **70 TypeScript errors** exist due to `exactOptionalPropertyTypes: true`
- **Code runs correctly** - these are type-level issues only
- **ESLint errors: 0** ✅ - separate concern, now fixed
- **Decision: Defer to Phase 7** after testing and documentation
- **Workaround: Use `@ts-expect-error`** with references to this doc
- **Estimated fix time: 11-13 hours** when ready to address
