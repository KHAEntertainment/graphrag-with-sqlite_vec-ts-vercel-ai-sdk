# GraphRAG MCP Server - Quick Start

Get your MCP server running with Claude Desktop in 5 minutes!

## Prerequisites

- Node.js 20+ installed
- Claude Desktop installed
- A project with indexed GraphRAG data (`.graphrag/database.sqlite`)

## Step 1: Build the MCP Server

```bash
cd /path/to/example-graphrag-with-sqlite
npm install
npm run build
```

This creates `dist/mcp/server.js`.

## Step 2: Configure Claude Desktop

### Find Your Config File

**macOS/Linux:**
```bash
~/.config/claude/claude_desktop_config.json
```

**Windows:**
```text
%APPDATA%\Claude\claude_desktop_config.json
```

### Add GraphRAG Server

Edit the config file and add:

```json
{
  "mcpServers": {
    "graphrag": {
      "command": "node",
      "args": [
        "/Users/you/example-graphrag-with-sqlite/dist/mcp/server.js"
      ],
      "cwd": "/Users/you/my-project",
      "env": {
        "GRAPHRAG_DB_PATH": ".graphrag/database.sqlite"
      }
    }
  }
}
```

**Note:** GRAPHRAG_DB_PATH resolves relative to cwd. Use an absolute path if your DB isn't under the project root.

**Replace:**
- `/Users/you/example-graphrag-with-sqlite/` → Path to this repo
- `/Users/you/my-project` → Path to your project (where `.graphrag/` is)

## Step 3: Restart Claude Desktop

Quit and reopen Claude Desktop to load the MCP server.

## Step 4: Test It!

In Claude Desktop, try these queries:

### List Indexed Repositories

```text
What repositories are indexed?
```

Claude will use the `list_repositories` tool.

### Query a Repository

```text
How do I use streaming with Vercel AI SDK?
```

Claude will use `query_repositories` or `smart_query`.

### Find Cross-References

```text
What projects use StreamingTextResponse?
```

Claude will use `get_cross_references`.

## Verification

You should see the MCP server in Claude Desktop's tool list:
- `list_repositories`
- `query_repositories`
- `query_dependency`
- `get_cross_references`
- `smart_query`

## Troubleshooting

### Server Not Appearing

1. Check the JSON syntax in `claude_desktop_config.json`
2. Verify paths are absolute (not relative)
3. Look at Claude Desktop logs:
   - **macOS:** `~/Library/Logs/Claude/mcp*.log`
   - **Windows:** `%APPDATA%\Claude\logs\mcp*.log`

### "No repositories indexed"

Your project needs a `.graphrag/database.sqlite` file. Use your CLI indexing tool first.

### Attendant Not Working

The MCP server needs a language model to filter results. When using with Claude Desktop, the attendant filtering happens but you need to ensure your project has the necessary models or API keys configured.

For local Granite Micro, you can configure it in your project's `.env`:

```bash
AI_PROVIDER=llamacpp
LLAMACPP_MODEL_PATH=/path/to/granite-4.0-micro.gguf
```

For Gemini escalation:

```bash
GEMINI_API_KEY=your-api-key-here
# Do not commit real keys. Prefer OS env vars or a local, git-ignored .env.
```

## Next Steps

1. **Index more repositories** - Use your CLI tool to index additional repos
2. **Build cross-references** - Enable multi-repo queries
3. **Read the full usage guide** - See `docs/MCP-SERVER-USAGE.md`
4. **Explore the architecture** - See `docs/MCP-LOCAL-FIRST-ARCHITECTURE.md`

## Example Queries to Try

Once you have repositories indexed:

```text
# Simple fact lookup
"Show me how to import streamText from Vercel AI SDK"

# Multi-repo integration
"How do AG-UI and CoPilotKit integrate with Vercel AI SDK?"

# Dependency analysis
"What uses the StreamingTextResponse class?"

# Architectural guidance (uses Gemini if configured)
"Design an architecture for a streaming chat app using Vercel AI SDK and AG-UI"

# Cross-references
"Show me all cross-repository references for useChat hook"
```

## Configuration Options

### Minimal (Granite Micro only)

```json
{
  "mcpServers": {
    "graphrag": {
      "command": "node",
      "args": ["/path/to/dist/mcp/server.js"],
      "cwd": "/path/to/project"
    }
  }
}
```

### With Gemini Escalation

```json
{
  "mcpServers": {
    "graphrag": {
      "command": "node",
      "args": ["/path/to/dist/mcp/server.js"],
      "cwd": "/path/to/project",
      "env": {
        "GRAPHRAG_DB_PATH": ".graphrag/database.sqlite",
        "GRAPHRAG_DEFAULT_ATTENDANT": "granite-micro",
        "GRAPHRAG_AUTO_ESCALATE": "true",
        "GEMINI_API_KEY": "your-gemini-api-key",
        "GEMINI_MODEL": "gemini-2.5-pro"
      }
    }
  }
}
```

### Development Mode

For testing during development:

```bash
# Run MCP server directly
GRAPHRAG_DB_PATH=.graphrag/database.sqlite npm run mcp:dev
# Windows (cmd)
set GRAPHRAG_DB_PATH=.graphrag\database.sqlite && npm run mcp:dev
# Windows (PowerShell)
$env:GRAPHRAG_DB_PATH=".graphrag\database.sqlite"; npm run mcp:dev
```

## What's Different from Other MCP Servers?

### vs DeepWiki

| Feature | DeepWiki | GraphRAG MCP |
|---------|----------|--------------|
| Search | One repo at a time | Multi-repo simultaneous |
| Type | Semantic only | **Dynamic Hybrid (4-way)** |
| Filtering | None (dumps all) | Intelligent attendant |
| Cross-repo | Manual | Automatic |
| Offline | No | Yes |

### Dynamic Hybrid Search (NEW!)

GraphRAG now uses intelligent 4-way hybrid search that automatically adapts to your query:

- **Dense (Semantic)**: Vector embeddings for conceptual understanding
- **Sparse (BM25)**: Keyword matching with tf-idf weighting
- **Pattern (Fuzzy)**: Trigram-based typo tolerance and exact matching
- **Graph (Relationships)**: Entity-relationship traversal

The system uses LLM-based query analysis to automatically determine the optimal weights for each strategy based on query type (conceptual, identifier, relationship, fuzzy, pattern, or mixed).

### vs File System MCP

| Feature | File System MCP | GraphRAG MCP |
|---------|-----------------|--------------|
| Scope | Local files | Indexed knowledge |
| Search | File paths | Semantic + relationships |
| Multi-repo | No | Yes |
| Context | Raw files | Filtered, relevant |

### vs Fetch MCP

| Feature | Fetch MCP | GraphRAG MCP |
|---------|-----------|--------------|
| Source | Live websites | Local database |
| Speed | Network-dependent | Local (fast) |
| Offline | No | Yes |
| Structured | No | Yes (graph) |

---

**You're now ready to use GraphRAG with surgical precision!** 🚀

For more details, see:
- [Full Usage Guide](./MCP-SERVER-USAGE.md)
- [Architecture Details](./MCP-LOCAL-FIRST-ARCHITECTURE.md)
- [Multi-Repo Architecture](./MCP-MULTI-REPO-ARCHITECTURE.md)
