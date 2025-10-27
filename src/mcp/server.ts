/**
 * GraphRAG MCP Server - Local-First Architecture
 *
 * This MCP server provides context-efficient access to the GraphRAG system
 * by querying a local SQLite database with sqlite-vec for embeddings.
 *
 * Key features:
 * - 100% offline operation (reads from local .graphrag/database.sqlite)
 * - Multi-repository support (project-scoped indexing)
 * - Intelligent attendant filtering (Granite Micro 4.0)
 * - Optional escalation to Gemini 2.5 Pro for complex queries
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GraphDatabaseConnection } from "../lib/graph-database.js";
import { Logger } from "../lib/logger.js";
import { QueryEngine } from "./tools/query-engine.js";
import { GraniteAttendant, GeminiAttendant } from "./attendant/granite-micro.js";
import type { LanguageModelV1 } from "ai";

/**
 * GraphRAG MCP Server Configuration
 */
export interface GraphRAGMCPConfig {
  /** Path to the local SQLite database */
  dbPath?: string;
  /** Default attendant mode */
  defaultAttendant?: AttendantMode;
  /** Enable auto-escalation to more powerful models */
  autoEscalate?: boolean;
  /** Gemini API configuration (for escalation) */
  geminiConfig?: {
    apiKey: string;
    model?: string;
  };
  /** Language model for Granite Micro attendant */
  model?: LanguageModelV1;
  /** Embedding provider for semantic search */
  embeddingProvider?: { embed: (text: string) => Promise<number[]> };
}

/**
 * Attendant modes for result filtering
 */
export type AttendantMode = "none" | "granite-micro" | "gemini-2.5-pro";

/**
 * Repository metadata from local database
 */
export interface RepositoryMetadata {
  id: string;
  name: string;
  indexed_at: string;
  version?: string;
  branch?: string;
  metadata?: string;
}

/**
 * Main MCP Server class
 */
export class GraphRAGMCPServer {
  private server: Server;
  private db: GraphDatabaseConnection;
  private logger: Logger;
  private queryEngine: QueryEngine;
  private graniteAttendant: GraniteAttendant;
  private geminiAttendant?: GeminiAttendant;
  private embeddingProvider?: { embed: (text: string) => Promise<number[]> };
  private config: {
    dbPath: string;
    defaultAttendant: AttendantMode;
    autoEscalate: boolean;
    geminiConfig?: { apiKey: string; model?: string };
    model?: LanguageModelV1;
    embeddingProvider?: { embed: (text: string) => Promise<number[]> };
  };

