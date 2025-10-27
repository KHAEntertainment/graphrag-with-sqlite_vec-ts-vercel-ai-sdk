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
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set');
      }
      const model: LanguageModelV1 = openai(config.model || 'gpt-4o');
      return model;
    }

    case 'llamacpp': {
      if (!config.modelPath) {
        throw new Error('llamacpp provider requires modelPath in config');
      }
      const llamacpp = new LLamaCpp(config.modelPath);
      const model = llamacpp.completion() as LanguageModelV1;
      return model;
    }

    default: {
      const exhaustive: never = config;
      throw new Error(`Unknown provider type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
