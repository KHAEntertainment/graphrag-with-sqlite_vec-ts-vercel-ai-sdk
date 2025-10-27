/**
 * Granite Micro Attendant
 *
 * Intelligent filtering of GraphRAG results using Granite 4.0 Micro (128k context).
 * Provides "surgical precision" - only returns what the coding agent needs.
 */

import { generateText } from "ai";
import type { LanguageModelV1 } from "ai";
import type { CombinedResults } from "../tools/query-engine.js";
import { Logger } from "../../lib/logger.js";

/**
 * Attendant filtering options
 */
export interface AttendantFilterOptions {
  /** The user's query */
  query: string;
  /** What the agent is trying to accomplish */
  context?: string | undefined;
  /** Combined results to filter */
  results: CombinedResults;
  /** Maximum tokens in filtered response */
  maxTokens?: number;
  /** Priority: breadth (cover more) vs depth (detail) */
  priority?: "breadth" | "depth";
}

/**
 * Filtered response from attendant
 */
export interface FilteredResponse {
  /** The filtered answer */
  answer: string;
  /** Repositories involved */
  repositories: string[];
  /** Efficiency metrics */
  efficiency: {
    originalTokens: number;
    filteredTokens: number;
    reductionPercent: number;
  };
}

/**
 * Granite Micro Attendant for result filtering
 */
export class GraniteAttendant {
  private logger: Logger;
  private model: LanguageModelV1 | null = null;

  constructor(model?: LanguageModelV1) {
    this.logger = new Logger();
    this.model = model || null;
  }

  /**
   * Set the language model
   */
  setModel(model: LanguageModelV1): void {
    this.model = model;
  }

