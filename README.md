# GraphRAG with SQLite - TypeScript Edition

> **TypeScript implementation** of GraphRAG with SQLite, featuring multi-provider AI support and optional semantic search capabilities. Based on Vercel AI SDK with LLama.CPP Support! 

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.txt)

## 🎯 What is This?

A knowledge graph RAG (Retrieval-Augmented Generation) system that:
- Extracts entities and relationships from documents using LLMs
- Builds a queryable knowledge graph in SQLite
- Optionally adds semantic search via embeddings
- Supports multiple AI providers (OpenAI, llama.cpp, and more)

Perfect for coding assistants, documentation search, and knowledge management.

## 📦 Quick Start

### TypeScript Implementation (This Repo)

```bash
# Install dependencies (with workaround for llamacpp-ai-provider)
npm run install-deps

# Or manually:
npm install --ignore-scripts

# Configure your AI provider
cp .env.example .env
# Edit .env with your provider settings

# Run the application
npm run dev

# Or run embedding examples
npm run examples:embedding
```

> **⚠️ npm install workaround:** The `llamacpp-ai-provider` package has a broken postinstall script. Use `npm run install-deps` or `npm install --ignore-scripts` instead of plain `npm install`.

### Development Commands

```bash
# Code Quality
npm run lint              # Check for linting errors
npm run lint:fix          # Auto-fix linting issues
npm run format            # Format code with Prettier
npm run format:check      # Check code formatting
npm run typecheck         # Run TypeScript type checking
npm run validate          # Run lint + typecheck

# Building
npm run build             # Build for production
npm run prebuild          # Runs validation before build

# Development
npm run dev               # Run with hot reload
npm run examples:embedding # Run embedding examples
```

**📘 Full Documentation:** [README-TYPESCRIPT.md](README-TYPESCRIPT.md)

### Original Python Implementation

The original Python implementation is preserved in [`reference/python-original/`](reference/python-original/) for reference.

## 🌟 Features

### Core GraphRAG
- **Symbolic Knowledge Graph**: Extract entities and relationships via LLM prompting
- **Centrality Analysis**: Identify key concepts using graph algorithms
- **SQLite Storage**: Lightweight, portable graph database
- **Query System**: Natural language queries with graph context

### TypeScript Enhancements
- **Multi-Provider Support**: OpenAI, llama.cpp, Ollama, etc.
- **Embedding Layer**: Optional semantic search (Granite, Nomic, BGE models)
- **Type Safety**: Full TypeScript with strict mode
- **Modern Tooling**: ESM, tsx for dev, tsup for builds
- **Local-First**: Run entirely offline with llama.cpp + local embeddings

## 🏗️ Architecture

### Pure Graph (Original Approach)
```
Documents → LLM Extraction → Graph DB → Centrality Analysis → Answers
```

### Hybrid (New Option)
```
Documents → Chunking
    ↓
    ├─→ Embeddings → Semantic Search
    │
    └─→ LLM Extraction → Knowledge Graph
         ↓
    Combined Hybrid Queries
```

**Learn more:** [docs/EMBEDDING-ARCHITECTURE.md](docs/EMBEDDING-ARCHITECTURE.md)

## 🚀 Usage Examples

### Index a Repository with Embeddings

```typescript
import { RepositoryIndexer } from './src/lib/repository-indexer.js';
import { GraphDatabaseConnection } from './src/lib/graph-database.js';
import { EmbeddingManager } from './src/lib/embedding-manager.js';
import { Logger } from './src/lib/logger.js';
import { llamacpp } from 'llamacpp-ai-provider';

// Setup database and logger
const db = new GraphDatabaseConnection('./data/graph.db');
const logger = new Logger('Index', './logs', 'index.log');

// Configure embedding provider (IBM Granite Embedding 125M)
const embeddingProvider = /* your embedding provider */;
const embeddingManager = new EmbeddingManager(embeddingProvider, logger);

// Configure LLM for entity extraction (IBM Granite 3.1 2B)
const model = llamacpp('granite-3.1-2b-q8_0.gguf');

// Create indexer and register repository
const indexer = new RepositoryIndexer(db, logger, embeddingManager, model);
indexer.registerRepository({
  id: 'my-project',
  name: 'My TypeScript Project',
  version: '1.0.0',
});

// Index repository (extracts entities, builds graph, generates embeddings)
await indexer.indexRepository('my-project', './path/to/project');

// Result:
// - Entities and edges extracted from code
// - Knowledge graph built in SQLite
// - Embeddings generated for entities ("name :: kind :: hints")
// - Embeddings generated for edges ("S <predicate> O :: context")
```

### Query with Semantic Search

```typescript
import { QueryEngine } from './src/mcp/tools/query-engine.js';

const queryEngine = new QueryEngine(db.getSession(), embeddingManager, logger);

// Generate query embedding
const query = 'authentication module user session';
const queryEmbedding = await embeddingManager.embedChunk({
  id: 'query',
  content: query,
});

// Semantic search using generated embeddings
const results = await queryEngine.queryLocalEmbeddings(
  queryEmbedding.embedding!,
  {
    repositories: ['my-project'],
    maxResults: 10,
    minSimilarity: 0.7,
  }
);

console.log(`Found ${results.length} relevant results`);
// Returns: Entity embeddings, edge embeddings, and document chunks
```

### Hybrid Search (All Strategies)

