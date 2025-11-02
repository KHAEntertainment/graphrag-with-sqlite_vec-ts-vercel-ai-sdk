/**
 * Structured Error Types for GraphRAG
 *
 * Provides consistent error handling across the application with:
 * - Type-safe error classification
 * - Error context and metadata
 * - Error recovery strategies
 * - Integration with Logger
 */

/**
 * Base error class for all GraphRAG errors
 */
export class GraphRAGError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;
  public readonly recoverable: boolean;
  public readonly cause?: Error;

  constructor(
    message: string,
    options: {
      code: string;
      context?: Record<string, unknown>;
      recoverable?: boolean;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.context = options.context;
    this.recoverable = options.recoverable ?? false;
    this.cause = options.cause;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      recoverable: this.recoverable,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends GraphRAGError {
  constructor(
    message: string,
    options: {
      context?: Record<string, unknown>;
      cause?: Error;
      recoverable?: boolean;
    } = {}
  ) {
    super(message, {
      code: 'DATABASE_ERROR',
      ...options,
    });
  }
}

/**
 * Database connection errors
 */
export class DatabaseConnectionError extends DatabaseError {
  constructor(dbPath: string, cause?: Error) {
    super(`Failed to connect to database: ${dbPath}`, {
      code: 'DB_CONNECTION_FAILED',
      context: { dbPath },
      cause,
      recoverable: true, // Can retry connection
    });
  }
}

/**
 * Database query errors
 */
export class DatabaseQueryError extends DatabaseError {
  constructor(query: string, cause?: Error) {
    super('Database query failed', {
      code: 'DB_QUERY_FAILED',
      context: { query: query.substring(0, 100) }, // Truncate long queries
      cause,
      recoverable: false,
    });
  }
}

/**
 * Missing table/schema errors
 */
export class DatabaseSchemaError extends DatabaseError {
  constructor(tableName: string, operation: string) {
    super(`Required table '${tableName}' not found for operation: ${operation}`, {
      code: 'DB_SCHEMA_MISSING',
      context: { tableName, operation },
      recoverable: false, // Requires schema migration
    });
  }
}

/**
 * Embedding-related errors
 */
export class EmbeddingError extends GraphRAGError {
  constructor(
    message: string,
    options: {
      context?: Record<string, unknown>;
      cause?: Error;
      recoverable?: boolean;
    } = {}
  ) {
    super(message, {
      code: 'EMBEDDING_ERROR',
      ...options,
    });
  }
}

/**
 * Model initialization errors
 */
export class ModelInitializationError extends EmbeddingError {
  constructor(modelName: string, cause?: Error) {
    super(`Failed to initialize embedding model: ${modelName}`, {
      code: 'MODEL_INIT_FAILED',
      context: { modelName },
      cause,
      recoverable: true, // Can try different model
    });
  }
}

/**
 * Embedding generation errors
 */
export class EmbeddingGenerationError extends EmbeddingError {
  constructor(text: string, cause?: Error) {
    super('Failed to generate embedding', {
      code: 'EMBEDDING_GENERATION_FAILED',
      context: { textLength: text.length, textPreview: text.substring(0, 50) },
      cause,
      recoverable: true, // Can retry
    });
  }
}

/**
 * LLM-related errors
 */
export class LLMError extends GraphRAGError {
  constructor(
    message: string,
    options: {
      context?: Record<string, unknown>;
      cause?: Error;
      recoverable?: boolean;
    } = {}
  ) {
    super(message, {
      code: 'LLM_ERROR',
      ...options,
    });
  }
}

/**
 * LLM API errors (rate limits, timeouts, etc.)
 */
export class LLMAPIError extends LLMError {
  constructor(provider: string, statusCode?: number, cause?: Error) {
    super(`LLM API request failed for provider: ${provider}`, {
      code: 'LLM_API_FAILED',
      context: { provider, statusCode },
      cause,
      recoverable: statusCode === 429 || statusCode === 503, // Rate limit or service unavailable
    });
  }
}

/**
 * LLM response parsing errors
 */
export class LLMParseError extends LLMError {
  constructor(expectedFormat: string, actualResponse: string, cause?: Error) {
    super(`Failed to parse LLM response. Expected format: ${expectedFormat}`, {
      code: 'LLM_PARSE_FAILED',
      context: {
        expectedFormat,
        responsePreview: actualResponse.substring(0, 100),
      },
      cause,
      recoverable: true, // Can retry with better prompt
    });
  }
}

/**
 * Query-related errors
 */
export class QueryError extends GraphRAGError {
  constructor(
    message: string,
    options: {
      context?: Record<string, unknown>;
      cause?: Error;
      recoverable?: boolean;
    } = {}
  ) {
    super(message, {
      code: 'QUERY_ERROR',
      ...options,
    });
  }
}

/**
 * Invalid query errors
 */
export class InvalidQueryError extends QueryError {
  constructor(query: string, reason: string) {
    super(`Invalid query: ${reason}`, {
      code: 'QUERY_INVALID',
      context: { query: query.substring(0, 100), reason },
      recoverable: false, // User must fix query
    });
  }
}

/**
 * Query timeout errors
 */
export class QueryTimeoutError extends QueryError {
  constructor(query: string, timeoutMs: number) {
    super(`Query timed out after ${timeoutMs}ms`, {
      code: 'QUERY_TIMEOUT',
      context: { query: query.substring(0, 100), timeoutMs },
      recoverable: true, // Can retry with longer timeout
    });
  }
}

/**
 * MCP Server errors
 */
export class MCPError extends GraphRAGError {
  constructor(
    message: string,
    options: {
      context?: Record<string, unknown>;
      cause?: Error;
      recoverable?: boolean;
    } = {}
  ) {
    super(message, {
      code: 'MCP_ERROR',
      ...options,
    });
  }
}

/**
 * MCP tool execution errors
 */
export class MCPToolError extends MCPError {
  constructor(toolName: string, cause?: Error) {
    super(`MCP tool execution failed: ${toolName}`, {
      code: 'MCP_TOOL_FAILED',
      context: { toolName },
      cause,
      recoverable: false,
    });
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends GraphRAGError {
  constructor(configKey: string, reason: string) {
    super(`Configuration error for '${configKey}': ${reason}`, {
      code: 'CONFIG_ERROR',
      context: { configKey, reason },
      recoverable: false, // User must fix configuration
    });
  }
}

/**
 * File system errors
 */
export class FileSystemError extends GraphRAGError {
  constructor(
    operation: string,
    path: string,
    cause?: Error
  ) {
    super(`File system ${operation} failed: ${path}`, {
      code: 'FS_ERROR',
      context: { operation, path },
      cause,
      recoverable: false,
    });
  }
}

/**
 * Validation errors
 */
export class ValidationError extends GraphRAGError {
  constructor(field: string, reason: string) {
    super(`Validation failed for '${field}': ${reason}`, {
      code: 'VALIDATION_ERROR',
      context: { field, reason },
      recoverable: false, // User must provide valid input
    });
  }
}

/**
 * Error recovery strategies
 */
export interface ErrorRecoveryStrategy {
  /** Can this error be retried? */
  canRetry: boolean;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Backoff strategy (ms delay between retries) */
  backoffMs?: number[];
  /** Fallback action to take if retries fail */
  fallback?: () => void | Promise<void>;
}

/**
 * Get recommended recovery strategy for an error
 */
export function getRecoveryStrategy(error: Error): ErrorRecoveryStrategy {
  if (error instanceof GraphRAGError) {
    // Recoverable errors can be retried
    if (error.recoverable) {
      if (error instanceof LLMAPIError && error.context?.statusCode === 429) {
        // Rate limit: exponential backoff
        return {
          canRetry: true,
          maxRetries: 3,
          backoffMs: [1000, 5000, 15000],
        };
      }

      if (error instanceof QueryTimeoutError) {
        // Timeout: linear backoff
        return {
          canRetry: true,
          maxRetries: 2,
          backoffMs: [2000, 5000],
        };
      }

      // Default retry strategy
      return {
        canRetry: true,
        maxRetries: 3,
        backoffMs: [1000, 2000, 4000],
      };
    }
  }

  // Non-recoverable or unknown errors
  return {
    canRetry: false,
  };
}

/**
 * Wrap native errors with GraphRAG error types
 */
export function wrapError(error: unknown, context?: string): GraphRAGError {
  if (error instanceof GraphRAGError) {
    return error;
  }

  if (error instanceof Error) {
    return new GraphRAGError(error.message, {
      code: 'UNKNOWN_ERROR',
      context: { originalError: error.name, context },
      cause: error,
      recoverable: false,
    });
  }

  // Handle non-Error objects
  return new GraphRAGError(String(error), {
    code: 'UNKNOWN_ERROR',
    context: { context },
    recoverable: false,
  });
}

/**
 * Type guard for GraphRAG errors
 */
export function isGraphRAGError(error: unknown): error is GraphRAGError {
  return error instanceof GraphRAGError;
}

/**
 * Type guard for recoverable errors
 */
export function isRecoverableError(error: unknown): boolean {
  return error instanceof GraphRAGError && error.recoverable;
}