  /**
   * Filter results through Granite Micro attendant
   */
  async filter(options: AttendantFilterOptions): Promise<FilteredResponse> {
    if (!this.model) {
      this.logger.warn(
        "No model configured for attendant, returning raw results"
      );
      return this.formatRawResults(options);
    }

    const {
      query,
      context,
      results,
      maxTokens = 500,
      priority = "breadth",
    } = options;

    const originalTokens = results.totalTokens;

    // Build attendant prompt
    const prompt = this.buildAttendantPrompt({
      query,
      context: context || undefined,
      results,
      maxTokens,
      priority,
    });

    try {
      const response = await generateText({
        model: this.model,
        prompt,
        temperature: 0.3, // Lower temperature for more focused responses
        maxTokens: maxTokens + 100, // Add buffer for formatting
      });

      const filteredText = response.text.trim();
      const filteredTokens = this.estimateTokens(filteredText);

      // Extract repositories mentioned
      const repositories = this.extractRepositories(results);

      return {
        answer: filteredText,
        repositories,
        efficiency: {
          originalTokens,
          filteredTokens,
          reductionPercent: originalTokens > 0
            ? Math.round(((originalTokens - filteredTokens) / originalTokens) * 100)
            : 0,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Error filtering results:", errorMessage);

      // Fallback to raw results if filtering fails
      return this.formatRawResults(options);
    }
  }

  /**
   * Build prompt for Granite Micro attendant
   */
  private buildAttendantPrompt(options: {
    query: string;
    context?: string | undefined;
    results: CombinedResults;
    maxTokens: number;
    priority: "breadth" | "depth";
  }): string {
    const { query, context, results, maxTokens, priority } = options;

    const semanticSection = this.formatSemanticResults(results.semantic);
    const graphSection = this.formatGraphResults(results.graph);
    const crossRefSection = this.formatCrossReferences(results.crossRefs);

    return `You are a coding assistant's research attendant. Your job is to provide ONLY the most relevant information with surgical precision.

**Agent's Query:** "${query}"
${context ? `**Agent's Goal:** ${context}` : ""}
**Context Budget:** ${maxTokens} tokens (strict limit)
**Priority:** ${priority === "breadth" ? "Cover key points briefly" : "Deep detail on most relevant"}

**Full GraphRAG Results:**

${semanticSection}

${graphSection}

${crossRefSection}

**YOUR TASK:**
Extract ONLY information directly relevant to the agent's query and goal.

**Guidelines:**
- Be surgical - remove ALL tangential information
- Prioritize actionable facts and code examples
- Include relationships ONLY if they matter for this specific query
- Format for easy consumption (bullet points, code blocks)
- Stay under ${maxTokens} tokens
- If multiple repositories are involved, show how they interact

**Output Format:**
# Summary
[One concise sentence]

# Key Information
- [Most important fact]
- [Second most important fact]
- [Third most important fact]

${priority === "breadth" ? "" : `# Details\n[Deeper explanation if needed]\n`}
${results.semantic.length > 0 ? `# Code Example\n[If relevant, include a brief code snippet]\n` : ""}
${results.crossRefs.length > 0 ? `# Cross-Repository Integration\n[How projects work together, if applicable]\n` : ""}

Remember: The agent has limited context. Every token counts. Be precise and actionable.`;
  }

  /**
   * Format semantic search results
   */
  private formatSemanticResults(results: any[]): string {
    if (results.length === 0) {
      return "**Semantic Search:** No results";
    }

    const formatted = results
      .slice(0, 10) // Top 10 results
      .map((r, i) => {
        return `${i + 1}. **${r.repo}** (similarity: ${(1 - r.distance).toFixed(2)})\n   ${r.content.slice(0, 200)}${r.content.length > 200 ? "..." : ""}`;
      })
      .join("\n\n");

    return `**Semantic Search Results (${results.length} total, showing top 10):**\n\n${formatted}`;
  }

  /**
   * Format graph query results
   */
  private formatGraphResults(results: any[]): string {
    if (results.length === 0) {
      return "**Graph Query:** No results";
    }

    const formatted = results
      .slice(0, 10) // Top 10 results
      .map((r, i) => {
        const rawProps = typeof r.properties === "string"
          ? ((): Record<string, unknown> => { try { return JSON.parse(r.properties); } catch { return {}; } })()
          : (r.properties ?? {});
        const props = Object.entries(rawProps as Record<string, unknown>)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");

        return `${i + 1}. **${r.id}** (${r.repo})\n   Properties: ${props}${r.relationship ? `\n   Relationship: ${r.relationship} (weight: ${r.weight})` : ""}`;
      })
      .join("\n\n");

    return `**Knowledge Graph Results (${results.length} total, showing top 10):**\n\n${formatted}`;
  }

  /**
   * Format cross-repository references
   */
  private formatCrossReferences(results: any[]): string {
    if (results.length === 0) {
      return "**Cross-Repository References:** None found";
    }

    const formatted = results
      .slice(0, 5) // Top 5 refs
      .map((r, i) => {
        const s = typeof r.strength === "number" ? r.strength.toFixed(2) : "N/A";
        return `${i + 1}. **${r.from_repo}/${r.from_entity}** → **${r.to_repo}/${r.to_entity}**\n   Type: ${r.type}, Strength: ${s}`;
      })
      .join("\n\n");

    return `**Cross-Repository References (${results.length} total, showing top 5):**\n\n${formatted}`;
  }

  /**
   * Extract unique repositories from results
   */
  private extractRepositories(results: CombinedResults): string[] {
    const repos = new Set<string>();

    for (const r of results.semantic) {
      repos.add(r.repo);
    }

    for (const r of results.graph) {
      repos.add(r.repo);
    }

    for (const r of results.crossRefs) {
      repos.add(r.from_repo);
      repos.add(r.to_repo);
    }

    return Array.from(repos);
  }

  /**
   * Estimate token count
   * Simple heuristic: ~4 chars per token
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Format raw results when model is not available
   */
  private formatRawResults(
    options: AttendantFilterOptions
  ): FilteredResponse {
    const { results } = options;

    const repositories = this.extractRepositories(results);

    let answer = `# Results for: ${options.query}\n\n`;

    if (results.semantic.length > 0) {
      answer += `## Semantic Matches (${results.semantic.length})\n`;
      for (const r of results.semantic.slice(0, 5)) {
        answer += `- **${r.repo}**: ${r.content.slice(0, 150)}...\n`;
      }
      answer += "\n";
    }

    if (results.graph.length > 0) {
      answer += `## Graph Entities (${results.graph.length})\n`;
      for (const r of results.graph.slice(0, 5)) {
        answer += `- **${r.id}** (${r.repo})\n`;
      }
      answer += "\n";
    }

    if (results.crossRefs.length > 0) {
      answer += `## Cross-References (${results.crossRefs.length})\n`;
      for (const r of results.crossRefs.slice(0, 3)) {
        answer += `- ${r.from_repo}/${r.from_entity} → ${r.to_repo}/${r.to_entity} (${r.type})\n`;
      }
    }

    const filteredTokens = this.estimateTokens(answer);

    return {
      answer,
      repositories,
      efficiency: {
        originalTokens: results.totalTokens,
        filteredTokens,
        reductionPercent: results.totalTokens > 0
          ? Math.round(((results.totalTokens - filteredTokens) / results.totalTokens) * 100)
          : 0,
      },
    };
  }
}

/**
 * Gemini 2.5 Pro Attendant (for complex queries)
 * Uses Google's Gemini API for more powerful reasoning
 */
export class GeminiAttendant {
  private logger: Logger;
  // TODO: Implement Gemini API integration
  // private apiKey: string;
  // private model: string;

  constructor(config: { apiKey: string; model?: string }) {
    this.logger = new Logger();
    // Store for future implementation
    void config;
  }

  /**
   * Filter results through Gemini 2.5 Pro
   */
  async filter(options: AttendantFilterOptions): Promise<FilteredResponse> {
    // TODO: Implement Gemini API integration
    // For now, return a placeholder
    this.logger.warn(
      "Gemini 2.5 Pro attendant not yet implemented, using basic formatting"
    );

    const graniteAttendant = new GraniteAttendant();
    return graniteAttendant.filter(options);
  }

  // TODO: Implement Gemini prompt builder
  // private buildGeminiPrompt(options: {
  //   query: string;
  //   context?: string;
  //   results: CombinedResults;
  //   maxTokens: number;
  // }): string {
  //   const { query, context, results, maxTokens } = options;
  //   return `Gemini prompt for ${query}...`;
  // }
}
