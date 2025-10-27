/**
 * Hybrid Search Demo - Dynamic Multi-Strategy Search
 *
 * This example demonstrates the dynamic hybrid search system that combines:
 * - Dense (semantic): Vector embeddings for conceptual understanding
 * - Sparse (BM25): Keyword matching with tf-idf weighting
 * - Pattern (fuzzy): Trigram-based substring and fuzzy matching
 * - Graph (relationships): Entity-relationship traversal
 *
 * The system uses LLM-based query analysis to automatically determine
 * the optimal weights for each search strategy based on query type.
 */

import Database from 'better-sqlite3';
import { HybridSearchEngine, createHybridSearchEngine } from '../src/mcp/tools/hybrid-search.js';
import type { HybridSearchOptions } from '../src/mcp/tools/hybrid-search.js';

/**
 * Example 1: Conceptual Query
 * Query type: "conceptual"
 * Expected weights: Dense 0.7, Sparse 0.2, Pattern 0.0, Graph 0.1
 */
async function exampleConceptualQuery(hybridSearch: HybridSearchEngine) {
  console.log('=== Example 1: Conceptual Query ===\n');

  const query = 'How do I implement streaming AI responses in a web application?';

  const options: HybridSearchOptions = {
    maxResults: 10,
    explain: true, // Show ranking explanations
  };

  const result = await hybridSearch.search(query, options);

  console.log(`Query: "${query}"`);
  console.log(`\nQuery Analysis:`);
  console.log(`  Type: ${result.analysis.query_type}`);
  console.log(`  Confidence: ${result.analysis.confidence?.toFixed(2)}`);
  console.log(`  Reasoning: ${result.analysis.reasoning}`);
  console.log(`  Weights:`, result.analysis.weights);

  console.log(`\nPerformance Metrics:`);
  console.log(`  Total Time: ${result.metrics.totalTime}ms`);
  console.log(`  Dense: ${result.metrics.denseTime}ms`);
  console.log(`  Sparse: ${result.metrics.sparseTime}ms`);
  console.log(`  Pattern: ${result.metrics.patternTime}ms`);
  console.log(`  Graph: ${result.metrics.graphTime}ms`);
  console.log(`  Fusion: ${result.metrics.fusionTime}ms`);

  console.log(`\nCoverage (% of results from each strategy):`);
  console.log(`  Dense: ${(result.coverage.dense * 100).toFixed(0)}%`);
  console.log(`  Sparse: ${(result.coverage.sparse * 100).toFixed(0)}%`);
  console.log(`  Pattern: ${(result.coverage.pattern * 100).toFixed(0)}%`);
  console.log(`  Graph: ${(result.coverage.graph * 100).toFixed(0)}%`);

  console.log(`\nTop 3 Results:`);
  result.results.slice(0, 3).forEach((r, i) => {
    console.log(`\n  ${i + 1}. [RRF Score: ${r.score.toFixed(4)}] ${r.repo}`);
    console.log(`     Sources: ${Object.entries(r.sources).map(([type, rank]) => `${type}=#${rank}`).join(', ')}`);
    console.log(`     Content: ${r.content.slice(0, 150)}...`);

    if (result.explanations && result.explanations[i]) {
      console.log(`\n     Ranking Explanation:`);
      result.explanations[i].split('\n').forEach(line => {
        console.log(`       ${line}`);
      });
    }
  });

  console.log('\n');
}

/**
 * Example 2: Identifier Query
 * Query type: "identifier"
 * Expected weights: Dense 0.1, Sparse 0.5, Pattern 0.3, Graph 0.1
 */
async function exampleIdentifierQuery(hybridSearch: HybridSearchEngine) {
  console.log('=== Example 2: Identifier Query ===\n');

  const query = 'Find StreamingTextResponse class';

  const options: HybridSearchOptions = {
    maxResults: 5,
    explain: true,
  };

  const result = await hybridSearch.search(query, options);

  console.log(`Query: "${query}"`);
  console.log(`\nQuery Analysis:`);
  console.log(`  Type: ${result.analysis.query_type}`);
  console.log(`  Detected Identifiers:`, result.analysis.detected_identifiers || []);
  console.log(`  Weights:`, result.analysis.weights);

  console.log(`\nResults (${result.results.length}):`);
  result.results.forEach((r, i) => {
    console.log(`\n  ${i + 1}. [RRF Score: ${r.score.toFixed(4)}] ${r.repo}`);
    console.log(`     Sources: ${Object.entries(r.sources).map(([type, rank]) => `${type}=#${rank}`).join(', ')}`);
  });

  console.log('\n');
}

/**
 * Example 3: Relationship Query
 * Query type: "relationship"
 * Expected weights: Dense 0.1, Sparse 0.2, Pattern 0.1, Graph 0.6
 */
async function exampleRelationshipQuery(hybridSearch: HybridSearchEngine) {
  console.log('=== Example 3: Relationship Query ===\n');

  const query = 'What projects use the useChat hook from Vercel AI SDK?';

  const options: HybridSearchOptions = {
    maxResults: 10,
    minDiversity: 2, // Only show results from at least 2 search strategies
  };

  const result = await hybridSearch.search(query, options);

  console.log(`Query: "${query}"`);
  console.log(`\nQuery Analysis:`);
  console.log(`  Type: ${result.analysis.query_type}`);
  console.log(`  Weights:`, result.analysis.weights);

  console.log(`\nResults with minimum diversity (≥2 sources): ${result.results.length}`);
  result.results.slice(0, 5).forEach((r, i) => {
    const diversity = Object.keys(r.sources).length;
    console.log(`\n  ${i + 1}. [RRF Score: ${r.score.toFixed(4)}, Diversity: ${diversity}] ${r.repo}`);
    console.log(`     Sources: ${Object.entries(r.sources).map(([type, rank]) => `${type}=#${rank}`).join(', ')}`);
  });

  console.log('\n');
}

/**
 * Example 4: Fuzzy Query (with typos)
 * Query type: "fuzzy"
 * Expected weights: Dense 0.1, Sparse 0.2, Pattern 0.6, Graph 0.1
 */
async function exampleFuzzyQuery(hybridSearch: HybridSearchEngine) {
  console.log('=== Example 4: Fuzzy Query (Typo Tolerance) ===\n');

  const query = 'StreamingTxtResp'; // Typo: should be StreamingTextResponse

  const options: HybridSearchOptions = {
    maxResults: 5,
  };

  const result = await hybridSearch.search(query, options);

  console.log(`Query: "${query}" (contains typo)`);
  console.log(`\nQuery Analysis:`);
  console.log(`  Type: ${result.analysis.query_type}`);
  console.log(`  Has Typos: ${result.analysis.has_typos || false}`);
  console.log(`  Weights:`, result.analysis.weights);

  console.log(`\nResults (pattern matching with Levenshtein distance):`);
  result.results.forEach((r, i) => {
    console.log(`\n  ${i + 1}. [RRF Score: ${r.score.toFixed(4)}] ${r.repo}`);
    console.log(`     Sources: ${Object.entries(r.sources).map(([type, rank]) => `${type}=#${rank}`).join(', ')}`);
  });

  console.log('\n');
}

/**
 * Example 5: Custom Weights (Override LLM Analysis)
 * Demonstrates manual control over search strategy weights
 */
async function exampleCustomWeights(hybridSearch: HybridSearchEngine) {
  console.log('=== Example 5: Custom Weights (Manual Override) ===\n');

  const query = 'API authentication methods';

  // Force equal weighting across all strategies
  const options: HybridSearchOptions = {
    maxResults: 5,
    forceWeights: {
      dense: 0.25,
      sparse: 0.25,
      pattern: 0.25,
      graph: 0.25,
    },
  };

  const result = await hybridSearch.search(query, options);

  console.log(`Query: "${query}"`);
  console.log(`\nForced equal weights (skipped LLM analysis):`);
  console.log(`  Weights:`, result.analysis.weights);
  console.log(`  Reasoning: ${result.analysis.reasoning}`);

  console.log(`\nCoverage:`);
  console.log(`  Dense: ${(result.coverage.dense * 100).toFixed(0)}%`);
  console.log(`  Sparse: ${(result.coverage.sparse * 100).toFixed(0)}%`);
  console.log(`  Pattern: ${(result.coverage.pattern * 100).toFixed(0)}%`);
  console.log(`  Graph: ${(result.coverage.graph * 100).toFixed(0)}%`);

  console.log('\n');
}

/**
 * Example 6: RRF Tuning
 * Demonstrates impact of different RRF k constants
 */
async function exampleRRFTuning(hybridSearch: HybridSearchEngine) {
  console.log('=== Example 6: RRF K Constant Tuning ===\n');

  const query = 'streaming responses';

  // Test with different k values
  const kValues = [30, 60, 120]; // Lower k = more emphasis on top results

  for (const k of kValues) {
    const options: HybridSearchOptions = {
      maxResults: 5,
      rrfK: k,
    };

    const result = await hybridSearch.search(query, options);

    console.log(`RRF k=${k}:`);
    console.log(`  Top 3 RRF Scores: ${result.results.slice(0, 3).map(r => r.score.toFixed(4)).join(', ')}`);
  }

  console.log(`\nNote: Lower k values give more emphasis to top-ranked results in each strategy.`);
  console.log('      Higher k values distribute influence more evenly across all ranks.\n');
}

/**
 * Example 7: Multi-Repository Search
 * Demonstrates searching across multiple repositories
 */
async function exampleMultiRepoSearch(hybridSearch: HybridSearchEngine) {
  console.log('=== Example 7: Multi-Repository Search ===\n');

  const query = 'chat interface components';

  const options: HybridSearchOptions = {
    repositories: ['vercel/ai', 'copilotkit/copilotkit', 'ag-grid/ag-ui'], // Example repos
    maxResults: 10,
  };

  const result = await hybridSearch.search(query, options);

  console.log(`Query: "${query}"`);
  console.log(`Repositories: ${options.repositories?.join(', ')}`);

  // Group results by repository
  const byRepo = new Map<string, number>();
  result.results.forEach(r => {
    byRepo.set(r.repo, (byRepo.get(r.repo) || 0) + 1);
  });

  console.log(`\nResults by repository:`);
  for (const [repo, count] of byRepo.entries()) {
    console.log(`  ${repo}: ${count} results`);
  }

  console.log('\n');
}

/**
 * Main demo function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Dynamic Hybrid Search Demo                              ║');
  console.log('║   Intelligent Multi-Strategy RAG Retrieval                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Connect to database
  const dbPath = process.env.GRAPHRAG_DB_PATH || '.graphrag/database.sqlite';
  const db = new Database(dbPath);

  // Create hybrid search engine
  // Note: In production, you would provide a language model and embedding provider
  const hybridSearch = createHybridSearchEngine(db);

  console.log(`Database: ${dbPath}`);
  console.log(`Query Analyzer: Heuristic fallback (no LLM provided)`);
  console.log(`Embedding Provider: Not configured (dense search disabled)\n`);
  console.log('─'.repeat(60) + '\n');

  try {
    // Run all examples
    await exampleConceptualQuery(hybridSearch);
    await exampleIdentifierQuery(hybridSearch);
    await exampleRelationshipQuery(hybridSearch);
    await exampleFuzzyQuery(hybridSearch);
    await exampleCustomWeights(hybridSearch);
    await exampleRRFTuning(hybridSearch);
    await exampleMultiRepoSearch(hybridSearch);

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   Demo Complete!                                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('Key Takeaways:');
    console.log('  1. Different query types trigger different search strategies');
    console.log('  2. LLM analysis automatically optimizes weights for query type');
    console.log('  3. RRF fusion combines incomparable scoring systems');
    console.log('  4. Pattern matching provides typo tolerance');
    console.log('  5. Graph search excels at relationship queries');
    console.log('  6. Coverage metrics show which strategies contributed');
    console.log('  7. Ranking explanations provide transparency\n');

  } catch (error) {
    console.error('Error running demo:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  exampleConceptualQuery,
  exampleIdentifierQuery,
  exampleRelationshipQuery,
  exampleFuzzyQuery,
  exampleCustomWeights,
  exampleRRFTuning,
  exampleMultiRepoSearch,
};
