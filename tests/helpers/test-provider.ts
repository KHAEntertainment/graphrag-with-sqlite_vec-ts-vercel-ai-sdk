/**
 * Test Provider Helper
 *
 * Provides real LLM instances for integration testing using lightweight,
 * fast models from OpenRouter or existing provider configurations.
 *
 * Philosophy: Real integration tests > Mocks
 * - Tests actual LLM behavior
 * - Validates prompt engineering
 * - Catches real-world issues
 *
 * Cost: $0 (using free tier models)
 * Speed: ~1-2 seconds per request
 */

import { openai } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';

/**
 * Get the best available API key for testing
 */
function getTestAPIKey(): { key: string; baseURL?: string } | null {
  // Priority 1: OpenRouter (free tier available)
  if (process.env.OPENROUTER_API_KEY) {
    return {
      key: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1'
    };
  }

  // Priority 2: OpenAI (if available)
  if (process.env.OPENAI_API_KEY) {
    return {
      key: process.env.OPENAI_API_KEY
    };
  }

  // Priority 3: Gemini (via OpenAI adapter)
  if (process.env.GEMINI_API_KEY) {
    return {
      key: process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
    };
  }

  return null;
}

/**
 * Create a real LLM for testing
 *
 * Uses lightweight, fast models optimized for testing:
 * - OpenRouter: qwen/qwen-2.5-7b-instruct:free (FREE, fast)
 * - OpenAI: gpt-4o-mini (cheap, fast)
 * - Gemini: gemini-2.0-flash-exp (free, fast)
 *
 * @throws {Error} If no API key is available
 * @returns LanguageModelV1 instance ready for use
 */
export function createTestLLM(): LanguageModelV1 {
  const config = getTestAPIKey();

  if (!config) {
    throw new Error(
      'No API key found for testing. Please set one of:\n' +
      '  - OPENROUTER_API_KEY (recommended - free tier at https://openrouter.ai/keys)\n' +
      '  - OPENAI_API_KEY\n' +
      '  - GEMINI_API_KEY'
    );
  }

  // Select best model for the provider
  let modelId: string;
  if (config.baseURL?.includes('openrouter')) {
    // OpenRouter: Use free Qwen model (fast, quality, FREE)
    modelId = 'qwen/qwen-2.5-7b-instruct:free';
  } else if (config.baseURL?.includes('generativelanguage')) {
    // Gemini: Use Flash 2.0 (fast, free)
    modelId = 'gemini-2.0-flash-exp';
  } else {
    // OpenAI: Use mini model (cheap, fast)
    modelId = 'gpt-4o-mini';
  }

  return openai(modelId, {
    baseURL: config.baseURL,
    apiKey: config.key
  });
}

/**
 * Check if real LLM testing is available
 *
 * Use this in test setup to conditionally skip tests that require LLM.
 *
 * @returns true if API key is configured
 */
export function hasTestLLM(): boolean {
  return getTestAPIKey() !== null;
}

/**
 * Get a descriptive message about the test LLM configuration
 *
 * Useful for test output and debugging.
 *
 * @returns Human-readable string describing the test LLM
 */
export function getTestLLMInfo(): string {
  const config = getTestAPIKey();

  if (!config) {
    return 'No test LLM configured';
  }

  if (config.baseURL?.includes('openrouter')) {
    return 'OpenRouter (qwen-2.5-7b-instruct:free)';
  } else if (config.baseURL?.includes('generativelanguage')) {
    return 'Gemini (gemini-2.0-flash-exp)';
  } else {
    return 'OpenAI (gpt-4o-mini)';
  }
}
