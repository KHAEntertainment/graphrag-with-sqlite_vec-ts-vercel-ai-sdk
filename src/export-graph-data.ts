/**
 * Export graph data from SQLite to JSON for D3.js visualization
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { writeFile } from 'fs/promises';

interface GraphNode {
  id: string;
}

interface GraphLink {
  source: string;
  target: string;
  relationship: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/**
 * Export graph data from SQLite database to JSON
 */
async function exportGraphData(dbPath: string = 'data/graph_database.sqlite'): Promise<void> {
  const db = new Database(dbPath);

  try {
    // Query nodes
    const nodesStmt = db.prepare('SELECT id FROM nodes');
    const nodes = nodesStmt.all() as Array<{ id: string }>;
    const graphNodes: GraphNode[] = nodes.map((row) => ({ id: row.id }));

    // Query edges
    const edgesStmt = db.prepare('SELECT source, target, relationship, weight FROM edges');
    const edges = edgesStmt.all() as GraphLink[];

    // Structure data for D3.js
    const graphData: GraphData = {
      nodes: graphNodes,
      links: edges,
    };

    // Export to JSON
    await writeFile('public/graph_data.json', JSON.stringify(graphData, null, 2), 'utf-8');

    console.log("Graph data exported to 'public/graph_data.json'.");
  } finally {
    db.close();
  }
}

/**
 * Main function - handle command line arguments
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.error('Usage: tsx src/export-graph-data.ts <database_path>');
    console.error('Example: tsx src/export-graph-data.ts data/graph_database.sqlite');
    process.exit(1);
  }

  const dbPath = args[0];

  if (!dbPath) {
    console.error('Database path is required');
    process.exit(1);
  }

  try {
    await exportGraphData(dbPath);
  } catch (error) {
    console.error('Error exporting graph data:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
