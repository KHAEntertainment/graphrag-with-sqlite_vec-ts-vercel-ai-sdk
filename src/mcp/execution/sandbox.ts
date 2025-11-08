/**
 * GraphRAG Sandbox - Secure Code Execution Environment
 *
 * This module provides a secure sandbox for executing agent-generated code
 * using isolated-vm. The sandbox:
 * - Runs in a separate V8 isolate (isolated heap)
 * - Has strict timeout limits (default: 5 seconds)
 * - Has memory limits (default: 128MB)
 * - Cannot access Node.js APIs (fs, net, child_process, etc.)
 * - Can only call injected GraphRAG API functions
 *
 * Security model:
 * - Agent code is trusted (comes from Claude)
 * - Local database queries (no external attacks)
 * - User's own machine (not multi-tenant)
 * - Timeout and memory limits prevent resource exhaustion
 *
 * @see docs/MCP-CODE-EXECUTION-ANALYSIS.md for security assessment
 */

import ivm from 'isolated-vm';
import { GraphRAGAPI } from '../api/graphrag-api.js';
import { Logger } from '../../lib/logger.js';
import type { SandboxExecutionOptions, SandboxExecutionResult } from '../../types/code-execution.js';

/**
 * Default sandbox configuration
 */
const DEFAULT_TIMEOUT = 5000; // 5 seconds
const DEFAULT_MEMORY_LIMIT = 128; // 128MB

/**
 * GraphRAG Sandbox for secure code execution
 */
export class GraphRAGSandbox {
  private isolate: ivm.Isolate;
  private context: ivm.Context | null = null;
  private api: GraphRAGAPI;
  private logger: Logger;
  private isInitialized = false;

  constructor(dbPath: string, memoryLimit: number = DEFAULT_MEMORY_LIMIT) {
    this.logger = new Logger();
    this.api = new GraphRAGAPI(dbPath);

    // Create isolate with memory limit
    this.isolate = new ivm.Isolate({
      memoryLimit,
      onCatastrophicError: (error: string) => {
        this.logger.error('[Sandbox] Catastrophic error:', error);
      },
    });

    this.logger.info(`[Sandbox] Created isolate with ${memoryLimit}MB memory limit`);
  }

  /**
   * Initialize the sandbox context and inject GraphRAG API
   *
   * Must be called before execute()
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('[Sandbox] Already initialized');
      return;
    }

    try {
      // Create context
      this.context = await this.isolate.createContext();
      const jail = this.context.global;

      // Set global scope
      await jail.set('global', jail.derefInto());

      // Inject console.log for debugging using Callback
      await jail.set(
        'console',
        new ivm.Reference({
          log: new ivm.Callback((...args: any[]) => {
            this.logger.info('[Sandbox Code]', ...args);
          }),
        }),
        { reference: true }
      );

      // Inject GraphRAG API functions
      // Note: We wrap each function to ensure proper async handling
      await this.injectAPIFunction(jail, 'query_repositories', (options: any) =>
        this.api.queryRepositories(options)
      );

      await this.injectAPIFunction(jail, 'query_dependency', (options: any) =>
        this.api.queryDependency(options)
      );

      await this.injectAPIFunction(jail, 'get_cross_references', (options: any) =>
        this.api.getCrossReferences(options)
      );

      await this.injectAPIFunction(jail, 'list_repositories', () => this.api.listRepositories());

      await this.injectAPIFunction(jail, 'smart_query', (options: any) =>
        this.api.smartQuery(options)
      );

      this.isInitialized = true;
      this.logger.info('[Sandbox] Initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[Sandbox] Initialization failed:', errorMessage);
      throw new Error(`Sandbox initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Helper to inject API functions into the sandbox
   */
  private async injectAPIFunction(
    jail: ivm.Reference<Record<string, any>>,
    name: string,
    fn: (...args: any[]) => Promise<any>
  ): Promise<void> {
    const ref = new ivm.Reference(async (...args: any[]) => {
      try {
        const result = await fn(...args);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`${name} error: ${errorMessage}`);
      }
    });

