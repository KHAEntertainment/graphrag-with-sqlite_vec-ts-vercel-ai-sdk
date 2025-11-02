# Documentation Alignment Audit

**Date:** November 2, 2025
**Auditor:** Claude
**Status:** Pre-Update Analysis

---

## Purpose

This document catalogs all inconsistencies found across documentation files related to model specifications. These inconsistencies must be resolved before proceeding with implementation to prevent drift.

---

## Findings Summary

**Total Files Audited:** 16 markdown files
**Files with Inconsistencies:** 12 files
**Critical Issues:** Model naming (Granite 3.1 vs 4.0 Micro)

---

## Model Specification Inconsistencies

### Issue #1: Granite Version Confusion

**Correct Specification** (per CONSTITUTION.md):
- Model: IBM Granite 4.0 Micro
- HuggingFace ID: `ibm-granite/granite-4.0-micro`
- Roles: Query Analysis + MCP Attendant

**Incorrect References Found:**

#### Files Saying "Granite 3.1" (WRONG)

1. **CLAUDE.md** (Lines 181, 273)
   ```
   Line 181: **IBM Granite 3.1** (2B-8B)
   Line 273: LLAMACPP_MODEL_PATH=./models/granite-3.1-2b.gguf
   ```
   **Fix:** Change to "IBM Granite 4.0 Micro" and `granite-4.0-micro.gguf`

2. **README.md** (Lines 123-124, 214)
   ```
   Line 123: // Configure LLM for entity extraction (IBM Granite 3.1 2B)
   Line 124: const model = llamacpp('granite-3.1-2b-q8_0.gguf');
   Line 214: - **IBM Granite 3.1** (2B-8B)
   ```
   **Fix:** Update to Granite 4.0 Micro

3. **docs/SQLITE-VEC-INTEGRATION-PLAN.md** (Lines 287, 292)
   ```
   Line 287: | **Query Analysis** | IBM Granite 3.1 2B/8B | 2B-8B | ...
   Line 292: - **Recommended (CPU):** + Granite 3.1 2B for query analysis = ~6-7GB RAM
   ```
   **Fix:** Change to Granite 4.0 Micro (~3B)

4. **docs/SQLITE-VEC-STATUS-CURRENT.md** (Line 95)
   ```
   Line 95: - **Query Analysis:** IBM Granite 3.1 (2B-8B)
   ```
   **Fix:** Change to IBM Granite 4.0 Micro

5. **docs/MCP-QUICKSTART.md** (Line 19)
   ```
   Line 19: | **Query Analysis** | IBM Granite 3.1 | 2B-8B | Powers dynamic hybrid search |
   ```
   **Fix:** Update to Granite 4.0 Micro

6. **docs/DYNAMIC-HYBRID-SEARCH-INTEGRATION.md** (Lines 635, 639)
   ```
   Line 635: IBM Granite 3.1 (2B-8B) - Powers dynamic hybrid search classification
   Line 639: Minimum: 4-5GB RAM (Triplex + Granite Embedding) Recommended: 6-7GB RAM (+ Granite 3.1 2B)
   ```
   **Fix:** Update to Granite 4.0 Micro

7. **docs/MARKDOWN-INGESTION.md** (Line 410)
   ```
   Line 410: llamacppModelPath: './models/granite-3.1-2b.gguf' // Smaller, faster
   ```
   **Fix:** Change to `granite-4.0-micro.gguf`

#### Files Correctly Saying "Granite 4.0 Micro" (CORRECT ✅)

These files are already correct:

1. **docs/EMBEDDING-USAGE.md** (Lines 28, 182, 229, 311, 340)
2. **docs/MCP-SERVER-USAGE.md** (Line 511)
3. **docs/MCP-SERVER-ARCHITECTURE.md** (Lines 43, 390)
4. **docs/MCP-LOCAL-FIRST-ARCHITECTURE.md** (Lines 22, 436, 525)
5. **docs/MCP-QUICKSTART.md** (Line 143)
6. **docs/planning/PHASE-4-INTEGRATION-PLAN.md** (Lines 163, 704, 842, 922)

---

## Other Potential Drift Issues

### Issue #2: Missing Constitution References

**Finding:** No documentation currently references CONSTITUTION.md as source of truth

**Required Actions:**
- Add Constitution link to CLAUDE.md header
- Add Constitution link to README.md
- Add Constitution link to all docs/ files that specify models
- Create AGENTS.md with Constitution link

### Issue #3: No AGENTS.md File

**Finding:** AGENTS.md does not exist

**Impact:** No centralized guidance for autonomous coding agents

**Required Action:** Create AGENTS.md with:
- Link to CONSTITUTION.md
- Agent-specific workflows
- Code quality standards
- Testing requirements

### Issue #4: Inconsistent HuggingFace ID Format

**Finding:** Some files use short names, others use full IDs

**Examples:**
```
❌ "Triplex (3.8B)"
✅ "SciPhi/Triplex"

❌ "Granite Embedding 125M"
✅ "ibm-granite/granite-embedding-125m-english"
```

**Required Action:** Standardize to full HuggingFace IDs everywhere

---

## Update Priority Matrix

