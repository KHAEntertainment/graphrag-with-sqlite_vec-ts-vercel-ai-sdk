/**
 * File-based caching utility (replaces Python pickle)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import type { Logger } from '../types/index.js';

/**
 * Load data from cache or run function to generate it
 */
export async function loadOrRun<T>(
  filePath: string,
  runFunction: () => Promise<T>,
  logger: Logger
): Promise<T> {
  const directory = dirname(filePath);

  // Ensure directory exists
  if (!existsSync(directory)) {
    await mkdir(directory, { recursive: true });
    logger.info(`Created directory ${directory}`);
  }

  // Try to load from cache
  if (existsSync(filePath)) {
    logger.info(`Loading data from ${filePath}`);
    try {
      const data = await readFile(filePath, 'utf-8');
      return JSON.parse(data) as T;
    } catch (error) {
      logger.warn(`Failed to load cache from ${filePath}, regenerating:`, error);
    }
  }

  // Run function to generate data
  logger.info(`Running function to generate data for ${filePath}`);
  const data = await runFunction();

  // Save to cache
  try {
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`Saved data to ${filePath}`);
  } catch (error) {
    logger.warn(`Failed to save cache to ${filePath}:`, error);
  }

  return data;
}
