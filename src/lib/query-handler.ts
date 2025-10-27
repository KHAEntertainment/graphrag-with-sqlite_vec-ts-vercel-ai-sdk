/**
 * Query handler for answering questions using the knowledge graph
 */

import { generateText } from 'ai';
import type { LanguageModelV1 } from 'ai';
import type { GraphManager } from './graph-manager.js';
import type { Logger } from '../types/index.js';

export class QueryHandler {
  private logger: Logger;
  private graphManager: GraphManager;
  private model: LanguageModelV1;

  constructor(graphManager: GraphManager, model: LanguageModelV1, logger: Logger) {
    this.graphManager = graphManager;
    this.model = model;
    this.logger = logger;
  }

  /**
   * Ask a question using centrality measures from the graph
   */
  async askQuestion(query: string): Promise<string> {
    const centralityData = this.graphManager.calculateCentralityMeasures();
    const centralitySummary = this.graphManager.summarizeCentralityMeasures(centralityData);

    try {
      const { text } = await generateText({
        model: this.model,
        system: 'Use the centrality measures to answer the following query.',
        prompt: `Query: ${query}\nCentrality Summary: ${centralitySummary}`,
        temperature: 0.7,
      });

      this.logger.debug(`Query answered: ${text}`);
      return text;
    } catch (error) {
      this.logger.error('Failed to answer query:', error);
      throw error;
    }
  }
}
