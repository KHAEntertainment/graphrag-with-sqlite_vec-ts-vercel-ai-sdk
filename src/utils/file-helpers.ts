/**
 * File helper utilities
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Read document content from files in a directory
 */
export async function readDocumentsFromFiles(
  filenames: string[],
  directory: string = 'example_text'
): Promise<string[]> {
  const documents: string[] = [];

  for (const filename of filenames) {
    const filePath = join(directory, filename);
    const content = await readFile(filePath, 'utf-8');
    documents.push(content);
  }

  return documents;
}
