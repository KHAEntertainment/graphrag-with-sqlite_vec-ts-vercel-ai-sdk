/**
 * Unit Tests for GraphRAGSandbox
 *
 * Tests the secure code execution sandbox including:
 * - Timeout enforcement
 * - Memory limits
 * - Node.js API isolation
 * - Error handling
 * - Cleanup/disposal
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphRAGSandbox } from '../../src/mcp/execution/sandbox.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use test database
const TEST_DB_PATH = join(__dirname, '../fixtures/test-e2e-embedding.db');

describe('GraphRAGSandbox', () => {
  let sandbox: GraphRAGSandbox;

  beforeEach(async () => {
    // Create fresh sandbox for each test
    sandbox = new GraphRAGSandbox(TEST_DB_PATH);
    await sandbox.initialize();
  });

  afterEach(() => {
    // Clean up after each test
    if (sandbox) {
      sandbox.dispose();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      expect(sandbox.isReady()).toBe(true);
    });

    it('should report memory statistics', () => {
      const stats = sandbox.getMemoryStats();
      expect(stats).toBeDefined();
      expect(stats.used_heap_size).toBeGreaterThan(0);
      expect(stats.heap_size_limit).toBeGreaterThan(0);
    });

    it('should not allow execution before initialization', async () => {
      const uninitializedSandbox = new GraphRAGSandbox(TEST_DB_PATH);
      
      await expect(
        uninitializedSandbox.execute('return 42;')
      ).rejects.toThrow('not initialized');
      
      uninitializedSandbox.dispose();
    });
  });

  describe('Basic Code Execution', () => {
    it('should execute simple code and return result', async () => {
      const code = 'return 42;';
      const result = await sandbox.execute(code);
      expect(result).toBe(42);
    });

    it('should execute code with variables', async () => {
      const code = `
        const x = 10;
        const y = 20;
        return x + y;
      `;
      const result = await sandbox.execute(code);
      expect(result).toBe(30);
    });

    it('should handle string results', async () => {
      const code = 'return "Hello, World!";';
      const result = await sandbox.execute(code);
      expect(result).toBe('Hello, World!');
    });

    it('should handle object results', async () => {
      const code = 'return { success: true, value: 42 };';
      const result = await sandbox.execute(code);
      expect(result).toEqual({ success: true, value: 42 });
    });

    it('should handle array results', async () => {
      const code = 'return [1, 2, 3, 4, 5];';
      const result = await sandbox.execute(code);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle async code with await', async () => {
      const code = `
        const promise = new Promise(resolve => {
          setTimeout(() => resolve('async result'), 10);
        });
        return await promise;
      `;
      const result = await sandbox.execute(code);
      expect(result).toBe('async result');
    });
  });

  describe('GraphRAG API Functions', () => {
    it('should have list_repositories function available', async () => {
      const code = `
        const repos = await list_repositories();
        return { hasFunction: true, isArray: Array.isArray(repos) };
      `;
      const result = await sandbox.execute(code);
      expect(result.hasFunction).toBe(true);
      expect(result.isArray).toBe(true);
    });

    it('should execute console.log without errors', async () => {
      const code = `
        console.log('Test message');
        return 'success';
      `;
      const result = await sandbox.execute(code);
      expect(result).toBe('success');
    });

    it('should allow multiple API calls', async () => {
      const code = `
        const repos = await list_repositories();
        const repos2 = await list_repositories();
        return { 
          firstCall: repos.length,
          secondCall: repos2.length,
          equal: repos.length === repos2.length
        };
      `;
      const result = await sandbox.execute(code);
      expect(result.equal).toBe(true);
    });
  });

  describe('Timeout Enforcement', () => {
    it('should enforce timeout on infinite loops', async () => {
      const code = 'while(true) {}';
      
      await expect(
        sandbox.execute(code, 1000)
      ).rejects.toThrow(/timeout/i);
    });

    it('should enforce timeout on long-running operations', async () => {
      const code = `
        const start = Date.now();
        while(Date.now() - start < 10000) {
          // Busy wait for 10 seconds
        }
        return 'done';
      `;
      
      await expect(
        sandbox.execute(code, 500)
      ).rejects.toThrow(/timeout/i);
    });

    it('should complete fast operations within timeout', async () => {
      const code = `
        let sum = 0;
        for(let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      `;
      
      const result = await sandbox.execute(code, 5000);
      expect(result).toBe(499500);
    });

    it('should use custom timeout value', async () => {
      const code = `
        const promise = new Promise(resolve => {
          setTimeout(() => resolve('done'), 100);
        });
        return await promise;
      `;
      
      // Should succeed with 200ms timeout
      const result = await sandbox.execute(code, 200);
      expect(result).toBe('done');
      
      // Should fail with 50ms timeout
      await expect(
        sandbox.execute(code, 50)
      ).rejects.toThrow(/timeout/i);
    });
  });

  describe('Security & Isolation', () => {
    it('should not have access to require()', async () => {
      const code = `
        try {
          const fs = require('fs');
          return { hasRequire: true };
        } catch (error) {
          return { hasRequire: false, error: error.message };
        }
      `;
      
      const result = await sandbox.execute(code);
      expect(result.hasRequire).toBe(false);
    });

    it('should not have access to process', async () => {
      const code = `
        return { hasProcess: typeof process !== 'undefined' };
      `;
      
      const result = await sandbox.execute(code);
      expect(result.hasProcess).toBe(false);
    });

    it('should not have access to global Node.js modules', async () => {
      const code = `
        return {
          hasFs: typeof fs !== 'undefined',
          hasPath: typeof path !== 'undefined',
          hasHttp: typeof http !== 'undefined',
          hasNet: typeof net !== 'undefined'
        };
      `;
      
      const result = await sandbox.execute(code);
      expect(result.hasFs).toBe(false);
      expect(result.hasPath).toBe(false);
      expect(result.hasHttp).toBe(false);
      expect(result.hasNet).toBe(false);
    });

    it('should have isolated global scope', async () => {
      const code = `
        // Try to access parent scope variables
        return {
          hasFilename: typeof __filename !== 'undefined',
          hasDirname: typeof __dirname !== 'undefined'
        };
      `;
      
      const result = await sandbox.execute(code);
      expect(result.hasFilename).toBe(false);
      expect(result.hasDirname).toBe(false);
    });

    it('should not allow access to parent context', async () => {
      const code = `
        try {
          // Try to escape sandbox
          const parent = this.constructor.constructor('return this')();
          return { escaped: true };
        } catch (error) {
          return { escaped: false };
        }
      `;
      
      const result = await sandbox.execute(code);
      expect(result.escaped).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle syntax errors', async () => {
      const code = 'this is not valid javascript {{{';
      
      await expect(
        sandbox.execute(code)
      ).rejects.toThrow();
    });

    it('should handle runtime errors', async () => {
      const code = `
        const obj = null;
        return obj.property;
      `;
      
      await expect(
        sandbox.execute(code)
      ).rejects.toThrow();
    });

    it('should handle reference errors', async () => {
      const code = 'return nonExistentVariable;';
      
      await expect(
        sandbox.execute(code)
      ).rejects.toThrow(/ReferenceError/i);
    });

    it('should provide helpful error messages for undefined functions', async () => {
      const code = 'return await nonExistentFunction();';
      
      await expect(
        sandbox.execute(code)
      ).rejects.toThrow(/ReferenceError/i);
    });

    it('should handle errors in async code', async () => {
      const code = `
        const promise = new Promise((resolve, reject) => {
          reject(new Error('Async error'));
        });
        return await promise;
      `;
      
      await expect(
        sandbox.execute(code)
      ).rejects.toThrow(/Async error/);
    });
  });

  describe('Memory Management', () => {
    it('should track memory usage', async () => {
      const code = `
        // Allocate some memory
        const arr = new Array(1000).fill({ data: new Array(100).fill(0) });
        return arr.length;
      `;
      
      const statsBefore = sandbox.getMemoryStats();
      await sandbox.execute(code);
      const statsAfter = sandbox.getMemoryStats();
      
      expect(statsAfter.used_heap_size).toBeGreaterThan(statsBefore.used_heap_size);
    });

    it('should report memory statistics', () => {
      const stats = sandbox.getMemoryStats();
      
      expect(stats).toHaveProperty('total_heap_size');
      expect(stats).toHaveProperty('used_heap_size');
      expect(stats).toHaveProperty('heap_size_limit');
      expect(stats.heap_size_limit).toBeGreaterThan(0);
    });

    it('should respect memory limit', () => {
      const stats = sandbox.getMemoryStats();
      const limitMB = 128;
      const limitBytes = limitMB * 1024 * 1024;
      
      // Memory limit should be around 128MB (give some tolerance)
      expect(stats.heap_size_limit).toBeLessThanOrEqual(limitBytes * 1.2);
      expect(stats.heap_size_limit).toBeGreaterThanOrEqual(limitBytes * 0.8);
    });
  });

  describe('Cleanup & Disposal', () => {
    it('should dispose cleanly', () => {
      const testSandbox = new GraphRAGSandbox(TEST_DB_PATH);
      
      expect(() => {
        testSandbox.dispose();
      }).not.toThrow();
    });

    it('should not allow execution after disposal', async () => {
      const testSandbox = new GraphRAGSandbox(TEST_DB_PATH);
      await testSandbox.initialize();
      
      testSandbox.dispose();
      
      await expect(
        testSandbox.execute('return 42;')
      ).rejects.toThrow();
    });

    it('should report not ready after disposal', async () => {
      const testSandbox = new GraphRAGSandbox(TEST_DB_PATH);
      await testSandbox.initialize();
      
      expect(testSandbox.isReady()).toBe(true);
      
      testSandbox.dispose();
      
      expect(testSandbox.isReady()).toBe(false);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle nested async operations', async () => {
      const code = `
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        
        async function nested() {
          await delay(10);
          return 'nested result';
        }
        
        const result = await nested();
        return result;
      `;
      
      const result = await sandbox.execute(code);
      expect(result).toBe('nested result');
    });

    it('should handle try-catch-finally', async () => {
      const code = `
        let finallyExecuted = false;
        
        try {
          throw new Error('test error');
        } catch (error) {
          // Caught
        } finally {
          finallyExecuted = true;
        }
        
        return { finallyExecuted };
      `;
      
      const result = await sandbox.execute(code);
      expect(result.finallyExecuted).toBe(true);
    });

    it('should handle multiple return statements', async () => {
      const code = `
        function test(value) {
          if (value > 10) {
            return 'high';
          }
          return 'low';
        }
        
        return {
          high: test(20),
          low: test(5)
        };
      `;
      
      const result = await sandbox.execute(code);
      expect(result).toEqual({ high: 'high', low: 'low' });
    });

    it('should handle array operations', async () => {
      const code = `
        const arr = [1, 2, 3, 4, 5];
        
        const doubled = arr.map(x => x * 2);
        const sum = arr.reduce((acc, x) => acc + x, 0);
        const filtered = arr.filter(x => x > 2);
        
        return { doubled, sum, filtered };
      `;
      
      const result = await sandbox.execute(code);
      expect(result).toEqual({
        doubled: [2, 4, 6, 8, 10],
        sum: 15,
        filtered: [3, 4, 5]
      });
    });

    it('should handle Promise.all', async () => {
      const code = `
        const promises = [
          Promise.resolve(1),
          Promise.resolve(2),
          Promise.resolve(3)
        ];
        
        const results = await Promise.all(promises);
        return results;
      `;
      
      const result = await sandbox.execute(code);
      expect(result).toEqual([1, 2, 3]);
    });
  });
});
