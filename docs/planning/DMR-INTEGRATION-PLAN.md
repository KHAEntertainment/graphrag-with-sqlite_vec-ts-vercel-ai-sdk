# Docker Model Runner (DMR) Integration Plan

**Status:** Planning Phase
**Priority:** High (CLI Migration Dependency)
**Complexity:** Low (OpenAI-Compatible)
**Date:** November 2, 2025
**Version:** 1.0.0

> **📖 Source of Truth:** See [CONSTITUTION.md](../../CONSTITUTION.md) for locked model specifications

---

## Table of Contents

- [Overview](#overview)
- [Architecture Analysis](#architecture-analysis)
- [Model Mapping](#model-mapping)
- [Implementation Plan](#implementation-plan)
- [Configuration](#configuration)
- [Testing Strategy](#testing-strategy)
- [Migration Path](#migration-path)

---

## Overview

### Motivation

Docker Model Runner (DMR) provides an OpenAI-compatible API for local model inference via Docker. This integration enables:

1. **Unified Deployment:** Docker-based model serving (replacing llama.cpp)
2. **OpenAI Compatibility:** Seamless integration with Vercel AI SDK's OpenAI provider
3. **CLI Integration:** Aligns with Legilimens CLI migration to DMR
4. **No Model Stack Changes:** Uses same models (Triplex, Granite 4.0 Micro, Granite Embedding)

### Key Advantage

DMR exposes OpenAI-compatible endpoints, meaning we can **reuse the existing `@ai-sdk/openai` provider** with minimal changes. No custom adapter needed!

### DMR Endpoints (OpenAI-Compatible)

```
Base URL: http://localhost:12434/

- Chat Completions: POST /engines/llama.cpp/v1/chat/completions
- Completions: POST /engines/llama.cpp/v1/completions
- Embeddings: POST /engines/llama.cpp/v1/embeddings
- List Models: GET /engines/llama.cpp/v1/models
- Get Model: GET /engines/llama.cpp/v1/models/{namespace}/{name}
```

### Scope

**In Scope:**
- DMR provider implementation using `@ai-sdk/openai`
- Docker/DMR detection and validation
- Model pull automation (optional)
- Configuration via environment variables
- Integration with existing provider factory

**Out of Scope:**
- DMR installation (user responsibility or separate CLI tool)
- Docker installation
- Model quantization (use pre-quantized models from Docker Hub)
- Custom DMR endpoints beyond OpenAI compatibility

---

## Architecture Analysis

### Current Provider Architecture

```
src/providers/
├── factory.ts        # createLanguageModel() - Provider selection
├── config.ts         # Environment variable loading
├── llamacpp.ts       # llama.cpp provider (to be replaced)
└── openai.ts         # OpenAI provider (can be reused!)
```

**Key Insight:** The existing `openai.ts` provider already wraps `@ai-sdk/openai`. We just need to:
1. Point it to a different base URL (`http://localhost:12434/`)
2. Use DMR model names (e.g., `ai/granite-4.0-micro`)

### Proposed DMR Provider Architecture

**Option A: Dedicated DMR Provider** (Recommended)
```typescript
// src/providers/dmr.ts
import { createOpenAI } from '@ai-sdk/openai';

export function createDMRProvider(config: DMRConfig) {
  return createOpenAI({
    baseURL: config.baseURL || 'http://localhost:12434/engines/llama.cpp/v1',
    apiKey: 'dmr-not-required', // DMR doesn't need API keys
  });
}
```

**Option B: Extend OpenAI Provider** (Alternative)
```typescript
// Modify src/providers/openai.ts to detect DMR mode
if (config.provider === 'dmr') {
  baseURL = 'http://localhost:12434/engines/llama.cpp/v1';
}
```

**Recommendation:** Use Option A for clarity and separation of concerns.

### Integration with Provider Factory

**Current:**
```typescript
// src/providers/factory.ts
export function createLanguageModel(config: ProviderConfig) {
  switch (config.provider) {
    case 'llamacpp': return createLlamaCppProvider(config);
    case 'openai': return createOpenAIProvider(config);
    default: throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

**After DMR Integration:**
```typescript
export function createLanguageModel(config: ProviderConfig) {
  switch (config.provider) {
    case 'llamacpp': return createLlamaCppProvider(config); // Keep for backward compat
    case 'openai': return createOpenAIProvider(config);
    case 'dmr': return createDMRProvider(config); // New!
    default: throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

---

## Model Mapping

### Locked Model Stack (CONSTITUTION.md)

| Role | Official Model | HuggingFace ID | DMR Model Name (Docker Hub) |
|------|---------------|----------------|------------------------------|
| **Triple Extraction** | SciPhi Triplex | `SciPhi/Triplex` | `ai/triplex:3.8B-Q4_K_M` ✅ |
| **Embeddings** | IBM Granite Embedding 125M | `ibm-granite/granite-embedding-125m-english` | `ai/granite-embedding:125m` ✅ |
| **Query Analysis** | IBM Granite 4.0 Micro | `ibm-granite/granite-4.0-micro` | `ai/granite-4.0:micro-Q4_K_M` ✅ |
| **MCP Attendant** | IBM Granite 4.0 Micro | `ibm-granite/granite-4.0-micro` | `ai/granite-4.0:micro-Q4_K_M` ✅ |
| **Optional Reasoning** | TIGER-Lab StructLM-7B | `TIGER-Lab/StructLM-7B` | `ai/structlm:7b-Q4_K_M` ⚠️ |

**Notes:**
- ✅ Model names are illustrative (check Docker Hub AI Catalog for actual names)
- ⚠️ StructLM may not be available on Docker Hub yet (optional anyway)
- Quantization: Use Q4_K_M for balance (CPU inference)

### Model Name Configuration

**Environment Variables:**
```bash
# DMR Provider
AI_PROVIDER=dmr
DMR_BASE_URL=http://localhost:12434     # Optional, defaults to localhost:12434
DMR_MODEL_TRIPLEX=ai/triplex:3.8B-Q4_K_M
DMR_MODEL_GRANITE_MICRO=ai/granite-4.0:micro-Q4_K_M
DMR_MODEL_GRANITE_EMBEDDING=ai/granite-embedding:125m
```

**Fallback Strategy:**
If a model isn't available in DMR:
1. Log warning
2. Fall back to llamacpp (if configured)
3. Fall back to OpenAI API (if configured)
4. Error if no fallback available

---

## Implementation Plan

### Phase 1: DMR Provider Core (1-2 days)

**Goal:** Basic DMR provider using OpenAI SDK

**Tasks:**

1. **Create DMR Provider File** (`src/providers/dmr.ts`)
   - Import `@ai-sdk/openai`
   - Configure base URL to `http://localhost:12434/engines/llama.cpp/v1`
   - Handle model name mapping
   - Export `createDMRProvider()` function

2. **Update Provider Factory** (`src/providers/factory.ts`)
   - Add `'dmr'` case to switch statement
   - Call `createDMRProvider(config)`

3. **Update Provider Config** (`src/providers/config.ts`)
   - Add DMR environment variables:
     - `DMR_BASE_URL` (optional)
     - `DMR_MODEL` (for generic use)
     - Role-specific models (Triplex, Granite Micro, etc.)

4. **Update Type Definitions** (`src/types/index.ts` or new `src/types/provider.ts`)
   - Add `'dmr'` to `ProviderType` union
   - Define `DMRConfig` interface

**Acceptance Criteria:**
- Can instantiate DMR provider via `createLanguageModel({ provider: 'dmr' })`
- Provider returns OpenAI SDK instance pointed at DMR
- No actual Docker/DMR validation yet (comes in Phase 2)

---

### Phase 2: Docker/DMR Detection & Validation (1-2 days)

**Goal:** Detect Docker and DMR availability, validate setup

**Tasks:**

1. **Create DMR Utilities** (`src/utils/dmr-helpers.ts`)

   **Function: `isDockerInstalled()`**
   ```typescript
   // Check if Docker is installed
   // Run: docker --version
   // Returns: boolean
   ```

   **Function: `isDMRInstalled()`**
   ```typescript
   // Check if DMR plugin is installed
   // Run: docker model version
   // Returns: boolean
   ```

   **Function: `listDMRModels()`**
   ```typescript
   // List locally available models
   // Run: docker model list
   // Returns: string[] (model names)
   ```

   **Function: `isDMRModelAvailable(modelName: string)`**
   ```typescript
   // Check if specific model is pulled
   // Uses listDMRModels() output
   // Returns: boolean
   ```

   **Function: `testDMRConnection()`**
   ```typescript
   // Test DMR API is reachable
   // Fetch GET http://localhost:12434/engines/llama.cpp/v1/models
   // Returns: { available: boolean, error?: string }
   ```

2. **Create DMR Validator** (`src/lib/dmr-validator.ts`)

   **Function: `validateDMRSetup(config: DMRConfig)`**
   ```typescript
   // Full DMR setup validation
   // 1. Check Docker installed
   // 2. Check DMR plugin installed
   // 3. Test DMR API connection
   // 4. Check required models are pulled
   // Returns: ValidationResult with detailed errors/warnings
   ```

3. **Integrate Validation**
   - Call `validateDMRSetup()` when DMR provider is selected
   - Provide helpful error messages if setup incomplete
   - Option to skip validation (for CI/CD environments)

**Acceptance Criteria:**
- Can detect Docker installation
- Can detect DMR plugin installation
- Can list available models
- Provides clear error messages for missing dependencies
- Validation can be disabled via env var (`DMR_SKIP_VALIDATION=true`)

---

### Phase 3: Model Management (Optional, 2-3 days)

**Goal:** Automate model pulling (optional convenience feature)

**Tasks:**

1. **Create Model Manager** (`src/lib/dmr-model-manager.ts`)

   **Function: `pullModel(modelName: string)`**
   ```typescript
   // Pull a model via CLI
   // Run: docker model pull <modelName>
   // Show progress (if possible)
   // Returns: Promise<{ success: boolean, error?: string }>
   ```

   **Function: `ensureModelsAvailable(models: string[])`**
   ```typescript
   // Check if models are available, pull if missing
   // For each model:
   //   1. Check if pulled (isDMRModelAvailable)
   //   2. If not, prompt user or auto-pull (configurable)
   // Returns: Promise<{ allAvailable: boolean, missing: string[] }>
   ```

2. **Interactive Setup**
   - CLI command: `npm run dmr:setup`
   - Prompts user to pull missing models
   - Validates setup after pulling

**Acceptance Criteria:**
- Can pull models via `pullModel()`
- `ensureModelsAvailable()` identifies missing models
- Setup script guides user through model installation
- **Note:** This phase is optional and can be deferred

---

### Phase 4: Integration & Testing (2-3 days)

**Goal:** End-to-end integration and testing

**Tasks:**

1. **Update Examples**
   - Create `examples/dmr-example.ts`
   - Demonstrate DMR provider usage
   - Show chat completions and embeddings

2. **Update Documentation**
   - Add DMR setup guide to `docs/DMR-SETUP.md`
   - Update `README.md` with DMR quickstart
   - Update `CLAUDE.md` and `AGENTS.md` with DMR instructions

3. **Write Tests**
   - Unit tests for DMR provider (`tests/providers/dmr.test.ts`)
   - Integration tests for DMR detection (`tests/utils/dmr-helpers.test.ts`)
   - Mock Docker CLI for CI/CD environments
   - E2E tests with real DMR (manual or Docker-in-Docker)

4. **Update Environment Templates**
   - Add DMR config to `.env.example`
   - Document all DMR environment variables

**Acceptance Criteria:**
- Example code runs successfully with DMR
- Documentation is complete and accurate
- Tests pass (with mocks for CI)
- `.env.example` includes DMR configuration

---

### Phase 5: Migration & Deprecation (Optional)

**Goal:** Deprecate llamacpp provider (optional)

**Tasks:**

1. **Deprecation Notice**
   - Add deprecation warning to llamacpp provider
   - Update docs recommending DMR over llamacpp

2. **Migration Script**
   - Script to convert `.env` from llamacpp to DMR
   - Mapping llamacpp model paths to DMR model names

3. **Backward Compatibility**
   - Keep llamacpp provider for now (deprecated but functional)
   - Consider removing in v2.0.0

**Acceptance Criteria:**
- Deprecation warnings logged when using llamacpp
- Migration script converts `.env` correctly
- Both providers work side-by-side

---

## Configuration

### Environment Variables

**Required:**
```bash
AI_PROVIDER=dmr
```

**Optional:**
```bash
# DMR Connection
DMR_BASE_URL=http://localhost:12434              # Default if omitted
DMR_SKIP_VALIDATION=false                         # Skip setup checks (CI/CD)

# Model Names (Defaults aligned with CONSTITUTION.md locked stack)
DMR_MODEL_TRIPLEX=ai/triplex:3.8B-Q4_K_M
DMR_MODEL_GRANITE_MICRO=ai/granite-4.0:micro-Q4_K_M
DMR_MODEL_GRANITE_EMBEDDING=ai/granite-embedding:125m
DMR_MODEL_STRUCTLM=ai/structlm:7b-Q4_K_M         # Optional reasoning

# Generic Model (Fallback)
DMR_MODEL=ai/granite-4.0:micro-Q4_K_M            # Used if role-specific not set
```

**From Containers (Docker Desktop):**
```bash
DMR_BASE_URL=http://model-runner.docker.internal:12434
```

**From Containers (Docker Engine):**
```bash
DMR_BASE_URL=http://172.17.0.1:12434
# Or with extra_hosts: DMR_BASE_URL=http://model-runner.docker.internal:12434
```

### Configuration File Structure

**`src/types/provider.ts` (new or extend existing):**
```typescript
export interface DMRConfig {
  baseURL: string;
  models: {
    triplex: string;
    graniteMicro: string;
    graniteEmbedding: string;
    structLM?: string;
  };
  skipValidation: boolean;
}

export type ProviderType = 'llamacpp' | 'openai' | 'dmr';
```

---

## Testing Strategy

### Unit Tests

**File:** `tests/providers/dmr.test.ts`

**Test Cases:**
1. ✅ DMR provider creates OpenAI SDK instance
2. ✅ Base URL is correctly set to DMR endpoint
3. ✅ Model names are correctly mapped
4. ✅ Configuration is loaded from environment variables
5. ✅ Throws error if DMR_BASE_URL is invalid

**File:** `tests/utils/dmr-helpers.test.ts`

**Test Cases:**
1. ✅ `isDockerInstalled()` detects Docker correctly (mocked CLI)
2. ✅ `isDMRInstalled()` detects DMR plugin (mocked CLI)
3. ✅ `listDMRModels()` parses `docker model list` output
4. ✅ `isDMRModelAvailable()` checks model existence
5. ✅ `testDMRConnection()` validates API connectivity (mocked HTTP)

### Integration Tests

**File:** `tests/integration/dmr-e2e.test.ts`

**Test Cases (Requires DMR Running):**
1. ✅ Chat completion via DMR provider
2. ✅ Embedding generation via DMR provider
3. ✅ Model listing via DMR API
4. ✅ Error handling for unavailable models
5. ✅ Fallback behavior when DMR is unavailable

**Note:** E2E tests should be:
- Skippable in CI (unless Docker-in-Docker is set up)
- Tagged as `@integration` or `@dmr`
- Run manually or in dedicated test environment

### Manual Testing

**Checklist:**
- [ ] Install DMR locally
- [ ] Pull Granite 4.0 Micro model
- [ ] Set `AI_PROVIDER=dmr` in `.env`
- [ ] Run `npm run dev`
- [ ] Test entity extraction
- [ ] Test embedding generation
- [ ] Test query analysis
- [ ] Test MCP server
- [ ] Verify error messages when DMR is not running

---

## Migration Path

### From llama.cpp to DMR

**Step 1: Install DMR**
```bash
# Check if Docker is installed
docker --version

# Install DMR plugin (Linux)
sudo apt-get update
sudo apt-get install docker-model-plugin

# Or install via Docker Desktop GUI (Windows/Mac)
```

**Step 2: Pull Models**
```bash
# Pull Granite 4.0 Micro (query analysis + attendant)
docker model pull ai/granite-4.0:micro-Q4_K_M

# Pull Triplex (triple extraction)
docker model pull ai/triplex:3.8B-Q4_K_M

# Pull Granite Embedding (embeddings)
docker model pull ai/granite-embedding:125m

# Verify
docker model list
```

**Step 3: Update Environment Variables**
```bash
# Before (llamacpp)
AI_PROVIDER=llamacpp
LLAMACPP_MODEL_PATH=./models/granite-4.0-micro.gguf

# After (DMR)
AI_PROVIDER=dmr
DMR_MODEL_GRANITE_MICRO=ai/granite-4.0:micro-Q4_K_M
```

**Step 4: Test**
```bash
# Run application
npm run dev

# Or test MCP server
npm run mcp:dev
```

**Step 5: Remove llamacpp Models (Optional)**
```bash
# Free up disk space
rm -rf ./models/*.gguf
```

---

## Error Handling

### Common Errors & Solutions

**Error:** `docker: 'model' is not a docker command`
- **Cause:** DMR plugin not installed
- **Solution:** Install DMR via `sudo apt-get install docker-model-plugin` or Docker Desktop

**Error:** `ECONNREFUSED` when connecting to DMR
- **Cause:** DMR API not running or wrong port
- **Solution:**
  - Verify DMR is enabled: `docker model version`
  - Check TCP is enabled (Docker Desktop settings)
  - Try base URL: `http://localhost:12434`

**Error:** `Model not found: ai/granite-4.0:micro-Q4_K_M`
- **Cause:** Model not pulled locally
- **Solution:** `docker model pull ai/granite-4.0:micro-Q4_K_M`

**Error:** `DMR validation failed: Docker not installed`
- **Cause:** Docker not found in PATH
- **Solution:** Install Docker or set `DMR_SKIP_VALIDATION=true` (not recommended)

### Graceful Degradation

**If DMR is unavailable:**
1. Check for `DMR_SKIP_VALIDATION=true` (CI/CD mode)
2. If validation fails and not skipped:
   - Log detailed error message
   - Suggest installation steps
   - Fall back to llamacpp (if configured)
   - Fall back to OpenAI API (if configured)
3. Throw `DMRSetupError` if no fallback available

**Error Classes:**
```typescript
export class DMRSetupError extends Error {
  constructor(
    message: string,
    public readonly reason: 'docker-missing' | 'dmr-missing' | 'connection-failed' | 'model-missing'
  ) {
    super(message);
  }
}
```

---

## Implementation Checklist

### Phase 1: Core Provider
- [ ] Create `src/providers/dmr.ts`
- [ ] Update `src/providers/factory.ts` to include DMR case
- [ ] Update `src/providers/config.ts` with DMR env vars
- [ ] Add `'dmr'` to `ProviderType` union
- [ ] Create `DMRConfig` interface
- [ ] Write unit tests for DMR provider

### Phase 2: Detection & Validation
- [ ] Create `src/utils/dmr-helpers.ts` with Docker/DMR detection functions
- [ ] Create `src/lib/dmr-validator.ts` with setup validation
- [ ] Integrate validation into provider initialization
- [ ] Add `DMR_SKIP_VALIDATION` support
- [ ] Write unit tests for helpers and validator

### Phase 3: Model Management (Optional)
- [ ] Create `src/lib/dmr-model-manager.ts`
- [ ] Implement `pullModel()` function
- [ ] Implement `ensureModelsAvailable()` function
- [ ] Create `npm run dmr:setup` script
- [ ] Write tests for model manager

### Phase 4: Integration & Testing
- [ ] Create `examples/dmr-example.ts`
- [ ] Write `docs/DMR-SETUP.md`
- [ ] Update `README.md` with DMR quickstart
- [ ] Update `CLAUDE.md` and `AGENTS.md`
- [ ] Add DMR config to `.env.example`
- [ ] Write integration tests
- [ ] Manual testing on Linux/Mac/Windows

### Phase 5: Migration (Optional)
- [ ] Add deprecation warning to llamacpp provider
- [ ] Create migration script for `.env` conversion
- [ ] Update documentation with migration guide
- [ ] Plan llamacpp removal for v2.0.0

---

## Success Criteria

### Minimum Viable Product (MVP)

**Must Have:**
1. ✅ DMR provider works with Vercel AI SDK
2. ✅ Can perform chat completions
3. ✅ Can generate embeddings
4. ✅ Configuration via environment variables
5. ✅ Basic error handling and validation
6. ✅ Documentation and examples

**Should Have:**
1. ✅ Docker/DMR detection
2. ✅ Model availability checking
3. ✅ Helpful error messages
4. ✅ Integration tests

**Nice to Have:**
1. 📋 Automated model pulling
2. 📋 Interactive setup script
3. 📋 llamacpp deprecation

### Performance Benchmarks

**Target Latency (Granite 4.0 Micro):**
- Query analysis: < 500ms
- Triple extraction: < 2s per chunk
- Embedding generation: < 100ms per entity

**Comparison to llamacpp:**
- DMR should have comparable or better latency (Docker overhead minimal)
- If DMR is slower, investigate TCP vs socket performance

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| **Phase 1: Core Provider** | 1-2 days | None |
| **Phase 2: Detection & Validation** | 1-2 days | Phase 1 |
| **Phase 3: Model Management** | 2-3 days (Optional) | Phase 2 |
| **Phase 4: Integration & Testing** | 2-3 days | Phase 1, 2 |
| **Phase 5: Migration** | 1-2 days (Optional) | Phase 4 |

**Total Time Estimate:** 5-12 days (depending on optional phases)

**Recommended Approach:**
- Start with Phases 1, 2, 4 (core + testing) = 5-7 days
- Defer Phases 3, 5 to later iterations

---

## Open Questions

1. **Model Names on Docker Hub:**
   - Are the model names (`ai/triplex:3.8B-Q4_K_M`, etc.) correct?
   - Need to verify actual model names in Docker Hub AI Catalog

2. **Quantization:**
   - Which quantization format to use? (Q4_K_M recommended, but verify)
   - Does DMR support custom quantization?

3. **Embedding Dimension:**
   - Granite Embedding 125M produces 768 dimensions
   - Verify DMR respects this (should be fine with OpenAI compatibility)

4. **Model Updates:**
   - How to handle model updates? (e.g., `docker model pull` for newer versions)
   - Versioning strategy for models?

5. **Multi-Model Support:**
   - Can DMR serve multiple models simultaneously?
   - Or do we need to start/stop models per use case?

6. **GPU Support:**
   - Does DMR automatically use GPU if available?
   - How to configure GPU settings?

---

## References

- [Docker Model Runner Documentation](https://docs.docker.com/ai/model-runner/)
- [DMR Get Started Guide](https://docs.docker.com/ai/model-runner/get-started/)
- [DMR REST API Reference](https://docs.docker.com/ai/model-runner/api-reference/)
- [Docker Hub AI Catalog](https://hub.docker.com/u/ai)
- [Vercel AI SDK OpenAI Provider](https://sdk.vercel.ai/providers/ai-sdk-providers/openai)
- [CONSTITUTION.md](../../CONSTITUTION.md) - Locked Model Specifications

---

## Appendix: Example Code Snippets

### DMR Provider Implementation (Conceptual)

```typescript
// src/providers/dmr.ts
import { createOpenAI } from '@ai-sdk/openai';
import type { DMRConfig } from '../types/provider.js';

export function createDMRProvider(config: DMRConfig) {
  const baseURL = config.baseURL || 'http://localhost:12434/engines/llama.cpp/v1';

  return createOpenAI({
    baseURL,
    apiKey: 'dmr-not-required', // DMR doesn't validate API keys
  });
}

export function getDMRModelName(role: 'triplex' | 'granite-micro' | 'granite-embedding', config: DMRConfig): string {
  switch (role) {
    case 'triplex':
      return config.models.triplex || 'ai/triplex:3.8B-Q4_K_M';
    case 'granite-micro':
      return config.models.graniteMicro || 'ai/granite-4.0:micro-Q4_K_M';
    case 'granite-embedding':
      return config.models.graniteEmbedding || 'ai/granite-embedding:125m';
    default:
      throw new Error(`Unknown model role: ${role}`);
  }
}
```

### Docker Detection (Conceptual)

```typescript
// src/utils/dmr-helpers.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function isDockerInstalled(): Promise<boolean> {
  try {
    await execAsync('docker --version');
    return true;
  } catch {
    return false;
  }
}

export async function isDMRInstalled(): Promise<boolean> {
  try {
    await execAsync('docker model version');
    return true;
  } catch {
    return false;
  }
}

export async function listDMRModels(): Promise<string[]> {
  try {
    const { stdout } = await execAsync('docker model list');
    // Parse output to extract model names
    const lines = stdout.split('\n').slice(1); // Skip header
    return lines.map(line => line.split(/\s+/)[0]).filter(Boolean);
  } catch {
    return [];
  }
}
```

### DMR Connection Test (Conceptual)

```typescript
// src/utils/dmr-helpers.ts
export async function testDMRConnection(baseURL: string = 'http://localhost:12434'): Promise<{ available: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseURL}/engines/llama.cpp/v1/models`);
    if (response.ok) {
      return { available: true };
    } else {
      return { available: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

---

**END OF DMR INTEGRATION PLAN v1.0.0**
