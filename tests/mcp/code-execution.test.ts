/**
 * Integration Tests for Code Execution MCP Server
 *
 * Tests the complete code execution flow including:
 * - Multi-step queries
 * - Parallel queries
 * - Conditional logic
 * - Error handling
 * - API integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GraphRAGSandbox } from '../../src/mcp/execution/sandbox.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use test database
const TEST_DB_PATH = join(__dirname, '../fixtures/test-e2e-embedding.db');

describe('Code Execution Integration', () => {
  let sandbox: GraphRAGSandbox;

  beforeAll(async () => {
    sandbox = new GraphRAGSandbox(TEST_DB_PATH);
    await sandbox.initialize();
  });

  afterAll(() => {
    if (sandbox) {
      sandbox.dispose();
    }
  });

  describe('Multi-Step Queries', () => {
    it('should execute query pipeline: list -> query -> analyze', async () => {
      const code = `
        // Step 1: List repositories
        const repos = await list_repositories();
        
        // Step 2: Query the first repository
        const results = await query_repositories({
          query: 'authentication',
          repositories: repos.length > 0 ? [repos[0].name] : undefined,
          maxTokens: 50
        });
        
        // Step 3: Analyze results
        return {
          totalRepos: repos.length,
          resultsCount: results.results.length,
          hasAnalysis: !!results.analysis
        };
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result).toBeDefined();
      expect(result.totalRepos).toBeGreaterThanOrEqual(0);
      expect(result.resultsCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle conditional branching based on results', async () => {
      const code = `
        // Step 1: Query for specific term
        const results = await query_repositories({
          query: 'authentication',
          maxTokens: 20
        });
        
        // Step 2: Conditional logic based on results
        if (results.results.length > 0) {
          const firstResult = results.results[0];
          
          // Step 3: Follow-up query if needed
          if (firstResult.repository) {
            const deps = await query_dependency({
              query: 'dependencies',
              repository: firstResult.repository
            });
            
            return {
              action: 'followed_up',
              originalResults: results.results.length,
              dependencyResults: deps.results.length
            };
          }
        }
        
        return {
          action: 'no_results',
          originalResults: 0
        };
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result).toBeDefined();
      expect(result.action).toMatch(/followed_up|no_results/);
    });

    it('should handle iterative refinement', async () => {
      const code = `
        // Start with broad query
        let query = 'module';
        let attempts = 0;
        let results = [];
        
        while (attempts < 3 && results.length < 5) {
          attempts++;
          
          const response = await query_repositories({
            query: query,
            maxTokens: 20
          });
          
          results = response.results;
          
          // Refine query if needed
          if (results.length === 0) {
            query = 'function';
          }
        }
        
        return {
          attempts,
          finalResultCount: results.length,
          refinedQuery: query
        };
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result.attempts).toBeGreaterThan(0);
      expect(result.attempts).toBeLessThanOrEqual(3);
      expect(result.finalResultCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Parallel Queries', () => {
    it('should execute multiple queries in parallel with Promise.all', async () => {
      const code = `
        // Execute multiple queries simultaneously
        const [auth, config, utils] = await Promise.all([
          query_repositories({ query: 'authentication', maxTokens: 10 }),
          query_repositories({ query: 'configuration', maxTokens: 10 }),
          query_repositories({ query: 'utilities', maxTokens: 10 })
        ]);
        
        return {
          auth: auth.results.length,
          config: config.results.length,
          utils: utils.results.length,
          total: auth.results.length + config.results.length + utils.results.length
        };
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.auth).toBeGreaterThanOrEqual(0);
      expect(result.config).toBeGreaterThanOrEqual(0);
      expect(result.utils).toBeGreaterThanOrEqual(0);
    });

    it('should handle parallel queries with different repositories', async () => {
      const code = `
        const repos = await list_repositories();
        
        if (repos.length === 0) {
          return { message: 'No repositories available' };
        }
        
        // Query each repository in parallel
        const queries = repos.slice(0, 3).map(repo => 
          query_repositories({
            query: 'function',
            repositories: [repo.name],
            maxTokens: 10
          })
        );
        
        const results = await Promise.all(queries);
        
        return {
          queriedRepos: results.length,
          totalResults: results.reduce((sum, r) => sum + r.results.length, 0),
          perRepo: results.map((r, i) => ({
            repo: repos[i].name,
            count: r.results.length
          }))
        };
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result).toBeDefined();
    });
  });

  describe('Smart Query Patterns', () => {
    it('should use smart_query with natural language', async () => {
      const code = `
        const result = await smart_query({
          query: 'How is authentication handled in the codebase?',
          maxTokens: 100
        });
        
        return {
          hasResults: result.results.length > 0,
          hasExplanation: !!result.explanation,
          resultCount: result.results.length
        };
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result).toBeDefined();
      expect(result.hasResults).toBeDefined();
      expect(result.hasExplanation).toBeDefined();
    });

    it('should compare smart_query vs regular query', async () => {
      const code = `
        const question = 'authentication implementation';
        
        const [smartResult, regularResult] = await Promise.all([
          smart_query({ query: question, maxTokens: 50 }),
          query_repositories({ query: question, maxTokens: 50 })
        ]);
        
        return {
          smart: {
            count: smartResult.results.length,
            hasExplanation: !!smartResult.explanation
          },
          regular: {
            count: regularResult.results.length,
            hasAnalysis: !!regularResult.analysis
          }
        };
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result.smart).toBeDefined();
      expect(result.regular).toBeDefined();
    });
  });

  describe('Cross-Repository Queries', () => {
    it('should query cross-references between repositories', async () => {
      const code = `
        const repos = await list_repositories();
        
        if (repos.length < 2) {
          return { message: 'Need at least 2 repos for cross-ref test' };
        }
        
        const crossRefs = await get_cross_references({
          sourceRepository: repos[0].name,
          targetRepository: repos[1].name
        });
        
        return {
          source: repos[0].name,
          target: repos[1].name,
          relationships: crossRefs.relationships.length,
          hasDependencies: crossRefs.relationships.some(r => r.type === 'uses')
        };
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result).toBeDefined();
    });

    it('should find shared dependencies across repositories', async () => {
      const code = `
        const repos = await list_repositories();
        
        if (repos.length < 2) {
          return { message: 'Need multiple repos' };
        }
        
        // Query dependencies for each repo
        const depQueries = repos.slice(0, 3).map(repo =>
          query_dependency({
            query: 'module OR package OR import',
            repository: repo.name
          })
        );
        
        const depResults = await Promise.all(depQueries);
        
        return {
          repoCount: depResults.length,
          totalDeps: depResults.reduce((sum, r) => sum + r.results.length, 0),
          perRepo: depResults.map((r, i) => ({
            repo: repos[i].name,
            depCount: r.results.length
          }))
        };
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result).toBeDefined();
    });
  });

  describe('Custom Data Processing', () => {
    it('should aggregate and transform results', async () => {
      const code = `
        const results = await query_repositories({
          query: 'function OR class',
          maxTokens: 100
        });
        
        // Group by repository
        const byRepo = {};
        results.results.forEach(result => {
          const repo = result.repository || 'unknown';
          if (!byRepo[repo]) {
            byRepo[repo] = [];
          }
          byRepo[repo].push(result);
        });
        
        // Calculate statistics
        const stats = Object.entries(byRepo).map(([repo, items]) => ({
          repository: repo,
          count: items.length,
          avgScore: items.reduce((sum, item) => sum + (item.score || 0), 0) / items.length
        }));
        
        return {
          totalResults: results.results.length,
          repositoryCount: Object.keys(byRepo).length,
          topRepository: stats.sort((a, b) => b.count - a.count)[0]
        };
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result).toBeDefined();
      expect(result.totalResults).toBeGreaterThanOrEqual(0);
      expect(result.repositoryCount).toBeGreaterThanOrEqual(0);
    });

    it('should filter and rank results', async () => {
      const code = `
        const results = await query_repositories({
          query: 'authentication',
          maxTokens: 50
        });
        
        // Filter by score threshold
        const threshold = 0.5;
        const filtered = results.results.filter(r => 
          (r.score || 0) > threshold
        );
        
        // Rank by score
        const ranked = filtered.sort((a, b) => 
          (b.score || 0) - (a.score || 0)
        );
        
        // Take top 5
        const top5 = ranked.slice(0, 5);
        
        return {
          originalCount: results.results.length,
          afterFilter: filtered.length,
          top5: top5.map(r => ({
            type: r.type,
            score: r.score,
            hasContent: !!r.content
          }))
        };
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result).toBeDefined();
      expect(result.originalCount).toBeGreaterThanOrEqual(0);
      expect(result.afterFilter).toBeLessThanOrEqual(result.originalCount);
      expect(Array.isArray(result.top5)).toBe(true);
    });
  });

  describe('Error Handling in Queries', () => {
    it('should handle empty query results gracefully', async () => {
      const code = `
        try {
          const results = await query_repositories({
            query: 'nonexistent_extremely_unlikely_term_xyz123',
            maxTokens: 10
          });
          
          return {
            success: true,
            resultsFound: results.results.length > 0,
            count: results.results.length
          };
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result.success).toBe(true);
    });

    it('should handle invalid repository names', async () => {
      const code = `
        try {
          const results = await query_repositories({
            query: 'test',
            repositories: ['nonexistent-repo-xyz'],
            maxTokens: 10
          });
          
          return {
            success: true,
            count: results.results.length
          };
        } catch (error) {
          return {
            success: false,
            errorType: error.constructor.name,
            message: error.message
          };
        }
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result).toBeDefined();
      // Should either succeed with 0 results or fail gracefully
    });

    it('should handle malformed queries with fallback', async () => {
      const code = `
        async function tryQuery(query) {
          try {
            return await query_repositories({ query, maxTokens: 10 });
          } catch (error) {
            console.log('Query failed, trying fallback');
            return await query_repositories({ query: 'function', maxTokens: 10 });
          }
        }
        
        const result = await tryQuery('');
        
        return {
          hasResults: result.results.length > 0,
          count: result.results.length
        };
      `;
      
      const result = await sandbox.execute(code);
      
      expect(result).toBeDefined();
    });
  });

  describe('Performance Characteristics', () => {
    it('should complete simple query within reasonable time', async () => {
      const code = `
        const start = Date.now();
        
        await query_repositories({
          query: 'test',
          maxTokens: 10
        });
        
        const elapsed = Date.now() - start;
        
        return { elapsed };
      `;
      
      const result = await sandbox.execute(code, 5000);
      
      expect(result.elapsed).toBeLessThan(5000);
    });

    it('should handle multiple sequential queries efficiently', async () => {
      const code = `
        const start = Date.now();
        const queries = ['auth', 'config', 'utils'];
        const results = [];
        
        for (const query of queries) {
          const result = await query_repositories({
            query,
            maxTokens: 5
          });
          results.push(result.results.length);
        }
        
        const elapsed = Date.now() - start;
        
        return {
          elapsed,
          queriesExecuted: queries.length,
          totalResults: results.reduce((a, b) => a + b, 0)
        };
      `;
      
      const result = await sandbox.execute(code, 10000);
      
      expect(result.queriesExecuted).toBe(3);
      expect(result.elapsed).toBeLessThan(10000);
    });
  });

  describe('Complex Workflow Integration', () => {
    it('should execute complete discovery workflow', async () => {
      const code = `
        // 1. Discover repositories
        const repos = await list_repositories();
        
        // 2. Find authentication-related code
        const authResults = await query_repositories({
          query: 'authentication OR auth OR login',
          maxTokens: 30
        });
        
        // 3. For each auth result, find what uses it
        const usageChecks = authResults.results.slice(0, 2).map(async result => {
          if (result.repository) {
            return await query_dependency({
              query: 'uses',
              repository: result.repository
            });
          }
          return { results: [] };
        });
        
        const usages = await Promise.all(usageChecks);
        
        // 4. Compile discovery report
        return {
          stage1_repos: repos.length,
          stage2_authComponents: authResults.results.length,
          stage3_usageLinks: usages.reduce((sum, u) => sum + u.results.length, 0),
          complete: true
        };
      `;
      
      const result = await sandbox.execute(code, 10000);
      
      expect(result.complete).toBe(true);
      expect(result.stage1_repos).toBeGreaterThanOrEqual(0);
    });

    it('should build knowledge graph from queries', async () => {
      const code = `
        const graph = {
          nodes: new Set(),
          edges: []
        };
        
        // Query for entities
        const results = await query_repositories({
          query: 'class OR function OR module',
          maxTokens: 50
        });
        
        // Build nodes from results
        results.results.forEach(result => {
          if (result.entity) {
            graph.nodes.add(result.entity);
          }
        });
        
        // Query for relationships
        const deps = await query_dependency({
          query: 'uses OR imports OR depends',
        });
        
        // Build edges
        deps.results.forEach(dep => {
          if (dep.source && dep.target) {
            graph.edges.push({
              from: dep.source,
              to: dep.target,
              type: dep.relationship || 'uses'
            });
          }
        });
        
        return {
          nodeCount: graph.nodes.size,
          edgeCount: graph.edges.length,
          hasGraph: graph.nodes.size > 0 || graph.edges.length > 0
        };
      `;
      
      const result = await sandbox.execute(code, 10000);
      
      expect(result).toBeDefined();
      expect(result.nodeCount).toBeGreaterThanOrEqual(0);
      expect(result.edgeCount).toBeGreaterThanOrEqual(0);
    });
  });
});
