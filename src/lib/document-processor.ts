/**
 * Document processor for extracting entities and relationships using AI
 */

import { generateText } from 'ai';
import type { LanguageModelV1 } from 'ai';
import type { Logger, DocumentChunk, ElementSummary } from '../types/index.js';

export class DocumentProcessor {
  private logger: Logger;
  private model: LanguageModelV1;

  constructor(model: LanguageModelV1, logger: Logger) {
    this.model = model;
    this.logger = logger;
  }

  /**
   * Split documents into overlapping chunks for processing
   */
  splitDocuments(
    documents: string[],
    chunkSize: number = 600,
    overlapSize: number = 100
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];

    for (const document of documents) {
      for (let i = 0; i < document.length; i += chunkSize - overlapSize) {
        const chunk = document.slice(i, i + chunkSize);
        chunks.push(chunk);
      }
    }

    this.logger.debug(`Documents split into ${chunks.length} chunks`);
    return chunks;
  }

  /**
   * Extract entities and relationships from document chunks
   */
  async extractElements(chunks: DocumentChunk[]): Promise<string[]> {
    const elements: string[] = [];

    for (const [index, chunk] of chunks.entries()) {
      this.logger.debug(`Extracting elements and relationship strength from chunk ${index + 1}`);

      try {
        const { text } = await generateText({
          model: this.model,
          system: `Extract entities, relationships, and their strength from the following text. Use common terms such as 'related to', 'depends on', 'influences', etc., for relationships, and estimate a strength between 0.0 (very weak) and 1.0 (very strong). Format: Parsed relationship: Entity1 -> Relationship -> Entity2 [strength: X.X]. Do not include any other text in your response. Use this exact format: Parsed relationship: Entity1 -> Relationship -> Entity2 [strength: X.X].`,
          prompt: chunk,
          temperature: 0.7,
        });

        elements.push(text);
      } catch (error) {
        this.logger.error(`Failed to extract elements from chunk ${index + 1}:`, error);
        throw error;
      }
    }

    this.logger.debug('Elements extracted');
    return elements;
  }

  /**
   * Summarize extracted elements into structured format
   */
  async summarizeElements(elements: string[]): Promise<ElementSummary[]> {
    const summaries: ElementSummary[] = [];

    for (const [index, element] of elements.entries()) {
      this.logger.debug(`Summarizing element ${index + 1}`);

      try {
        const { text } = await generateText({
          model: this.model,
          system: `Summarize the following entities and relationships in a structured format. Use common terms such as 'related to', 'depends on', 'influences', etc., for relationships. Use '->' to represent relationships after the 'Relationships:' word.`,
          prompt: element,
          temperature: 0.7,
        });

        summaries.push(text);
      } catch (error) {
        this.logger.error(`Failed to summarize element ${index + 1}:`, error);
        throw error;
      }
    }

    this.logger.debug('Summaries created');
    return summaries;
  }
}
