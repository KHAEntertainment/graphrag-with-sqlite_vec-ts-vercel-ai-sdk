/**
 * Database migrations index
 *
 * All migrations should be imported and exported here in order
 */

export * from './types.js';
export * from './runner.js';
export { migration001 } from './001_add_multi_repo_support.js';

import { migration001 } from './001_add_multi_repo_support.js';
import type { Migration } from './types.js';

/**
 * All migrations in order
 */
export const allMigrations: Migration[] = [
  migration001,
];
