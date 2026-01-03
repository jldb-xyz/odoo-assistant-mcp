import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getClientOptions, loadConfig } from "./connection/config.js";
import { OdooClient } from "./connection/odoo-client.js";
// Resources
import {
  handleModelResource,
  handleModelsResource,
  handleRecordResource,
  handleSearchResource,
} from "./resources/odoo-resources.js";
// Tools
import {
  createOdooToolRegistry,
  type ToolRegistry,
  type ToolResult,
} from "./tools/index.js";
import type { IOdooClient } from "./types/index.js";

// Global client instance (mutable for runtime, but testable)
let odooClient: OdooClient | null = null;

/**
 * Reset the global client (for testing only)
 * @internal
 */
export function _resetClient(): void {
  odooClient = null;
}

/**
 * Set the global client (for testing only)
 * @internal
 */
export function _setClient(client: OdooClient | null): void {
  odooClient = client;
}

/**
 * Initialize and connect an Odoo client using environment config
 */
export async function initializeClient(): Promise<OdooClient> {
  const config = loadConfig();
  const options = getClientOptions();

  console.error("Odoo client configuration:");
  console.error(`  URL: ${config.url}`);
  console.error(`  Database: ${config.db}`);
  console.error(`  Username: ${config.username}`);
  console.error(`  Timeout: ${options.timeout}ms`);
  console.error(`  Verify SSL: ${options.verifySsl}`);

  const client = new OdooClient(config, options);
  await client.connect();

  return client;
}

/**
 * Get the global Odoo client instance.
 * Throws if not initialized via runServer().
 */
export function getClient(): OdooClient {
  if (!odooClient) {
    throw new Error("Odoo client not initialized");
  }
  return odooClient;
}

/**
 * Dependencies that can be injected into the server for testing
 */
export interface ServerDependencies {
  client: IOdooClient;
  /**
   * Tool registry for Odoo tools.
   * Defaults to the standard Odoo tool registry if not provided.
   */
  toolRegistry?: ToolRegistry;
}

/**
 * Format a ToolResult for MCP response.
 * If result.text exists, return it directly as markdown.
 * Otherwise, JSON.stringify the result.
 */
export function formatToolResult(result: ToolResult): string {
  // If the result contains a text field, return it directly (for markdown content)
  if (
    result.result &&
    typeof result.result === "object" &&
    "text" in result.result &&
    typeof (result.result as { text: unknown }).text === "string"
  ) {
    return (result.result as { text: string }).text;
  }
  // Otherwise, return the full result as JSON
  return JSON.stringify(result, null, 2);
}

/**
 * Create the MCP server with optional dependency injection.
 * When deps is provided, uses the injected client (for testing).
 * When deps is not provided, uses the global client (for production).
 */
export function createServer(deps?: ServerDependencies): McpServer {
  const server = new McpServer({
    name: "Odoo MCP Server",
    version: "1.0.0",
  });

  // Use injected client if provided, otherwise fall back to global
  const getClientFn = deps ? () => deps.client : getClient;

  // Use provided registry or create default Odoo tool registry
  const toolRegistry = deps?.toolRegistry ?? createOdooToolRegistry();

  // ===== Register All Tools from Registry =====
  for (const tool of toolRegistry.getAll()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (input) => {
        const result = await tool.handler(getClientFn(), input);
        return {
          content: [{ type: "text", text: formatToolResult(result) }],
        };
      },
    );
  }

  // ===== Register Resources =====

  // Register static resource
  server.registerResource(
    "odoo-models",
    "odoo://models",
    { description: "List all available models in the Odoo system" },
    async () => handleModelsResource(getClientFn()),
  );

  // Register dynamic resources with templates
  server.registerResource(
    "odoo-model",
    new ResourceTemplate("odoo://model/{model_name}", { list: undefined }),
    {
      description:
        "Get detailed information about a specific model including fields",
    },
    async (_uri, params) => {
      const modelName = params.model_name as string;
      return handleModelResource(getClientFn(), modelName);
    },
  );

  server.registerResource(
    "odoo-record",
    new ResourceTemplate("odoo://record/{model_name}/{record_id}", {
      list: undefined,
    }),
    { description: "Get detailed information of a specific record by ID" },
    async (_uri, params) => {
      const modelName = params.model_name as string;
      const recordId = params.record_id as string;
      return handleRecordResource(getClientFn(), modelName, recordId);
    },
  );

  server.registerResource(
    "odoo-search",
    new ResourceTemplate("odoo://search/{model_name}/{+domain}", {
      list: undefined,
    }),
    { description: "Search for records matching the domain" },
    async (_uri, params) => {
      const modelName = params.model_name as string;
      const domain = params.domain as string;
      return handleSearchResource(getClientFn(), modelName, domain);
    },
  );

  return server;
}

/**
 * Dependencies for server bootstrap (for testing)
 */
export interface BootstrapDependencies {
  /** Custom client initializer */
  initClient?: () => Promise<OdooClient>;
  /** Custom transport factory - returns any transport-like object for testing */
  createTransport?: () => unknown;
  /** Custom server factory */
  createMcpServer?: (deps?: ServerDependencies) => McpServer;
}

/**
 * Log environment variables (excluding password)
 */
export function logEnvironment(): void {
  console.error("Environment variables:");
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("ODOO_")) {
      if (key === "ODOO_PASSWORD") {
        console.error(`  ${key}: ***hidden***`);
      } else {
        console.error(`  ${key}: ${value}`);
      }
    }
  }
}

export async function runServer(deps?: BootstrapDependencies): Promise<void> {
  console.error("=== ODOO MCP SERVER STARTING ===");
  console.error(`Node.js version: ${process.version}`);

  logEnvironment();

  // Initialize Odoo client
  const initClient = deps?.initClient ?? initializeClient;
  odooClient = await initClient();

  // Create and start server
  const createMcpServer = deps?.createMcpServer ?? createServer;
  const server = createMcpServer();

  const createTransport =
    deps?.createTransport ?? (() => new StdioServerTransport());
  const transport = createTransport() as Parameters<typeof server.connect>[0];

  console.error("Starting MCP server with stdio transport...");
  await server.connect(transport);

  console.error("MCP server running");
}
