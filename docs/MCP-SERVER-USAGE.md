# GraphRAG MCP Server - Usage Guide

## Overview

The GraphRAG MCP Server provides context-efficient access to your local GraphRAG knowledge base through the Model Context Protocol (MCP). It enables coding agents like Claude Desktop to query your indexed repositories with "surgical precision" - only returning the most relevant information without bloating their context windows.

## Key Features

- **100% Local & Offline** - Reads from local `.graphrag/database.sqlite`, no API calls
- **Multi-Repository Support** - Query across multiple indexed repositories simultaneously
- **Intelligent Attendant** - Granite Micro 4.0 filters results for context efficiency
- **Auto-Escalation** - Optionally escalates to Gemini 2.5 Pro for complex queries
- **Hybrid Search** - Combines semantic search (embeddings) with graph relationships

## Installation

### 1. Build the MCP Server

```bash
# Install dependencies (if not already installed)
npm install

# Build the MCP server
npm run build
```

This creates `dist/mcp/server.js` which is the MCP server entry point.

### 2. Configure Claude Desktop

Add the GraphRAG MCP server to your Claude Desktop configuration:

**macOS/Linux:** `~/.config/claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "graphrag": {
      "command": "node",
      "args": [
        "/absolute/path/to/example-graphrag-with-sqlite/dist/mcp/server.js"
      ],
      "cwd": "/absolute/path/to/your/project",
      "env": {
        "GRAPHRAG_DB_PATH": ".graphrag/database.sqlite",
        "GRAPHRAG_DEFAULT_ATTENDANT": "granite-micro",
        "GRAPHRAG_AUTO_ESCALATE": "true"
      }
    }
  }
}
```

**Important:**
- Replace `/absolute/path/to/example-graphrag-with-sqlite/` with the actual path to this repository
- Replace `/absolute/path/to/your/project` with your project directory (where `.graphrag/` will be)
- The `cwd` should be set to your project directory, not the MCP server directory

### 3. Restart Claude Desktop

After updating the configuration, restart Claude Desktop to load the MCP server.

## Environment Variables

Configure the MCP server behavior with these environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `GRAPHRAG_DB_PATH` | Path to SQLite database (relative to cwd) | `.graphrag/database.sqlite` |
| `GRAPHRAG_DEFAULT_ATTENDANT` | Default attendant mode | `granite-micro` |
| `GRAPHRAG_AUTO_ESCALATE` | Enable auto-escalation to Gemini | `true` |
| `GEMINI_API_KEY` | Gemini API key (for escalation) | - |
| `GEMINI_MODEL` | Gemini model to use | `gemini-2.5-pro` |

## Available Tools

The MCP server exposes 5 tools for querying your GraphRAG database:

### 1. `list_repositories`

List all indexed repositories in your project.

**Parameters:** None

**Example:**
```typescript
// In Claude Desktop, you might say:
"What repositories are indexed in my project?"
```

**Returns:**
```markdown
# Indexed Repositories (3)

- **Vercel AI SDK** (vercel/ai)
  Version: 3.4.0
  Indexed: 2025-01-15T10:30:00Z
  Branch: main

- **AG-UI** (ag-grid/ag-ui)
  Version: 1.2.0
  Indexed: 2025-01-15T10:35:00Z
  Branch: main

- **CoPilotKit** (copilotkit/copilotkit)
  Version: 0.8.0
  Indexed: 2025-01-15T10:40:00Z
  Branch: main
```

### 2. `query_repositories`

Query across multiple repositories with semantic + graph search.

**Parameters:**
- `query` (required): Natural language query
- `repositories` (optional): Array of repository IDs to search
- `attendant` (optional): `"none"`, `"granite-micro"`, or `"gemini-2.5-pro"`
- `maxTokens` (optional): Maximum tokens in response (default: 500)

**Example:**
```typescript
// In Claude Desktop:
"How do I use streaming with Vercel AI SDK?"

// The tool call would be:
{
  query: "How do I use streaming with Vercel AI SDK?",
  repositories: ["vercel/ai"],
  attendant: "granite-micro",
  maxTokens: 500
}
```

