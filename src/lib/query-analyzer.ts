/**
 * Query Analyzer - LLM-based Query Classification
 *
 * Analyzes natural language queries to determine optimal search strategy weights
 * for dynamic hybrid search (dense, sparse, pattern, graph).
 *
 * Recommended Models:
 * - Query Analysis: IBM Granite 4.0 Micro (~3B) - excellent at classifying query intent
 * - Triple Extraction: SciPhi/Triplex (3.8B) - for building KG from code/docs
 * - Embeddings: IBM Granite Embedding 125M (768d) - for vectorizing entities & edges
 * - Advanced Reasoning: TIGER-Lab/StructLM-7B (optional) - for graph inference
 *
 * @see CONSTITUTION.md - Canonical model specifications
 * @see docs/SQLITE-VEC-INTEGRATION-PLAN.md#model-recommendations
 */

import { generateObject } from 'ai';
import type { LanguageModelV1 } from 'ai';
import { z } from 'zod';
import { Logger } from './logger.js';
import type {
  QueryAnalysis,
  QueryType,
  SearchWeights,
  QueryAnalysisOptions,
} from '../types/query-analysis.js';
import { WEIGHT_PROFILES, normalizeWeights, validateWeights } from '../types/query-analysis.js';
import { extractIdentifiers } from '../utils/trigram.js';

/**
 * Zod schema for structured LLM output
 */
