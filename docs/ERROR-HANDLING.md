# Error Handling Guide

This document describes the error handling patterns and best practices for the GraphRAG TypeScript codebase.

## Error Type Hierarchy

All custom errors extend from `GraphRAGError` base class, which provides:
- **Type-safe error codes** for error classification
- **Context metadata** for debugging
- **Recoverability flags** for retry logic
- **Cause chain tracking** for nested errors

```typescript
import { DatabaseError, LLMAPIError, wrapError } from '../types/errors.js';
```

## Error Categories

### Database Errors
- `DatabaseConnectionError` - Failed to connect to SQLite
- `DatabaseQueryError` - SQL query execution failed
- `DatabaseSchemaError` - Missing required tables/schema

### Embedding Errors
- `ModelInitializationError` - Failed to load embedding model
- `EmbeddingGenerationError` - Failed to generate embeddings

### LLM Errors
- `LLMAPIError` - API request failed (rate limits, timeouts)
- `LLMParseError` - Failed to parse LLM response

### Query Errors
- `InvalidQueryError` - Malformed user query
- `QueryTimeoutError` - Query exceeded timeout

### MCP Server Errors
- `MCPToolError` - MCP tool execution failed

### Other Errors
- `ConfigurationError` - Invalid configuration
- `FileSystemError` - File I/O errors
- `ValidationError` - Input validation failed

## Usage Patterns

### 1. Throwing Structured Errors

```typescript
import { DatabaseConnectionError, QueryTimeoutError } from '../types/errors.js';

// Database connection
try {
  this.db = new Database(dbPath);
} catch (error) {
  throw new DatabaseConnectionError(dbPath, error instanceof Error ? error : undefined);
}

// Query timeout
if (elapsed > timeoutMs) {
  throw new QueryTimeoutError(query, timeoutMs);
}
```

### 2. Catching and Wrapping Errors

```typescript
import { wrapError, isGraphRAGError } from '../types/errors.js';

try {
  await riskyOperation();
} catch (error) {
  // Wrap unknown errors
  const wrappedError = wrapError(error, 'riskyOperation context');

  // Log with full context
  this.logger.error('Operation failed:', wrappedError.toJSON());

  // Re-throw or handle
  throw wrappedError;
}
```

### 3. Error Recovery with Retry Logic

```typescript
import { getRecoveryStrategy, isRecoverableError } from '../types/errors.js';

async function executeWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRecoverableError(error)) {
        throw lastError;
      }

      const strategy = getRecoveryStrategy(lastError);
      if (!strategy.canRetry || attempt >= (strategy.maxRetries ?? 3) - 1) {
        throw lastError;
      }

      const backoffMs = strategy.backoffMs?.[attempt] ?? 1000;
      this.logger.warn(`${operationName} failed, retrying in ${backoffMs}ms...`, {
        attempt: attempt + 1,
        error: lastError.message,
      });

      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError;
}
```

### 4. Logging Errors

```typescript
import { isGraphRAGError } from '../types/errors.js';

try {
  await operation();
} catch (error) {
  if (isGraphRAGError(error)) {
    // Structured logging with context
    this.logger.error(`${error.code}: ${error.message}`, error.toJSON());
  } else {
    // Fallback for unknown errors
    this.logger.error('Unknown error occurred:', error);
  }
}
```

### 5. Graceful Degradation

```typescript
try {
  const results = await this.queryEngine.querySparse(query, options);
  return results;
} catch (error) {
  // Log the error
  this.logger.warn('Sparse search failed, continuing without it:', error);

  // Return empty results instead of crashing
  return [];
}
```

## Best Practices

### ✅ DO

1. **Use specific error types** for different failure modes
   ```typescript
   throw new DatabaseSchemaError('embeddings', 'semantic search');
   ```

2. **Include context** for debugging
   ```typescript
   throw new LLMAPIError('openai', response.status, error);
   ```

3. **Mark errors as recoverable** when retry makes sense
   ```typescript
   throw new QueryTimeoutError(query, timeoutMs); // recoverable: true
   ```

4. **Chain errors** to preserve stack traces
   ```typescript
   catch (error) {
     throw new ModelInitializationError(modelName, error);
   }
   ```

5. **Log before rethrowing** for visibility
   ```typescript
   catch (error) {
     this.logger.error('Failed to initialize:', error);
     throw error;
   }
   ```

### ❌ DON'T

1. **Don't swallow errors silently**
   ```typescript
   // BAD
   try {
     await operation();
   } catch {}

   // GOOD
   try {
     await operation();
   } catch (error) {
     this.logger.warn('Operation failed, using fallback:', error);
     return fallbackValue;
   }
   ```

2. **Don't throw strings**
   ```typescript
   // BAD
   throw 'Database connection failed';

   // GOOD
   throw new DatabaseConnectionError(dbPath);
   ```

3. **Don't lose error context**
   ```typescript
   // BAD
   catch (error) {
     throw new Error('Operation failed');
   }

   // GOOD
   catch (error) {
     throw new DatabaseError('Operation failed', {
       cause: error instanceof Error ? error : undefined,
       context: { operation: 'insert' }
     });
   }
   ```

4. **Don't retry non-recoverable errors**
   ```typescript
   // BAD
   catch (error) {
     return retry(() => operation()); // Might retry invalid input forever
   }

   // GOOD
   catch (error) {
     if (isRecoverableError(error)) {
       return retry(() => operation());
     }
     throw error;
   }
   ```

## Migration Guide

To migrate existing code to use structured errors:

### Step 1: Replace generic throws
```typescript
// Before
throw new Error('Database query failed');

// After
throw new DatabaseQueryError(sql, error);
```

### Step 2: Add context to catch blocks
```typescript
// Before
} catch (error) {
  return false;
}

// After
} catch (error) {
  this.logger.warn('FTS5 check failed:', error);
  return false;
}
```

### Step 3: Use type guards
```typescript
// Before
} catch (error) {
  if (error.message.includes('timeout')) {
    // retry
  }
}

// After
} catch (error) {
  if (error instanceof QueryTimeoutError) {
    // retry
  }
}
```

## Testing Error Handling

```typescript
import { describe, it, expect } from 'vitest';
import { DatabaseConnectionError, isRecoverableError } from '../types/errors.js';

describe('Error Handling', () => {
  it('should create structured database errors', () => {
    const error = new DatabaseConnectionError('/path/to/db.sqlite');

    expect(error.code).toBe('DB_CONNECTION_FAILED');
    expect(error.message).toContain('/path/to/db.sqlite');
    expect(error.recoverable).toBe(true);
  });

  it('should identify recoverable errors', () => {
    const error = new DatabaseConnectionError('/path/to/db.sqlite');
    expect(isRecoverableError(error)).toBe(true);
  });
});
```

## Future Improvements

- [ ] Add error telemetry/tracking integration
- [ ] Implement circuit breaker pattern for external APIs
- [ ] Add error budget monitoring
- [ ] Create error dashboard/analytics
- [ ] Add error context propagation across async boundaries

## Related Documentation

- [TypeScript Strict Mode Issues](./TYPESCRIPT-STRICT-MODE.md)
- [Testing Guide](./TESTING.md)
- [API Documentation](./API.md)
