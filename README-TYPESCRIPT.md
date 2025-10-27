# GraphRAG with SQLite - TypeScript Edition

A TypeScript implementation of GraphRAG, providing a flexible system for processing documents, extracting entities and relationships, and managing them in a SQLite database. Supports multiple AI providers including **llama.cpp** for local inference and **OpenAI** for cloud-based models.

## Features

- **Multiple AI Provider Support**: OpenAI, llama.cpp (with more coming soon)
- **Local Model Inference**: Run LLMs locally with llama.cpp
- **Type-Safe**: Built with TypeScript for enhanced developer experience
- **Modern Stack**: Vercel AI SDK, better-sqlite3, ESM modules
- **Graph Visualization**: Export data for D3.js visualization
- **Centrality Analysis**: Calculate degree centrality for key entity identification

## Project Structure

```
src/
├── types/              # TypeScript type definitions
├── providers/          # AI provider configuration and factory
├── lib/                # Core library modules
│   ├── logger.ts
│   ├── graph-database.ts
│   ├── graph-manager.ts
│   ├── document-processor.ts
│   └── query-handler.ts
├── utils/              # Utility functions
├── constants.ts        # Application constants
├── app.ts              # Main entry point
└── export-graph-data.ts # D3.js export utility
```

## Setup

### Prerequisites

- Node.js 20+ (LTS recommended)
- npm, pnpm, or yarn

### Installation

1. **Clone the repository:**

   ```bash
   git clone git@github.com:stephenc222/example-graphrag-with-sqlite.git
   cd example-graphrag-with-sqlite
   ```

2. **Install dependencies:**

   ```bash
   npm install
   # or
   pnpm install
   # or
   yarn install
   ```

3. **Set up environment variables:**

   Copy `.env.example` to `.env` and configure your provider:

   ```bash
   cp .env.example .env
   ```

   **For llama.cpp (local inference):**
   ```env
   AI_PROVIDER=llamacpp
   LLAMACPP_MODEL_PATH=./models/llama-2-7b-chat.Q4_K_M.gguf
   DB_PATH=data/graph_database.sqlite
   LOG_LEVEL=INFO
   ```

   **For OpenAI:**
   ```env
   AI_PROVIDER=openai
   OPENAI_API_KEY=sk-your-api-key-here
   OPENAI_MODEL=gpt-4o
   DB_PATH=data/graph_database.sqlite
   LOG_LEVEL=INFO
   ```

4. **Download a model (for llama.cpp):**

   Download a GGUF model from Hugging Face and place it in the `models/` directory:

   ```bash
   mkdir -p models
   # Example: Download a model from Hugging Face
   # Visit https://huggingface.co/models?search=gguf
   ```

## Usage

### Development Mode (No Build Required)

Run the application directly with tsx:

```bash
npm run dev
```

### Production Mode

1. **Build the project:**

   ```bash
   npm run build
   ```

2. **Run the compiled application:**

   ```bash
   npm start
   ```

### Type Checking

Check for TypeScript errors:

```bash
npm run typecheck
```

## Workflow

The application performs the following steps:

1. **Initial Indexing**: Processes documents from `example_text/doc_1.txt` and `example_text/doc_2.txt`
2. **First Query**: Asks "What are the main themes in these documents?"
3. **Reindexing**: Adds `example_text/doc_3.txt` and updates the graph
4. **Second Query**: Asks the same question with updated knowledge

## Exporting Graph Data for Visualization

After running the application to populate the database, export the graph data:

```bash
npm run export data/graph_database.sqlite
```

Then serve the `public` directory with a static file server:

```bash
python -m http.server --directory public 8000
# or use npx
npx serve public
```

Navigate to `http://localhost:8000/` to view the graph visualization.

## AI Provider Configuration

### Using llama.cpp

The llama.cpp provider enables local model inference without external API calls:

1. Download a GGUF model (e.g., from Hugging Face)
2. Set `AI_PROVIDER=llamacpp` in `.env`
3. Set `LLAMACPP_MODEL_PATH` to your model file path
4. Run the application

**Benefits:**
- No API costs
- Complete data privacy
- Works offline
- Full control over model selection

### Using OpenAI

1. Get an API key from [OpenAI](https://platform.openai.com)
2. Set `AI_PROVIDER=openai` in `.env`
3. Set `OPENAI_API_KEY` to your API key
4. Optionally set `OPENAI_MODEL` (defaults to `gpt-4o`)

## Code Overview

### Core Components

- **`app.ts`**: Main entry point, orchestrates the workflow
- **`graph-manager.ts`**: Manages graph operations, centrality calculations
- **`document-processor.ts`**: Splits documents, extracts entities/relationships
- **`query-handler.ts`**: Answers queries using graph data and LLMs
- **`graph-database.ts`**: SQLite database connection and schema management
- **`logger.ts`**: Structured logging to console and file

### Provider System

- **`providers/config.ts`**: Provider configuration types and loading
- **`providers/factory.ts`**: Creates language model instances

### Type Safety

All core types are defined in `src/types/`:
- Graph nodes and edges
- Centrality measures
- Document chunks and summaries
- Logger interface

## Centrality Measures

The system calculates **degree centrality** to identify the most connected entities in the graph:

- **Degree Centrality**: Number of connections an entity has
- **Use Case**: Identifies key topics and influential concepts

*Note: Betweenness and closeness centrality are not currently implemented in the SQLite version.*

## Dependencies

### Runtime
- `ai` - Vercel AI SDK for unified LLM interface
- `@ai-sdk/openai` - OpenAI provider for Vercel AI SDK
- `llamacpp-ai-provider` - llama.cpp provider for Vercel AI SDK
- `better-sqlite3` - Fast, synchronous SQLite database
- `dotenv` - Environment variable management
- `zod` - Schema validation

### Development
- `typescript` - TypeScript compiler
- `tsx` - TypeScript execution for Node.js
- `tsup` - TypeScript bundler

## Migration from Python

This project is a TypeScript port of the original Python implementation. Key improvements:

- **Type Safety**: Catch errors at compile-time
- **Better IDE Support**: IntelliSense, refactoring, auto-completion
- **Modern Tooling**: ESM modules, async/await throughout
- **Provider Flexibility**: Easy switching between AI providers
- **Performance**: Synchronous SQLite with better-sqlite3

## Contributing

Contributions are welcome! This project aims to be a community resource for GraphRAG implementations.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE.txt) file for details.

## Troubleshooting

### Module Resolution Errors

If you encounter module resolution errors, ensure:
- You're using Node.js 20+
- Your imports include `.js` extensions (ESM requirement)
- `"type": "module"` is in package.json

### llama.cpp Model Loading Issues

- Ensure the model path is correct
- Verify the model is in GGUF format
- Check that the model is compatible with llama.cpp

### Database Locked Errors

- Close other connections to the database
- Ensure only one instance of the app is running
- Check file permissions on the database file

## Resources

- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [llama.cpp](https://github.com/ggerganov/llama.cpp)
- [llamacpp-ai-provider](https://github.com/KHAEntertainment/llamacpp-ai-provider)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
