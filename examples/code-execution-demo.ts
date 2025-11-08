/**
 * GraphRAG Code Execution Demo
 *
 * This example demonstrates the code execution capabilities of the
 * GraphRAG MCP server with various query patterns.
 *
 * Run with: npm run examples:code-exec
 *
 * Note: This is a demonstration of code that would be executed in the sandbox.
 * In practice, this code would be sent as a string to the execute_graphrag_code tool.
 */

// Example 1: Simple Query
export const simpleQuery = `
// Simple query across repositories
const results = await query_repositories({
  query: 'streaming API',
  repositories: ['vercel/ai', 'ag-grid/ag-ui']
});

console.log('Found', results.results.length, 'results');
console.log('Query type:', results.analysis.query_type);

return {
  resultCount: results.results.length,
  queryType: results.analysis.query_type,
  topResult: results.results[0]
};
`;

// Example 2: Multi-Step Query
export const multiStepQuery = `
// Step 1: Find relevant APIs
const overview = await query_repositories({
  query: 'streaming text response',
  maxTokens: 200
});

console.log('Step 1: Found', overview.results.length, 'results');

// Step 2: Get detailed information about top result
let details = null;
if (overview.results.length > 0) {
  const topEntity = overview.results[0].content.match(/\\w+/)?.[0];
  if (topEntity) {
    details = await query_dependency({
      dependency: topEntity,
      aspect: 'all'
    });
    console.log('Step 2: Got details for', topEntity);
  }
}

// Step 3: Find cross-repository references
let crossRefs = [];
if (details && details.entities.length > 0) {
  crossRefs = await get_cross_references({
    entity: details.entities[0].id,
    minStrength: 0.7
  });
  console.log('Step 3: Found', crossRefs.length, 'cross-references');
}

return {
  overview: {
    count: overview.results.length,
    queryType: overview.analysis.query_type
  },
  details: details ? {
    entityCount: details.entities.length,
    relationshipCount: details.relationships?.length || 0
  } : null,
  crossReferences: crossRefs.length,
  totalSteps: 3
};
`;

// Example 3: Parallel Queries
export const parallelQuery = `
// Query multiple repositories in parallel
console.log('Starting parallel queries...');

const repos = await list_repositories();
console.log('Found', repos.length, 'repositories');

// Parallel search across all repos
const results = await Promise.all([
  query_repositories({ query: 'streaming', repositories: ['vercel/ai'] }),
  query_repositories({ query: 'streaming', repositories: ['ag-grid/ag-ui'] }),
  query_repositories({ query: 'streaming', repositories: ['copilotkit/copilotkit'] })
]);

// Aggregate results
const summary = {
  totalResults: results.reduce((sum, r) => sum + r.results.length, 0),
  byRepository: results.map((r, idx) => ({
    repo: ['vercel/ai', 'ag-grid/ag-ui', 'copilotkit/copilotkit'][idx],
    count: r.results.length,
    queryType: r.analysis.query_type,
    searchTime: r.metrics.totalTime
  })),
  averageSearchTime: results.reduce((sum, r) => sum + r.metrics.totalTime, 0) / results.length
};

console.log('Parallel query complete:', summary.totalResults, 'total results');

return summary;
`;

// Example 4: Conditional Logic
export const conditionalQuery = `
// Adaptive query based on result type
const initial = await query_repositories({
  query: 'API integration patterns'
});

console.log('Initial query type:', initial.analysis.query_type);
console.log('Confidence:', initial.analysis.confidence);

let strategy;
let deepDive = null;

if (initial.analysis.query_type === 'identifier' && initial.results.length > 0) {
  // Specific entity found - get detailed information
  strategy = 'deep-dive';
  console.log('Strategy: Deep dive on specific entity');
  
  const entity = initial.results[0].id;
  deepDive = await query_dependency({
    dependency: entity,
    aspect: 'relationships'
  });
  
  console.log('Found', deepDive.entities.length, 'related entities');
} else if (initial.analysis.query_type === 'conceptual') {
  // Broad conceptual query - use smart query for better results
  strategy = 'smart-query';
  console.log('Strategy: Using smart query for conceptual question');
  
  deepDive = await smart_query({
    question: 'What are the main API integration patterns?',
    maxTokens: 300
  });
} else {
  // Default - return overview
  strategy = 'overview';
  console.log('Strategy: Overview of results');
}

return {
  strategy,
  initialResults: initial.results.length,
  queryType: initial.analysis.query_type,
  confidence: initial.analysis.confidence,
  deepDiveResults: deepDive ? (deepDive.entities?.length || deepDive.results?.length || 0) : 0
};
`;