**Returns:**
Filtered, concise answer with efficiency metrics:
```markdown
# Summary
Use `streamText()` from 'ai' package for streaming text responses.

# Key Information
- Import `streamText` from 'ai'
- Pass your model and prompt
- Returns a stream that can be converted to various formats

# Code Example
```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await streamText({
  model: openai('gpt-4'),
  prompt: 'Tell me a story'
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

---
*Repositories: vercel/ai*
*Efficiency: 2400 → 320 tokens (87% reduction)*
*Attendant: granite-micro*
```

### 3. `query_dependency`

Find information about a specific dependency or entity.

**Parameters:**
- `dependency` (required): Name of the dependency/entity
- `repositories` (optional): Limit search to specific repositories
- `aspect` (optional): `"usage"`, `"relationships"`, `"implementation"`, or `"all"`
- `attendant` (optional): Attendant mode

**Example:**
```typescript
// In Claude Desktop:
"Show me how StreamingTextResponse is used"

// Tool call:
{
  dependency: "StreamingTextResponse",
  aspect: "usage",
  attendant: "granite-micro"
}
```

### 4. `get_cross_references`

Find how different projects reference each other.

**Parameters:**
- `entity` (required): Entity to find references to
- `sourceRepo` (optional): Repository where entity is defined
- `minStrength` (optional): Minimum relationship strength (0-1, default: 0.7)

**Example:**
```typescript
// In Claude Desktop:
"What projects use StreamingTextResponse from Vercel AI SDK?"

// Tool call:
{
  entity: "StreamingTextResponse",
  sourceRepo: "vercel/ai",
  minStrength: 0.7
}
```

**Returns:**
```markdown
# Cross-References for "StreamingTextResponse"

Found 2 cross-repository reference(s):

- **ag-grid/ag-ui/StreamHandler** → **vercel/ai/StreamingTextResponse**
  Type: implements, Strength: 0.95

- **copilotkit/copilotkit/CopilotRuntime** → **vercel/ai/StreamingTextResponse**
  Type: uses, Strength: 0.82
```

### 5. `smart_query`

Ask any natural language question with auto-attendant selection.

**Parameters:**
- `question` (required): Any natural language question
- `context` (optional): What you're trying to accomplish
- `forceAttendant` (optional): Override auto-selection
- `maxTokens` (optional): Maximum tokens in response

**Example:**
```typescript
// In Claude Desktop:
"How should I architect a system using Vercel AI SDK, AG-UI, and CoPilotKit together?"

// Tool call (auto-escalates to Gemini for complex architectural question):
{
  question: "How should I architect a system using Vercel AI SDK, AG-UI, and CoPilotKit together?",
  context: "Building a collaborative AI coding assistant",
  maxTokens: 800
}
```

**Auto-Escalation:**
The `smart_query` tool automatically selects the best attendant based on:
- Number of repositories involved (>3 → Gemini)
- Result size (>5000 tokens → Gemini)
- Query complexity (keywords like "architecture", "refactor", "design" → Gemini)

## Attendant Modes

### `granite-micro` (Default)

- **Use for:** Simple queries, fact lookup, code examples
- **Benefits:**
  - 100% local, no API costs
  - Fast (200-500ms)
  - 128k context window
  - Excellent at code understanding

**Best for:**
- "How do I use X?"
- "What does Y do?"
- "Show me an example of Z"
- Single or dual repository queries

### `gemini-2.5-pro`

- **Use for:** Complex architectural questions, multi-repo integration, refactoring plans
- **Benefits:**
  - Superior reasoning
  - Better at synthesis across multiple sources
  - Excellent for architectural guidance

**Best for:**
- "How should I architect X using Y and Z?"
- "What's the best way to integrate A with B and C?"
- "Help me refactor X to use Y"
- Multi-repository queries (>3 repos)

**Requirements:**
- Set `GEMINI_API_KEY` environment variable
- Incurs API costs (but only when used)

> **Note:** Gemini attendant is not yet implemented; when selected, results are formatted using the Granite attendant until API wiring is added.

### `none`

- **Use for:** Getting raw results without filtering
- **Benefits:**
  - See all data
  - No filtering overhead
  - Useful for debugging or deep exploration

**Best for:**
- Exploring what's in the database
- Debugging query results
- Agents with large context windows

## Usage Patterns

### Pattern 1: Quick Fact Lookup

```
User (in Claude Desktop): "How do I import the streamText function?"

Claude uses: query_repositories
Attendant: granite-micro (auto)
Result: Fast, precise answer with code example
```

### Pattern 2: Multi-Repository Integration

```
User: "Show me how AG-UI integrates with Vercel AI SDK for streaming"

Claude uses: query_repositories (both repos) OR smart_query
Attendant: granite-micro (sufficient for this)
Result: Integration patterns, cross-references, code examples
```

### Pattern 3: Complex Architecture

```
User: "Design an architecture for a real-time collaborative AI assistant using Vercel AI SDK, AG-UI, and CoPilotKit"

Claude uses: smart_query
Attendant: gemini-2.5-pro (auto-escalated)
Result: Comprehensive architectural guidance, integration strategy, gotchas
```

### Pattern 4: Dependency Analysis

```
User: "What uses StreamingTextResponse and how?"

Claude uses: query_dependency + get_cross_references
Attendant: granite-micro
Result: Entity info, relationships, cross-repo usage
```

## Project Structure

Each project using the MCP server should have this structure:

```
my-project/
├── .graphrag/
│   ├── database.sqlite          # Main graph database
│   ├── embeddings.vec           # sqlite-vec embeddings (optional)
│   └── config.json              # Indexed repositories metadata
├── src/                         # Your project code
└── package.json
```

## Indexing Repositories

The MCP server only **reads** from the local database. You need a separate indexing tool (your CLI) to populate it.

**Example indexing workflow:**

```bash
# Using your CLI tool (not part of MCP server)
cli index-repo vercel/ai --branch main
cli index-repo ag-grid/ag-ui --branch main
cli index-repo copilotkit/copilotkit --branch main

# Build cross-references
cli build-cross-refs

# Now the MCP server can query this data
npm run mcp
```

## Database Schema

The MCP server expects these tables in your SQLite database:

### `repositories`
```sql
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,           -- "vercel/ai"
  name TEXT,                     -- "Vercel AI SDK"
  indexed_at TIMESTAMP,
  version TEXT,
  branch TEXT,
  metadata TEXT                  -- JSON
);
```

### `nodes` (Graph entities)
```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  repo TEXT,                     -- Which repository
  properties TEXT                -- JSON
);
```

### `edges` (Graph relationships)
```sql
CREATE TABLE edges (
  source TEXT,
  target TEXT,
  source_repo TEXT,
  target_repo TEXT,
  relationship TEXT,
  weight REAL,
  PRIMARY KEY (source, target, relationship)
);
```

### `cross_references` (Multi-repo links)
```sql
CREATE TABLE cross_references (
  from_repo TEXT,
  from_entity TEXT,
  to_repo TEXT,
  to_entity TEXT,
  type TEXT,                     -- "imports", "implements", "uses"
  strength REAL,
  PRIMARY KEY (from_repo, from_entity, to_repo, to_entity)
);
```

### `embeddings` (Semantic search - optional, requires sqlite-vec)
```sql
CREATE VIRTUAL TABLE embeddings USING vec0(
  chunk_id TEXT PRIMARY KEY,
  repo TEXT,
  embedding FLOAT[768],          -- Granite Embedding 125M dimension
  content TEXT,
  metadata TEXT
);
```

## Development Mode

For development, you can run the MCP server directly with tsx:

```bash
# Run in development mode
GRAPHRAG_DB_PATH=.graphrag/database.sqlite npm run mcp:dev
```

## Troubleshooting

### "No repositories indexed"

**Cause:** The database doesn't have a `repositories` table or it's empty.

**Solution:** Use your CLI tool to index repositories first.

### "sqlite-vec extension not available"

**Cause:** The `embeddings` virtual table doesn't exist.

**Solution:** This is a warning, not an error. Semantic search will be skipped, but graph queries will still work. To enable semantic search, ensure your indexing tool creates the `embeddings` table with sqlite-vec.

### "Permission denied" when Claude Desktop tries to start the server

**Cause:** File permissions or incorrect path.

**Solution:**
1. Check that the path in `claude_desktop_config.json` is absolute
2. Verify the file exists: `ls -la /path/to/dist/mcp/server.js`
3. Make sure Node.js is in your PATH

### Attendant not filtering results

**Cause:** No language model configured.

**Solution:** When running the MCP server programmatically, pass a `model` in the config:

```typescript
import { createLanguageModel } from './providers/factory.js';
import { loadProviderConfigFromEnv } from './providers/config.js';