  constructor(config: GraphRAGMCPConfig = {}) {
    this.logger = new Logger();

    // Set default configuration
    this.config = {
      dbPath: config.dbPath || ".graphrag/database.sqlite",
      defaultAttendant: config.defaultAttendant || "granite-micro",
      autoEscalate: config.autoEscalate ?? true,
    };

    // Add optional properties only if defined
    if (config.geminiConfig) {
      this.config.geminiConfig = config.geminiConfig;
    }
    if (config.model) {
      this.config.model = config.model;
    }
    if (config.embeddingProvider) {
      this.config.embeddingProvider = config.embeddingProvider;
    }

    // Connect to LOCAL database (no GitHub access)
    this.db = new GraphDatabaseConnection(this.config.dbPath);

    // Initialize query engine
    this.queryEngine = new QueryEngine(this.db.getSession());

    // Initialize attendants
    this.graniteAttendant = new GraniteAttendant(config.model);
    if (config.geminiConfig) {
      this.geminiAttendant = new GeminiAttendant(config.geminiConfig);
    }

    // Store embedding provider if provided
    if (config.embeddingProvider) {
      this.embeddingProvider = config.embeddingProvider;
    }

    this.logger.info(
      `GraphRAG MCP Server initializing in local mode (db: ${this.config.dbPath})`
    );

    // Initialize MCP server
    this.server = new Server(
      {
        name: "graphrag-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.registerHandlers();
  }

  /**
   * Register MCP protocol handlers
   */
  private registerHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "query_repositories",
            description:
              "Query across multiple indexed repositories with semantic + graph search. " +
              "Returns filtered results based on attendant mode (none, granite-micro, or gemini-2.5-pro).",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description:
                    "Natural language query or specific technical question",
                },
                repositories: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Repository IDs to search (e.g., ['vercel/ai', 'copilotkit/copilotkit']). " +
                    "If not provided, searches all indexed repositories.",
                },
                attendant: {
                  type: "string",
                  enum: ["none", "granite-micro", "gemini-2.5-pro"],
                  description:
                    "Attendant mode for filtering results. 'none' returns raw results, " +
                    "'granite-micro' uses local filtering (default), 'gemini-2.5-pro' uses API for complex reasoning.",
                },
                maxTokens: {
                  type: "number",
                  description:
                    "Maximum tokens in response (default: 500). Used by attendant to limit output size.",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "list_repositories",
            description:
              "List all repositories indexed in the local database for this project. " +
              "Shows repository ID, name, version, and when it was indexed.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "query_dependency",
            description:
              "Find information about a specific code dependency or entity. " +
              "Searches the local knowledge graph for entities and their relationships.",
            inputSchema: {
              type: "object",
              properties: {
                dependency: {
                  type: "string",
                  description:
                    "Name of the dependency, entity, or concept to find (e.g., 'StreamingTextResponse', 'useChat')",
                },
                repositories: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Optional: limit search to specific repositories",
                },
                aspect: {
                  type: "string",
                  enum: ["usage", "relationships", "implementation", "all"],
                  description:
                    "Focus on specific aspect: 'usage' (how it's used), 'relationships' (what it connects to), " +
                    "'implementation' (how it works), or 'all' (everything)",
                },
                attendant: {
                  type: "string",
                  enum: ["none", "granite-micro", "gemini-2.5-pro"],
                  description: "Attendant mode for filtering results",
                },
              },
              required: ["dependency"],
            },
          },
          {
            name: "get_cross_references",
            description:
              "Find how different projects reference each other. " +
              "Discovers cross-repository dependencies and integration points.",
            inputSchema: {
              type: "object",
              properties: {
                entity: {
                  type: "string",
                  description:
                    "Entity to find references to (e.g., 'StreamingTextResponse')",
                },
                sourceRepo: {
                  type: "string",
                  description:
                    "Repository where entity is defined (e.g., 'vercel/ai')",
                },
                minStrength: {
                  type: "number",
                  description:
                    "Minimum relationship strength (0-1, default: 0.7)",
                },
              },
              required: ["entity"],
            },
          },
          {
            name: "smart_query",
            description:
              "Ask any natural language question about indexed repositories. " +
              "Automatically selects the best attendant based on query complexity. " +
              "Use this for general questions when you're not sure which specific tool to use.",
            inputSchema: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description:
                    "Any natural language question about indexed repositories",
                },
                context: {
                  type: "string",
                  description:
                    "What you're trying to accomplish (helps attendant filter better). " +
                    "Example: 'Building a streaming chat interface with AG-UI'",
                },
                forceAttendant: {
                  type: "string",
                  enum: ["none", "granite-micro", "gemini-2.5-pro"],
                  description: "Override auto-selection of attendant",
                },
                maxTokens: {
                  type: "number",
                  description: "Maximum tokens in response (default: 500)",
                },
              },
              required: ["question"],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "list_repositories":
            return await this.handleListRepositories();

          case "query_repositories":
            return await this.handleQueryRepositories(args);

          case "query_dependency":
            return await this.handleQueryDependency(args);

          case "get_cross_references":
            return await this.handleGetCrossReferences(args);

          case "smart_query":
            return await this.handleSmartQuery(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Tool execution error (${name}):`, errorMessage);
        return {
          content: [
            {
              type: "text",
              text: `Error executing ${name}: ${errorMessage}`,
            },
          ],
        };
      }
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const repos = await this.getLocalRepositories();

      return {
        resources: repos.map((repo) => ({
          uri: `graphrag://repo/${repo.id}`,
          name: repo.name,
          description: `Indexed repository: ${repo.id} (v${repo.version || "unknown"})`,
          mimeType: "application/json",
        })),
      };
    });

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      if (!uri.startsWith("graphrag://repo/")) {
        throw new Error(`Invalid resource URI: ${uri}`);
      }

      const repoId = uri.replace("graphrag://repo/", "");
      const repo = await this.getRepositoryById(repoId);

      if (!repo) {
        throw new Error(`Repository not found: ${repoId}`);
      }

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(repo, null, 2),
          },
        ],
      };
    });
  }

  /**
   * Get all repositories from local database
   */
  private async getLocalRepositories(): Promise<RepositoryMetadata[]> {
    // Check if repositories table exists
    const tableCheck = this.db
      .getSession()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='repositories'"
      )
      .get();

    if (!tableCheck) {
      this.logger.warn("Repositories table not found - database may not be initialized");
      return [];
    }

    const repos = this.db
      .getSession()
      .prepare("SELECT * FROM repositories")
      .all() as RepositoryMetadata[];

    return repos;
  }

  /**
   * Get specific repository by ID
   */
  private async getRepositoryById(id: string): Promise<RepositoryMetadata | null> {
    const tableCheck = this.db
      .getSession()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='repositories'"
      )
      .get();

    if (!tableCheck) {
      return null;
    }

    const repo = this.db
      .getSession()
      .prepare("SELECT * FROM repositories WHERE id = ?")
      .get(id) as RepositoryMetadata | undefined;

    return repo || null;
  }

  /**
   * Handle list_repositories tool
   */
  private async handleListRepositories() {
    const repos = await this.getLocalRepositories();

    if (repos.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No repositories indexed yet. Use your CLI tool to index repositories first.",
          },
        ],
      };
    }

    const repoList = repos
      .map(
        (repo) =>
          `- **${repo.name}** (${repo.id})\n` +
          `  Version: ${repo.version || "unknown"}\n` +
          `  Indexed: ${repo.indexed_at}\n` +
          `  Branch: ${repo.branch || "unknown"}`
      )
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `# Indexed Repositories (${repos.length})\n\n${repoList}`,
        },
      ],
    };
  }

  /**
   * Handle query_repositories tool
   */
  private async handleQueryRepositories(args: any) {
    this.logger.info(`Query repositories: ${args.query}`);

    const query = args.query as string;
    const repositories = args.repositories as string[] | undefined;
    const attendantMode = (args.attendant || this.config.defaultAttendant) as AttendantMode;
    const maxTokens = (args.maxTokens || 500) as number;

    try {
      // 1. Extract entities from query
      const entities = this.queryEngine.extractEntities(query);

      // 2. Query semantic search (if embedding provider available)
      let semanticResults: any[] = [];
      if (this.embeddingProvider) {
        const queryEmbedding = await this.embeddingProvider.embed(query);
        semanticResults = await this.queryEngine.queryLocalEmbeddings(
          queryEmbedding,
          { repositories, maxResults: 20 }
        );
      }

      // 3. Query graph database
      const graphResults = await this.queryEngine.queryLocalGraph(entities, {
        repositories,
      });

      // 4. Find cross-references
      const crossRefs = await this.queryEngine.findCrossReferencesFromResults(
        semanticResults,
        graphResults
      );

      // 5. Combine results
      const combined = {
        semantic: semanticResults,
        graph: graphResults,
        crossRefs: crossRefs,
        totalTokens: this.queryEngine.estimateTokens({
          semantic: semanticResults,
          graph: graphResults,
          crossRefs: crossRefs,
          totalTokens: 0,
        }),
      };

      // 6. Filter through attendant (if not "none")
      if (attendantMode === "none") {
        // Return raw results
        return {
          content: [
            {
              type: "text",
              text: this.formatRawResults(query, combined),
            },
          ],
        };
      }

      // Select attendant
      const attendant =
        attendantMode === "gemini-2.5-pro" && this.geminiAttendant
          ? this.geminiAttendant
          : this.graniteAttendant;

      const filtered = await attendant.filter({
        query,
        context: args.context || undefined,
        results: combined,
        maxTokens,
      });

      return {
        content: [
          {
            type: "text",
            text:
              filtered.answer +
              `\n\n---\n*Repositories: ${filtered.repositories.join(", ")}*\n` +
              `*Efficiency: ${filtered.efficiency.originalTokens} → ${filtered.efficiency.filteredTokens} tokens (${filtered.efficiency.reductionPercent}% reduction)*\n` +
              `*Attendant: ${attendantMode}*`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Error in handleQueryRepositories:", errorMessage);
      return {
        content: [
          {
            type: "text",
            text: `Error querying repositories: ${errorMessage}`,
          },
        ],
      };
    }
  }

  /**
   * Handle query_dependency tool
   */
  private async handleQueryDependency(args: any) {
    this.logger.info(`Query dependency: ${args.dependency}`);

    const dependency = args.dependency as string;
    const repositories = args.repositories as string[] | undefined;
    const aspect = (args.aspect || "all") as string;
    const attendantMode = (args.attendant || this.config.defaultAttendant) as AttendantMode;

    try {
      // Search for the entity
      const entityResults = await this.queryEngine.searchEntity(dependency, {
        repositories,
      });

      // Get relationships if aspect includes them
      let relationships: any[] = [];
      if (aspect === "relationships" || aspect === "all") {
        for (const entity of entityResults.slice(0, 3)) {
          const rels = await this.queryEngine.getEntityRelationships(entity.id, {
            repositories,
          });
          relationships.push(...rels);
        }
      }

      const combined = {
        semantic: [],
        graph: [...entityResults, ...relationships],
        crossRefs: [],
        totalTokens: 0,
      };

      combined.totalTokens = this.queryEngine.estimateTokens(combined);

      if (entityResults.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No results found for dependency: "${dependency}"\n\nTry:\n- Checking the spelling\n- Using a partial name\n- Listing repositories to see what's indexed`,
            },
          ],
        };
      }

      // Filter through attendant if not "none"
      if (attendantMode === "none") {
        return {
          content: [
            {
              type: "text",
              text: this.formatRawResults(`Dependency: ${dependency}`, combined),
            },
          ],
        };
      }

      const attendant =
        attendantMode === "gemini-2.5-pro" && this.geminiAttendant
          ? this.geminiAttendant
          : this.graniteAttendant;

      const filtered = await attendant.filter({
        query: `Find information about ${dependency} (aspect: ${aspect})`,
        results: combined,
        maxTokens: 500,
      });

      return {
        content: [
          {
            type: "text",
            text:
              filtered.answer +
              `\n\n---\n*Found ${entityResults.length} entities, ${relationships.length} relationships*\n` +
              `*Attendant: ${attendantMode}*`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Error in handleQueryDependency:", errorMessage);
      return {
        content: [
          {
            type: "text",
            text: `Error querying dependency: ${errorMessage}`,
          },
        ],
      };
    }
  }

  /**
   * Handle get_cross_references tool
   */
  private async handleGetCrossReferences(args: any) {
    this.logger.info(`Get cross-references for: ${args.entity}`);

    const entity = args.entity as string;
    const sourceRepo = args.sourceRepo as string | undefined;
    const minStrength = (args.minStrength || 0.7) as number;

    try {
      // First, find the entity to determine its repo if not provided
      let entityRepo = sourceRepo;
      if (!entityRepo) {
        const entityResults = await this.queryEngine.searchEntity(entity);
        if (entityResults.length > 0 && entityResults[0]) {
          entityRepo = entityResults[0].repo;
        }
      }

      // Get all cross-references
      const allRepos = await this.getLocalRepositories();
      const crossRefs = await this.queryEngine.queryCrossReferences(
        allRepos.map((r) => r.id),
        minStrength
      );

      // Filter for this entity
      const relevantRefs = crossRefs.filter(
        (ref) =>
          ref.from_entity.includes(entity) ||
          ref.to_entity.includes(entity) ||
          (entityRepo &&
            (ref.from_repo === entityRepo || ref.to_repo === entityRepo))
      );

      if (relevantRefs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No cross-references found for "${entity}"${entityRepo ? ` in ${entityRepo}` : ""}\n\nThis could mean:\n- The entity is not referenced across repositories\n- The entity name doesn't match exactly\n- Cross-references haven't been indexed yet`,
            },
          ],
        };
      }

      const formatted = relevantRefs
        .map(
          (ref) =>
            `- **${ref.from_repo}/${ref.from_entity}** → **${ref.to_repo}/${ref.to_entity}**\n` +
            `  Type: ${ref.type}, Strength: ${ref.strength.toFixed(2)}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text:
              `# Cross-References for "${entity}"\n\n` +
              `Found ${relevantRefs.length} cross-repository reference(s):\n\n${formatted}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Error in handleGetCrossReferences:", errorMessage);
      return {
        content: [
          {
            type: "text",
            text: `Error getting cross-references: ${errorMessage}`,
          },
        ],
      };
    }
  }

  /**
   * Handle smart_query tool with auto-escalation
   */
  private async handleSmartQuery(args: any) {
    this.logger.info(`Smart query: ${args.question}`);

    const question = args.question as string;
    const context = args.context as string | undefined;
    const maxTokens = (args.maxTokens || 500) as number;

    try {
      // Determine which repositories to query (all by default)
      const allRepos = await this.getLocalRepositories();
      const repositories = allRepos.map((r) => r.id);

      // Extract entities
      const entities = this.queryEngine.extractEntities(question);

      // Query semantic search (if available)
      let semanticResults: any[] = [];
      if (this.embeddingProvider) {
        const queryEmbedding = await this.embeddingProvider.embed(question);
        semanticResults = await this.queryEngine.queryLocalEmbeddings(
          queryEmbedding,
          { repositories, maxResults: 20 }
        );
      }

      // Query graph
      const graphResults = await this.queryEngine.queryLocalGraph(entities, {
        repositories,
      });

      // Find cross-references
      const crossRefs = await this.queryEngine.findCrossReferencesFromResults(
        semanticResults,
        graphResults
      );

      const combined = {
        semantic: semanticResults,
        graph: graphResults,
        crossRefs: crossRefs,
        totalTokens: 0,
      };

      combined.totalTokens = this.queryEngine.estimateTokens(combined);

      // Auto-select attendant if not forced
      let attendantMode: AttendantMode;
      if (args.forceAttendant) {
        attendantMode = args.forceAttendant as AttendantMode;
      } else {
        // Auto-escalation logic
        attendantMode = this.selectAttendant(question, repositories, combined.totalTokens);
      }

      // Apply attendant filtering
      const attendant =
        attendantMode === "gemini-2.5-pro" && this.geminiAttendant
          ? this.geminiAttendant
          : attendantMode === "none"
            ? null
            : this.graniteAttendant;

      if (!attendant) {
        return {
          content: [
            {
              type: "text",
              text: this.formatRawResults(question, combined),
            },
          ],
        };
      }

      const filtered = await attendant.filter({
        query: question,
        context: context || undefined,
        results: combined,
        maxTokens,
      });

      return {
        content: [
          {
            type: "text",
            text:
              filtered.answer +
              `\n\n---\n*Repositories: ${filtered.repositories.join(", ")}*\n` +
              `*Efficiency: ${filtered.efficiency.originalTokens} → ${filtered.efficiency.filteredTokens} tokens (${filtered.efficiency.reductionPercent}% reduction)*\n` +
              `*Attendant: ${attendantMode}${args.forceAttendant ? " (forced)" : " (auto-selected)"}*`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Error in handleSmartQuery:", errorMessage);
      return {
        content: [
          {
            type: "text",
            text: `Error processing smart query: ${errorMessage}`,
          },
        ],
      };
    }
  }

  /**
   * Auto-select attendant based on query complexity
   */
  private selectAttendant(
    query: string,
    repositories: string[],
    resultSize: number
  ): AttendantMode {
    if (!this.config.autoEscalate) {
      return this.config.defaultAttendant;
    }

    // Escalate to Gemini if available and complex query
    if (this.geminiAttendant) {
      // Many repositories = complex
      if (repositories.length > 3) {
        this.logger.info("Auto-escalating to Gemini: many repositories");
        return "gemini-2.5-pro";
      }

      // Large result set = needs smart filtering
      if (resultSize > 5000) {
        this.logger.info("Auto-escalating to Gemini: large result set");
        return "gemini-2.5-pro";
      }

      // Complex keywords = needs reasoning
      const complexKeywords = [
        "architecture",
        "refactor",
        "design",
        "integrate",
        "how do i",
        "best way",
        "should i",
      ];
      const lowerQuery = query.toLowerCase();
      if (complexKeywords.some((kw) => lowerQuery.includes(kw))) {
        this.logger.info("Auto-escalating to Gemini: complex query");
        return "gemini-2.5-pro";
      }
    }

    // Default to granite-micro for simple queries
    return "granite-micro";
  }

  /**
   * Format raw results without attendant filtering
   */
  private formatRawResults(query: string, results: any): string {
    let output = `# Query: ${query}\n\n`;

    if (results.semantic && results.semantic.length > 0) {
      output += `## Semantic Matches (${results.semantic.length})\n\n`;
      for (const r of results.semantic.slice(0, 10)) {
        output += `### ${r.repo} (similarity: ${(1 - r.distance).toFixed(2)})\n`;
        output += `${r.content.slice(0, 300)}...\n\n`;
      }
    }

    if (results.graph && results.graph.length > 0) {
      output += `## Graph Entities (${results.graph.length})\n\n`;
      for (const r of results.graph.slice(0, 10)) {
        output += `### ${r.id} (${r.repo})\n`;
        output += `${JSON.stringify(r.properties, null, 2)}\n\n`;
      }
    }

    if (results.crossRefs && results.crossRefs.length > 0) {
      output += `## Cross-References (${results.crossRefs.length})\n\n`;
      for (const r of results.crossRefs.slice(0, 10)) {
        output += `- ${r.from_repo}/${r.from_entity} → ${r.to_repo}/${r.to_entity} (${r.type}, strength: ${r.strength.toFixed(2)})\n`;
      }
    }

    if (
      (!results.semantic || results.semantic.length === 0) &&
      (!results.graph || results.graph.length === 0) &&
      (!results.crossRefs || results.crossRefs.length === 0)
    ) {
      output += `No results found.\n\n`;
      output += `Try:\n`;
      output += `- Checking if repositories are indexed (use list_repositories)\n`;
      output += `- Using different search terms\n`;
      output += `- Indexing more repositories\n`;
    }

    return output;
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.logger.info("GraphRAG MCP Server running (local mode)");
    this.logger.info(`Database: ${this.config.dbPath}`);
    this.logger.info(`Default attendant: ${this.config.defaultAttendant}`);
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    this.db.close();
    await this.server.close();
    this.logger.info("GraphRAG MCP Server stopped");
  }
}

/**
 * Main entry point when run directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const config: GraphRAGMCPConfig = {
    dbPath: process.env.GRAPHRAG_DB_PATH || ".graphrag/database.sqlite",
    defaultAttendant:
      (process.env.GRAPHRAG_DEFAULT_ATTENDANT as AttendantMode) || "granite-micro",
    autoEscalate: process.env.GRAPHRAG_AUTO_ESCALATE !== "false",
  };

  // Only add geminiConfig if API key is provided
  if (process.env.GEMINI_API_KEY) {
    config.geminiConfig = {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || "gemini-2.5-pro",
    };
  }

  const server = new GraphRAGMCPServer(config);

  server.start().catch((error) => {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await server.close();
    process.exit(0);
  });
}
