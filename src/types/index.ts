/**
 * Core type definitions for GraphRAG TypeScript
 */

/**
 * Represents a node in the knowledge graph
 */
export interface GraphNode {
  id: string;
  properties: Record<string, unknown>;
}

/**
 * Represents an edge (relationship) in the knowledge graph
 */
export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  weight: number;
}

/**
 * Centrality score for a single entity
 */
export interface CentralityScore {
  entityName: string;
  score: number;
}

/**
 * Complete centrality measures for the graph
 */
export interface CentralityData {
  degree: CentralityScore[];
  betweenness: CentralityScore[];
  closeness: CentralityScore[];
}

/**
 * Extracted entity from document
 */
export interface Entity {
  name: string;
  type?: string;
}

/**
 * Extracted relationship between entities
 */
export interface Relationship {
  source: string;
  target: string;
  type: string;
  strength: number;
}

/**
 * Structured extraction result
 */
export interface ExtractionResult {
  entities: string[];
  relationships: Array<{
    source: string;
    target: string;
    type: string;
    strength: number;
  }>;
}

/**
 * Document chunk for processing
 */
export type DocumentChunk = string;

/**
 * Summary of entities and relationships
 */
export type ElementSummary = string;

/**
 * Result from a query
 */
export interface QueryResult {
  answer: string;
  centralityData?: CentralityData;
}

/**
 * Log levels
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
