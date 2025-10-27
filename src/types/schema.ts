/**
 * Zod schemas for structured output validation
 */

import { z } from 'zod';

/**
 * Schema for entity and relationship extraction
 */
export const ExtractionSchema = z.object({
  entities: z.array(z.string()).describe('List of extracted entity names'),
  relationships: z.array(
    z.object({
      source: z.string().describe('Source entity name'),
      target: z.string().describe('Target entity name'),
      type: z.string().describe('Type of relationship (e.g., "related to", "depends on")'),
      strength: z.number().min(0).max(1).describe('Relationship strength between 0.0 and 1.0'),
    })
  ).describe('List of relationships between entities'),
});

/**
 * Type inference from schema
 */
export type ExtractionResult = z.infer<typeof ExtractionSchema>;