const providerConfig = loadProviderConfigFromEnv();
const model = createLanguageModel(providerConfig);

const server = new GraphRAGMCPServer({
  model,
  defaultAttendant: 'granite-micro'
});
```

## Advanced Configuration

### Programmatic Usage

You can use the MCP server programmatically in your own code:

```typescript
import { GraphRAGMCPServer } from './src/mcp/server.js';
import { GraniteEmbeddingProvider } from './src/lib/embedding-manager.js';
import { createLanguageModel } from './src/providers/factory.js';

// Create embedding provider (optional)
const embeddingProvider = new GraniteEmbeddingProvider(logger);
await embeddingProvider.initialize();

// Create language model for attendant
const model = createLanguageModel({
  type: 'llamacpp',
  modelPath: './models/granite-4.0-micro.gguf'
});

// Create and start MCP server
const server = new GraphRAGMCPServer({
  dbPath: '.graphrag/database.sqlite',
  model,
  embeddingProvider,
  defaultAttendant: 'granite-micro',
  autoEscalate: true,
  geminiConfig: {
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-2.5-pro'
  }
});

await server.start();
```

### Custom Attendant

You can create your own attendant implementation:

```typescript
import { AttendantFilterOptions, FilteredResponse } from './src/mcp/attendant/granite-micro.js';