```typescript
import { HybridSearchEngine } from './src/mcp/tools/hybrid-search.js';
import { QueryAnalyzer } from './src/lib/query-analyzer.js';

const queryAnalyzer = new QueryAnalyzer(model, logger);
const hybridSearch = new HybridSearchEngine(db, embeddingManager, model, logger);

// Analyze query to determine optimal search weights
const query = 'How does authentication work?';
const analysis = await queryAnalyzer.analyzeQuery(query);

// Perform hybrid search (dense + sparse + pattern + graph)
const hybridResults = await hybridSearch.search(query, {
  repositories: ['my-project'],
  maxResults: 20,
});

// Results fused from all search strategies using RRF
console.log(`Found ${hybridResults.length} results (RRF fused)`);
```

## 🤖 Recommended Models

Based on extensive research, these models provide optimal performance for GraphRAG:

### Triple Extraction
- **[SciPhi/Triplex](https://huggingface.co/SciPhi/Triplex)** (Phi-3 3.8B finetune)
  - Best for extracting knowledge graph triples [subject, predicate, object] from code/docs
  - Fine-tuned specifically for KG construction
  - Efficient on consumer hardware

### Embeddings
- **IBM Granite Embedding** (125M-278M)
  - Optimized for code and technical documentation
  - Use for both entity and edge embeddings
  - Entity format: `"name :: kind :: hints"`
  - Edge format: `"S <predicate> O :: context:..."`
  - Enables similarity search for entities AND relationships

### Query Analysis (Current)
- **IBM Granite 3.1** (2B-8B)
  - Powers dynamic hybrid search query classification
  - Determines optimal search strategy weights

### Optional: Advanced Reasoning
- **[TIGER-Lab/StructLM-7B](https://huggingface.co/TIGER-Lab/StructLM-7B)** (Q4 quantized)
  - Use AFTER building KG with Triplex
  - Infers missing links and answers complex graph queries
  - Runs on MacBook Pro with quantization

#### Full details
[docs/SQLITE-VEC-INTEGRATION-PLAN.md](docs/SQLITE-VEC-INTEGRATION-PLAN.md#model-recommendations)

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [README-TYPESCRIPT.md](README-TYPESCRIPT.md) | Complete TypeScript setup and usage guide |
| [docs/PHASE-3-COMPLETION-SUMMARY.md](docs/PHASE-3-COMPLETION-SUMMARY.md) | Phase 3: Entity & Edge Embedding Generation (complete) |
| [docs/EMBEDDING-USAGE.md](docs/EMBEDDING-USAGE.md) | Embedding integration guide |
| [docs/EMBEDDING-ARCHITECTURE.md](docs/EMBEDDING-ARCHITECTURE.md) | Symbolic vs. embedding approach explained |
| [docs/HYBRID-ARCHITECTURE-PROPOSAL.md](docs/HYBRID-ARCHITECTURE-PROPOSAL.md) | Future hybrid system design |
| [reference/python-original/](reference/python-original/) | Original Python implementation |

## 🔧 Technology Stack

**Core:**
- TypeScript 5.5+
- Node.js 20+
- better-sqlite3 (graph storage)
- Vercel AI SDK (unified LLM interface)

**AI Providers:**
- `@ai-sdk/openai` - OpenAI GPT models
- `llamacpp-ai-provider` - Local llama.cpp models
- `@xenova/transformers` - Local embeddings

**Optional:**
- sqlite-vec (for vector search, planned)

## 💡 Use Cases

- **Coding Assistants**: Understand dependencies and relationships in codebases
- **Documentation Search**: Semantic + structural queries over technical docs
- **Knowledge Management**: Build queryable knowledge graphs from any text
- **Research Tools**: Extract and explore entity relationships

## 🎓 Credits & Attribution

### Original Python Implementation

This TypeScript version is based on the excellent Python implementation by **[stephenc222](https://github.com/stephenc222)**:

- **Original Repository**: https://github.com/stephenc222/example-graphrag-with-sqlite
- **Original Author**: stephenc222
- **License**: MIT

The Python version introduced the core GraphRAG architecture using:
- Pure symbolic entity/relationship extraction
- SQLite graph storage
- Centrality-based query answering
- No vector embeddings (graph-only approach)

### TypeScript Conversion

This TypeScript implementation:
- Maintains the same MIT license
- Preserves the original architecture
- Adds multi-provider support and optional embeddings
- Keeps the Python version in [`reference/python-original/`](reference/python-original/) for reference

### Community Packages

- **llamacpp-ai-provider**: Forked from [nnance/llamacpp-ai-provider](https://github.com/nnance/llamacpp-ai-provider)
- **Vercel AI SDK**: By Vercel
- **Transformers.js**: By Xenova

## 🤝 Contributing

Contributions welcome! This project aims to be a community resource for GraphRAG implementations.

### Areas for Contribution
- sqlite-vec integration
- Additional AI provider support
- Graph algorithm improvements
- Documentation and examples
- Performance optimizations

## 📄 License

MIT License - See [LICENSE.txt](LICENSE.txt)

This project maintains the same MIT license as the original Python implementation by stephenc222.

## 🔗 Related Projects

- **Original Python Version**: https://github.com/stephenc222/example-graphrag-with-sqlite
- **llamacpp-ai-provider**: https://github.com/nnance/llamacpp-ai-provider
- **Vercel AI SDK**: https://sdk.vercel.ai/
- **llama.cpp**: https://github.com/ggerganov/llama.cpp

## 📞 Support

- **Documentation**: See [README-TYPESCRIPT.md](README-TYPESCRIPT.md)
- **Examples**: Run `npm run examples:embedding`
- **Issues**: Open an issue on GitHub

---

**Ready to get started?** See [README-TYPESCRIPT.md](README-TYPESCRIPT.md) for full setup instructions.