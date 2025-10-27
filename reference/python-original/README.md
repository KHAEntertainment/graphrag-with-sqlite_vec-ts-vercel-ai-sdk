# Original Python Implementation

This directory contains the original Python implementation of GraphRAG with SQLite by [stephenc222](https://github.com/stephenc222).

**Original Repository:** https://github.com/stephenc222/example-graphrag-with-sqlite

## About the Original

The Python implementation demonstrates a pure symbolic GraphRAG approach using:
- OpenAI's GPT models for entity and relationship extraction
- SQLite for graph storage (nodes and edges)
- Centrality analysis for query answering
- No vector embeddings (graph-based only)

## TypeScript Version

This project has been converted to TypeScript with enhancements:
- Multi-provider support (OpenAI, llama.cpp)
- Embedding layer for semantic search (optional)
- Better type safety and modern tooling
- Same core GraphRAG architecture

See the main [README.md](../../README-TYPESCRIPT.md) for the TypeScript implementation.

## Running the Python Version

If you want to use the original Python implementation:

```bash
cd reference/python-original

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp ../../.env.example .env
# Edit .env with your OPENAI_API_KEY

# Run
python app.py
```

## License

The original implementation is MIT licensed by stephenc222.

## Credits

All credit for the original GraphRAG architecture and implementation goes to:
- **Author:** stephenc222
- **Repository:** https://github.com/stephenc222/example-graphrag-with-sqlite
- **License:** MIT

The TypeScript conversion maintains the same MIT license and builds upon this excellent foundation.