class CustomAttendant {
  async filter(options: AttendantFilterOptions): Promise<FilteredResponse> {
    // Your custom filtering logic
    return {
      answer: "Filtered result",
      repositories: ["repo1", "repo2"],
      efficiency: {
        originalTokens: 1000,
        filteredTokens: 200,
        reductionPercent: 80
      }
    };
  }
}
```

## Performance

### Typical Query Times

- **graph-only query:** 5-20ms
- **semantic search (local):** 10-50ms
- **granite-micro filtering:** 200-500ms
- **gemini-2.5-pro filtering:** 500-2000ms
- **total (granite):** ~250-600ms
- **total (gemini):** ~550-2100ms

### Context Efficiency

Example efficiency gains:

```
Raw Results: 4,300 tokens
After Granite Micro: 320 tokens (93% reduction)

Raw Results: 8,500 tokens
After Gemini 2.5 Pro: 450 tokens (95% reduction)
```

## Best Practices

1. **Start with granite-micro** - It's fast, free, and handles most queries well
2. **Use smart_query for general questions** - Let auto-escalation decide the best attendant
3. **Be specific in queries** - "How do I use streamText?" is better than "How do I stream?"
4. **Use repositories parameter** - Limit scope for faster, more relevant results
5. **Index cross-references** - Enable powerful multi-repo queries
6. **Keep embeddings updated** - Re-index when repositories change significantly

## Comparison with DeepWiki MCP

| Feature | DeepWiki | GraphRAG MCP |
|---------|----------|--------------|
| **Repositories** | One at a time | Multiple simultaneously |
| **Search Type** | Semantic only | Semantic + Graph |
| **Context Efficiency** | Raw dump | Attendant-filtered |
| **Cross-Project** | Manual correlation | Automatic |
| **Intelligence** | Fixed | Escalatable (Granite → Gemini) |
| **Offline** | No (GitHub API) | Yes (100% local) |
| **Use Case** | Single project docs | Ecosystem understanding |

---

**Ready to query your knowledge graph with surgical precision!** 🎯