// Example 5: Custom Result Processing
export const customProcessing = `
// Complex result processing with filtering and analysis
const results = await query_repositories({
  query: 'configuration options',
  explain: false
});

console.log('Processing', results.results.length, 'results');

// Group by repository
const byRepo = {};
for (const result of results.results) {
  if (!byRepo[result.repo]) {
    byRepo[result.repo] = [];
  }
  byRepo[result.repo].push(result);
}

// Analyze each repository's results
const analysis = {};
for (const [repo, items] of Object.entries(byRepo)) {
  // Sort by score
  items.sort((a, b) => b.score - a.score);
  
  // Calculate stats
  const scores = items.map(i => i.score);
  const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const maxScore = Math.max(...scores);
  
  // Determine search strategy effectiveness
  const sources = items.map(i => Object.keys(i.sources)[0]);
  const sourceDistribution = {};
  for (const source of sources) {
    sourceDistribution[source] = (sourceDistribution[source] || 0) + 1;
  }
  
  analysis[repo] = {
    count: items.length,
    avgScore,
    maxScore,
    topResult: items[0].content.substring(0, 100),
    searchStrategies: sourceDistribution
  };
}

console.log('Analysis complete for', Object.keys(analysis).length, 'repositories');

return {
  summary: {
    totalResults: results.results.length,
    repositoryCount: Object.keys(byRepo).length,
    averageResultsPerRepo: results.results.length / Object.keys(byRepo).length
  },
  byRepository: analysis,
  searchMetrics: {
    totalTime: results.metrics.totalTime,
    denseTime: results.metrics.denseTime,
    sparseTime: results.metrics.sparseTime,
    patternTime: results.metrics.patternTime,
    graphTime: results.metrics.graphTime
  }
};
`;

// Example 6: Error Handling
export const errorHandling = `
// Robust error handling
let results;
try {
  results = await query_repositories({
    query: 'specific-entity-that-might-not-exist'
  });
  
  if (results.results.length === 0) {
    console.log('No results found, trying alternative search');
    
    // Try alternative search
    results = await smart_query({
      question: 'What entities are available?',
      maxTokens: 200
    });
  }
} catch (error) {
  console.log('Error occurred:', error.message);
  
  // Fallback to listing repositories
  const repos = await list_repositories();
  return {
    error: error.message,
    fallback: 'Repository list',
    repositories: repos.map(r => r.id)
  };
}

return {
  success: true,
  resultCount: results.results.length,
  queryType: results.analysis.query_type
};
`;

/**
 * Demonstration runner (for testing purposes)
 */
if (import.meta.url === new URL(import.meta.url).href) {
  console.log('GraphRAG Code Execution Examples\n');
  console.log('These examples show code that would be sent to execute_graphrag_code:\n');
  
  console.log('Example 1: Simple Query');
  console.log('='.repeat(50));
  console.log(simpleQuery);
  console.log('\n');
  
  console.log('Example 2: Multi-Step Query');
  console.log('='.repeat(50));
  console.log(multiStepQuery);
  console.log('\n');
  
  console.log('Example 3: Parallel Queries');
  console.log('='.repeat(50));
  console.log(parallelQuery);
  console.log('\n');
  
  console.log('Example 4: Conditional Logic');
  console.log('='.repeat(50));
  console.log(conditionalQuery);
  console.log('\n');
  
  console.log('Example 5: Custom Processing');
  console.log('='.repeat(50));
  console.log(customProcessing);
  console.log('\n');
  
  console.log('Example 6: Error Handling');
  console.log('='.repeat(50));
  console.log(errorHandling);
  console.log('\n');
  
  console.log('To use these in practice:');
  console.log('1. Start the MCP server: npm run mcp:code-exec:dev');
  console.log('2. Connect Claude Desktop or another MCP client');
  console.log('3. Use the execute_graphrag_code tool with any of these code strings');
}