const QueryAnalysisSchema = z.object({
  query_type: z.enum(['conceptual', 'identifier', 'relationship', 'fuzzy', 'pattern', 'mixed']),
  weights: z.object({
    dense: z.number().min(0).max(1),
    sparse: z.number().min(0).max(1),
    pattern: z.number().min(0).max(1),
    graph: z.number().min(0).max(1),
  }),
  reasoning: z.string(),
  detected_identifiers: z.array(z.string()).optional(),
  has_typos: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

/**
 * QueryAnalyzer - Determines optimal search strategies using LLM
 */
export class QueryAnalyzer {
  private logger: Logger;
  private model?: LanguageModelV1;

  constructor(model?: LanguageModelV1) {
    this.logger = new Logger();
    this.model = model;
  }

  /**
   * Set the language model
   */
  setModel(model: LanguageModelV1): void {
    this.model = model;
  }

  /**
   * Analyze a query and determine optimal search weights
   */
  async analyze(query: string, options: QueryAnalysisOptions = {}): Promise<QueryAnalysis> {
    // If type is forced, use pre-defined profile
    if (options.forceType) {
      return this.createAnalysisFromType(query, options.forceType);
    }

    // Try LLM analysis first
    if (this.model && !options.useFallback) {
      try {
        return await this.analyzeLLM(query, options);
      } catch (error) {
        this.logger.warn('LLM analysis failed, falling back to heuristics:', error);
      }
    }

    // Fallback to heuristic analysis
    return this.analyzeHeuristic(query, options);
  }

  /**
   * Analyze query using LLM
   */
  private async analyzeLLM(query: string, options: QueryAnalysisOptions): Promise<QueryAnalysis> {
    if (!this.model) {
      throw new Error('No model configured for LLM analysis');
    }

    const result = await generateObject({
      model: this.model,
      schema: QueryAnalysisSchema,
      system: this.buildSystemPrompt(),
      prompt: this.buildAnalysisPrompt(query, options),
      temperature: 0.3, // Lower temperature for consistent classification
    });

    // Validate and normalize weights (always normalize; warn if invalid)
    let weights = result.object.weights;
    if (!validateWeights(weights)) {
      this.logger.warn('LLM returned non-summing weights; normalizing');
    }
    weights = normalizeWeights(weights);

    return {
      query_type: result.object.query_type,
      weights,
      reasoning: result.object.reasoning,
      detected_identifiers: result.object.detected_identifiers,
      has_typos: result.object.has_typos,
      confidence: result.object.confidence || 0.8,
    };
  }

  /**
   * Build system prompt for LLM
   */
  private buildSystemPrompt(): string {
    return `You are a query classification expert for a code search system.

Your job is to analyze natural language queries about code repositories and determine the optimal search strategy.

Available Search Strategies:
1. **Dense (Semantic Search)**: Vector embeddings, understands concepts and synonyms
   - Best for: Conceptual questions, "how to" queries, general understanding
   - Example: "How do I stream AI responses in React?"

2. **Sparse (Keyword/BM25)**: Exact keyword matching with tf-idf weighting
   - Best for: Specific terminology, exact words matter
   - Example: "Find StreamingTextResponse class"

3. **Pattern (Fuzzy/Exact)**: Substring and fuzzy matching with typo tolerance
   - Best for: Code identifiers, handles typos, partial matches
   - Example: "StreamingTxtResp" (typo) or "sk-proj-xxxx" (pattern)

4. **Graph (Relationships)**: Entity-relationship traversal
   - Best for: Dependency questions, "what uses X", "what extends Y"
   - Example: "What components use the useChat hook?"

Query Types:
- **conceptual**: Broad questions about concepts or "how to" queries
- **identifier**: Searching for specific classes, functions, variables
- **relationship**: Questions about dependencies, usage, or connections
- **fuzzy**: Query contains typos or partial identifier matches
- **pattern**: Looking for specific patterns (API keys, regex patterns, etc.)
- **mixed**: Combination of multiple types

Weights must sum to 1.0. Be decisive - favor the most relevant strategy heavily.`;
  }

  /**
   * Build analysis prompt for specific query
   */
  private buildAnalysisPrompt(query: string, options: QueryAnalysisOptions): string {
    let prompt = `Analyze this query and determine optimal search weights:\n\n`;
    prompt += `Query: "${query}"\n\n`;

    if (options.repositories && options.repositories.length > 0) {
      prompt += `Available repositories: ${options.repositories.join(', ')}\n\n`;
    }

    prompt += `Classify the query type and assign weights (must sum to 1.0).\n\n`;
    prompt += `Consider:\n`;
    prompt += `- Does it mention specific code identifiers? (favor sparse/pattern)\n`;
    prompt += `- Is it asking "how to" or about concepts? (favor dense)\n`;
    prompt += `- Is it asking about dependencies/relationships? (favor graph)\n`;
    prompt += `- Are there typos or partial matches? (favor pattern)\n`;
    prompt += `- Does it look for patterns (API keys, etc.)? (favor pattern)\n\n`;
    prompt += `Provide your analysis.`;

    return prompt;
  }

  /**
   * Analyze query using heuristics (fallback when LLM unavailable)
   */
  private analyzeHeuristic(query: string, _options: QueryAnalysisOptions): Promise<QueryAnalysis> {
    const queryLower = query.toLowerCase();

    // Extract potential code identifiers
    const identifiers = extractIdentifiers(query);

    // Check for relationship keywords
    const relationshipKeywords = [
      'what uses',
      'what depends on',
      'what extends',
      'what implements',
      'dependencies',
      'dependents',
      'related to',
      'connected to',
    ];
    const isRelationship = relationshipKeywords.some((kw) => queryLower.includes(kw));

    // Check for conceptual keywords
    const conceptualKeywords = [
      'how do i',
      'how to',
      'how can i',
      'what is',
      'explain',
      'guide',
      'tutorial',
      'example',
      'best practice',
    ];
    const isConceptual = conceptualKeywords.some((kw) => queryLower.includes(kw));

    // Check for pattern indicators (stricter)
    const specialsCount = (query.match(/[*+?[\\\]{}()^$|\\]/g) || []).length;
    const hasPattern = specialsCount >= 2; // reduce false positives
    const hasCodePattern = /\b(?:sk|ghp|gho|pk|tok)[-_][A-Za-z0-9_-]{6,}\b/.test(query);

    // Check for potential typos (heuristic: unusual character sequences)
    const hasUnusualSequence = /[bcdfghjklmnpqrstvwxyz]{4,}/i.test(query);

    // Determine query type
    let queryType: QueryType;
    let reasoning: string;

    if (isRelationship) {
      queryType = 'relationship';
      reasoning = 'Query asks about dependencies or relationships between entities';
    } else if (hasPattern || hasCodePattern) {
      queryType = 'pattern';
      reasoning = 'Query contains pattern-like syntax or structured identifiers';
    } else if (identifiers.length > 0 && !isConceptual) {
      queryType = 'identifier';
      reasoning = `Query contains code identifiers: ${identifiers.slice(0, 3).join(', ')}`;
    } else if (hasUnusualSequence) {
      queryType = 'fuzzy';
      reasoning = 'Query may contain typos or unusual character sequences';
    } else if (isConceptual) {
      queryType = 'conceptual';
      reasoning = 'Query is asking about concepts or how to do something';
    } else {
      queryType = 'mixed';
      reasoning = 'Query appears to combine multiple search needs';
    }

    return Promise.resolve({
      query_type: queryType,
      weights: WEIGHT_PROFILES[queryType],
      reasoning,
      detected_identifiers: identifiers.length > 0 ? identifiers : undefined,
      has_typos: hasUnusualSequence,
      confidence: 0.6, // Lower confidence for heuristic analysis
    });
  }

  /**
   * Create analysis from a forced query type
   */
  private createAnalysisFromType(query: string, queryType: QueryType): QueryAnalysis {
    const identifiers = extractIdentifiers(query);

    return {
      query_type: queryType,
      weights: WEIGHT_PROFILES[queryType],
      reasoning: `Forced classification: ${queryType}`,
      detected_identifiers: identifiers.length > 0 ? identifiers : undefined,
      confidence: 1.0, // Full confidence when forced
    };
  }

  /**
   * Analyze multiple queries in batch
   */
  async analyzeBatch(
    queries: string[],
    options: QueryAnalysisOptions = {}
  ): Promise<QueryAnalysis[]> {
    // Optional: cap concurrency (requires a tiny utility or p-limit)
    const limit = (() => {
      const q: Promise<unknown>[] = [];
      const max = 5;
      return (f: () => Promise<unknown>): Promise<unknown> => {
        const p = (async (): Promise<unknown> => {
          while (q.length >= max) await Promise.race(q);
          const r = f();
          q.push(r.finally(() => q.splice(q.indexOf(r), 1)));
          return r;
        })();
        q.push(p);
        return p;
      };
    })();
    return Promise.all(queries.map((q) => limit(() => this.analyze(q, options))));
  }

  /**
   * Get weight profile for a specific query type
   */
  getWeightProfile(queryType: QueryType): SearchWeights {
    return { ...WEIGHT_PROFILES[queryType] };
  }

  /**
   * Adjust weights based on additional context
   */
  adjustWeights(baseWeights: SearchWeights, adjustments: Partial<SearchWeights>): SearchWeights {
    const adjusted = {
      dense: baseWeights.dense,
      sparse: baseWeights.sparse,
      pattern: baseWeights.pattern,
      graph: baseWeights.graph,
      ...adjustments,
    };

    return normalizeWeights(adjusted);
  }
}

/**
 * Create a query analyzer with optional model
 */
export function createQueryAnalyzer(model?: LanguageModelV1): QueryAnalyzer {
  return new QueryAnalyzer(model);
}