    await jail.set(name, ref, { reference: true });
  }

  /**
   * Execute code in the sandbox
   *
   * @param code JavaScript code to execute
   * @param timeout Optional timeout in milliseconds (default: 5000)
   * @returns Execution result
   */
  async execute(code: string, timeout: number = DEFAULT_TIMEOUT): Promise<any> {
    if (!this.isInitialized || !this.context) {
      throw new Error('Sandbox not initialized. Call initialize() first.');
    }

    const startTime = Date.now();

    try {
      this.logger.info('[Sandbox] Executing code...');
      this.logger.debug('[Sandbox] Code:', code.substring(0, 200));

      // Wrap code in async IIFE to support await and return statements
      const wrappedCode = `(async () => { ${code} })()`;

      // Compile and execute with timeout
      const wrappedScript = await this.isolate.compileScript(wrappedCode);
      
      // Run with promise support - this returns a Reference to the Promise
      const promiseRef = await wrappedScript.run(this.context, { timeout, promise: true });
      
      // Await the promise to get the result Reference
      const resultRef = await promiseRef;
      
      // Copy the result out of the isolate
      let copiedResult;
      try {
        if (resultRef && resultRef.copy) {
          // It's a Reference - use copy() to extract the value
          copiedResult = await resultRef.copy();
        } else if (resultRef && resultRef.copySync) {
          // Sync copy available
          copiedResult = resultRef.copySync();
        } else {
          // Primitive value, can be used directly
          copiedResult = resultRef;
        }
      } catch (copyError: any) {
        // If copy fails, the value might be a primitive or undefined
        this.logger.debug(`[Sandbox] Copy not needed for primitive: ${copyError.message}`);
        copiedResult = resultRef;
      }

      const executionTime = Date.now() - startTime;
      this.logger.info(`[Sandbox] Execution successful (${executionTime}ms)`);

      return copiedResult;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error.message || String(error);

      // Provide helpful error messages
      if (errorMessage.includes('Script execution timed out')) {
        this.logger.error(`[Sandbox] Timeout after ${timeout}ms`);
        throw new Error(
          `Code execution timeout (${timeout}ms limit). ` +
            `Try optimizing your code or breaking it into smaller operations.`
        );
      }

      if (errorMessage.includes('memory')) {
        this.logger.error('[Sandbox] Memory limit exceeded');
        throw new Error(
          'Code execution exceeded memory limit. ' +
            'Try processing less data or optimizing memory usage.'
        );
      }

      if (errorMessage.includes('ReferenceError')) {
        this.logger.error('[Sandbox] Reference error:', errorMessage);
        throw new Error(
          `Code error: ${errorMessage}\n\n` +
            `Available functions: query_repositories(), query_dependency(), ` +
            `get_cross_references(), list_repositories(), smart_query()`
        );
      }

      // Generic error
      this.logger.error(`[Sandbox] Execution error (${executionTime}ms):`, errorMessage);
      throw new Error(`Code execution error: ${errorMessage}`);
    }
  }

  /**
   * Get memory usage statistics
   *
   * @returns Heap statistics
   */
  getMemoryStats(): ivm.HeapStatistics {
    return this.isolate.getHeapStatistics();
  }

  /**
   * Dispose of the sandbox and free resources
   *
   * Should be called when the sandbox is no longer needed.
   */
  dispose(): void {
    try {
      if (this.context) {
        this.context.release();
        this.context = null;
      }

      if (this.isolate) {
        this.isolate.dispose();
      }

      this.api.close();
      this.isInitialized = false;

      this.logger.info('[Sandbox] Disposed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[Sandbox] Dispose error:', errorMessage);
    }
  }

  /**
   * Check if sandbox is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.context !== null;
  }
}

/**
 * Create and initialize a new sandbox
 *
 * Convenience function for creating a ready-to-use sandbox.
 *
 * @param dbPath Path to GraphRAG database
 * @param memoryLimit Memory limit in MB (default: 128)
 * @returns Initialized sandbox
 */
export async function createSandbox(
  dbPath: string,
  memoryLimit?: number
): Promise<GraphRAGSandbox> {
  const sandbox = new GraphRAGSandbox(dbPath, memoryLimit);
  await sandbox.initialize();
  return sandbox;
}
