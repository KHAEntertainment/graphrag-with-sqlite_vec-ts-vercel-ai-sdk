import { GraphDatabaseConnection } from './src/lib/graph-database.js';

const db = new GraphDatabaseConnection('./test-vec.db');
console.log('Extension loaded:', db.hasVecExtension());

// Check if embeddings table exists
const result = db.getSession().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'").get();
console.log('Embeddings table exists:', !!result);

db.close();