| File | Priority | Issue | Lines Affected |
|------|----------|-------|----------------|
| **CLAUDE.md** | 🔴 HIGH | Granite 3.1 → 4.0 Micro | 181, 273 |
| **README.md** | 🔴 HIGH | Granite 3.1 → 4.0 Micro | 123-124, 214 |
| **docs/SQLITE-VEC-INTEGRATION-PLAN.md** | 🔴 HIGH | Granite 3.1 → 4.0 Micro | 287, 292 |
| **docs/SQLITE-VEC-STATUS-CURRENT.md** | 🟡 MEDIUM | Granite 3.1 → 4.0 Micro | 95 |
| **docs/MCP-QUICKSTART.md** | 🟡 MEDIUM | Granite 3.1 → 4.0 Micro | 19 |
| **docs/DYNAMIC-HYBRID-SEARCH-INTEGRATION.md** | 🟡 MEDIUM | Granite 3.1 → 4.0 Micro | 635, 639 |
| **docs/MARKDOWN-INGESTION.md** | 🟡 MEDIUM | Granite 3.1 → 4.0 Micro | 410 |
| **ALL FILES** | 🟢 LOW | Add Constitution link | Headers |
| **AGENTS.md** | 🟢 LOW | Create file | N/A |

---

## Code File Audit

### Source Code Model References

**Files Checked:**
- `src/lib/query-analyzer.ts`
- `src/mcp/attendant/granite-micro.ts`
- `src/lib/embedding-manager.ts`
- `src/lib/document-processor.ts`

**Findings:**

#### ✅ CORRECT: Code Uses Generic Interfaces

Good news! The code is **model-agnostic** and uses generic LLM interfaces:

```typescript
// src/lib/query-analyzer.ts
constructor(model?: LanguageModelV1) {
  this.model = model;
}
```

This means:
- No hardcoded model names in source code ✅
- Model is configured via environment variables ✅
- Easy to swap models without code changes ✅

**However, comments mention models:**

```typescript
// src/lib/query-analyzer.ts:8
// - Query Analysis: IBM Granite 3.1 (2B-8B) ❌ WRONG
```

**Action Required:** Update code comments to reference Granite 4.0 Micro

---

## Recommended Update Sequence

### Phase 1: Foundation (Do First)
1. ✅ Create CONSTITUTION.md (DONE)
2. Create AGENTS.md
3. Update CLAUDE.md header with Constitution link

### Phase 2: Critical Documentation
4. Update CLAUDE.md model specs (Lines 181, 273)
5. Update README.md model specs (Lines 123-124, 214)
6. Update docs/SQLITE-VEC-INTEGRATION-PLAN.md (Lines 287, 292)

### Phase 3: Supporting Documentation
7. Update docs/SQLITE-VEC-STATUS-CURRENT.md (Line 95)
8. Update docs/MCP-QUICKSTART.md (Line 19)
9. Update docs/DYNAMIC-HYBRID-SEARCH-INTEGRATION.md (Lines 635, 639)
10. Update docs/MARKDOWN-INGESTION.md (Line 410)

### Phase 4: Source Code Comments
11. Update src/lib/query-analyzer.ts comment (Line 8)
12. Update src/mcp/tools/hybrid-search.ts comment (Line 19)
13. Verify all code comments reference correct models

### Phase 5: Cross-References
14. Add Constitution links to all documentation headers
15. Update VALIDATION-REPORT.md to reflect resolution
16. Create docs/MODELS.md as quick reference (links to Constitution)

---

## Verification Checklist

After updates, verify:

- [ ] All docs say "Granite 4.0 Micro" (not "Granite 3.1")
- [ ] All .gguf references are `granite-4.0-micro.gguf`
- [ ] All HuggingFace IDs match CONSTITUTION.md
- [ ] CLAUDE.md links to CONSTITUTION.md
- [ ] AGENTS.md exists and links to CONSTITUTION.md
- [ ] README.md references CONSTITUTION.md for model details
- [ ] Code comments match CONSTITUTION.md specs
- [ ] No orphaned references to old models

---

## Post-Update Actions

Once all updates complete:

1. **Run Global Search**
   ```bash
   # Search for any remaining "granite-3.1" or "Granite 3.1"
   rg -i "granite.?3\.1" --type md
   ```

2. **Commit Changes**
   ```bash
   git add .
   git commit -m "Align all documentation with CONSTITUTION.md model specifications

   - Update all Granite 3.1 references to Granite 4.0 Micro
   - Add Constitution links to CLAUDE.md and AGENTS.md
   - Standardize HuggingFace ID format
   - Update code comments to match canonical specs"
   ```

3. **Create Docs Cross-Reference**
   - Add "See Also" sections linking related docs
   - Ensure all model specs point to CONSTITUTION.md

---

## Summary

**Total Changes Required:** ~15 files
**Critical Priority:** 3 files (CLAUDE.md, README.md, SQLITE-VEC-INTEGRATION-PLAN.md)
**Medium Priority:** 4 files (supporting docs)
**Low Priority:** 8 files (cross-references, AGENTS.md creation)

**Estimated Time:** 30-45 minutes for all updates

**Risk:** Low - Changes are mechanical find/replace operations
**Impact:** High - Prevents future drift and ensures consistency

---

**END OF AUDIT REPORT**
