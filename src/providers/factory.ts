/**
 * Provider factory for creating language model instances
 */

import type { LanguageModelV1 } from 'ai';
import { openai } from '@ai-sdk/openai';
import { LLamaCpp } from 'llamacpp-ai-provider';
import type { ProviderConfig } from './config.js';

/**
 * Create a language model instance based on provider configuration
 */
export function createLanguageModel(config: ProviderConfig): LanguageModelV1 {
  switch (config.type) {
    case 'openai': {
      const model = openai(config.model || 'gpt-4o');
      return model as unknown as LanguageModelV1;
    }

    case 'llamacpp': {
      const llamacpp = new LLamaCpp(config.modelPath);
      const model = llamacpp.completion();
      return model as unknown as LanguageModelV1;
    }

    default: {
      const exhaustive: never = config;
      throw new Error(`Unknown provider type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
