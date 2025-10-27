/**
 * Provider configuration types and utilities
 */

/**
 * Supported AI provider types
 */
export type ProviderType = 'openai' | 'llamacpp';

/**
 * Configuration for OpenAI provider
 */
export interface OpenAIProviderConfig {
  type: 'openai';
  apiKey: string;
  model?: string;
}

/**
 * Configuration for llama.cpp provider
 */
export interface LlamaCppProviderConfig {
  type: 'llamacpp';
  modelPath: string;
  modelName?: string;
}

/**
 * Union type for all provider configurations
 */
export type ProviderConfig = OpenAIProviderConfig | LlamaCppProviderConfig;

/**
 * Load provider configuration from environment variables
 */
export function loadProviderConfigFromEnv(): ProviderConfig {
  const providerType = (process.env.AI_PROVIDER || 'openai') as ProviderType;

  switch (providerType) {
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required for OpenAI provider');
      }
      return {
        type: 'openai',
        apiKey,
        model: process.env.OPENAI_MODEL || 'gpt-4o',
      };
    }

    case 'llamacpp': {
      const modelPath = process.env.LLAMACPP_MODEL_PATH;
      if (!modelPath) {
        throw new Error('LLAMACPP_MODEL_PATH environment variable is required for llama.cpp provider');
      }
      const config: LlamaCppProviderConfig = {
        type: 'llamacpp',
        modelPath,
      };
      if (process.env.LLAMACPP_MODEL_NAME) {
        config.modelName = process.env.LLAMACPP_MODEL_NAME;
      }
      return config;
    }

    default:
      throw new Error(`Unsupported provider type: ${providerType}`);
  }
}
