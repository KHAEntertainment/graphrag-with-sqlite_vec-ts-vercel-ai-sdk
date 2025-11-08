/**
 * Type definitions for MCP code execution
 */

/**
 * Options for sandbox execution
 */
export interface SandboxExecutionOptions {
  /** Code to execute in the sandbox */
  code: string;
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Memory limit in MB (default: 128) */
  memoryLimit?: number;
}

/**
 * Result from sandbox execution
 */
export interface SandboxExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  /** Result value (if successful) */
  result?: any;
  /** Error message (if failed) */
  error?: string;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Memory used in bytes */
  memoryUsed?: number;
}

/**
 * Options for GraphRAG API query_repositories
 */
export interface QueryRepositoriesOptions {
  /** Natural language query */
  query: string;
  /** Optional: repositories to search */
  repositories?: string[];
  /** Optional: attendant mode */
  attendant?: 'none' | 'granite-micro' | 'gemini-2.5-pro';
  /** Optional: max tokens in response */
  maxTokens?: number;
  /** Optional: include ranking explanations */
  explain?: boolean;
}

/**
 * Options for GraphRAG API query_dependency
 */
export interface QueryDependencyOptions {
  /** Dependency or entity name to search for */
  dependency: string;
  /** Optional: repositories to search */
  repositories?: string[];
  /** Optional: aspect to focus on */
  aspect?: 'usage' | 'relationships' | 'implementation' | 'all';
}

/**
 * Options for GraphRAG API get_cross_references
 */
export interface GetCrossReferencesOptions {
  /** Entity to find references for */
  entity: string;
  /** Optional: source repository where entity is defined */
  sourceRepo?: string;
  /** Optional: minimum relationship strength (0-1) */
  minStrength?: number;
}

/**
 * Options for GraphRAG API smart_query
 */
export interface SmartQueryOptions {
  /** Natural language question */
  question: string;
  /** Optional: context about what agent is trying to accomplish */
  context?: string;
  /** Optional: force specific attendant */
  forceAttendant?: 'none' | 'granite-micro' | 'gemini-2.5-pro';
  /** Optional: max tokens in response */
  maxTokens?: number;
}

/**
 * Serializable query results
 */
export interface QueryResult {
  /** Results array */
  results: any[];
  /** Query analysis */
  analysis?: {
    query_type: string;
    confidence?: number;
    reasoning?: string;
    weights: {
      dense: number;
      sparse: number;
      pattern: number;
      graph: number;
    };
  };
  /** Performance metrics */
  metrics?: {
    denseTime: number;
    sparseTime: number;
    patternTime: number;
    graphTime: number;
    fusionTime: number;
    totalTime: number;
  };
  /** Coverage statistics */
  coverage?: {
    dense: number;
    sparse: number;
    pattern: number;
    graph: number;
  };
}

/**
 * Repository metadata
 */
export interface RepositoryMetadata {
  id: string;
  name: string;
  indexed_at: string;
  version?: string;
  branch?: string;
  metadata?: string;
}

/**
 * Dependency query result
 */
export interface DependencyResult {
  entities: any[];
  relationships?: any[];
}

/**
 * Cross-reference result
 */
export interface CrossReferenceResult {
  from_repo: string;
  from_entity: string;
  to_repo: string;
  to_entity: string;
  type: string;
  strength: number;
}
