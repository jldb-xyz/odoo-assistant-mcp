import { createRequire } from "node:module";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import {
  type ServeStdioOptions,
  type StdioServerHandle,
  serveStdio,
} from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
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

/**
 * Fallback for runtimes with no module-relative filesystem, such as Cloudflare
 * Workers, where `import.meta.url` is not a file URL and `createRequire`
 * throws. Kept in step with package.json by a test — a wrong version here is
 * reported to every client as `serverInfo`.
 */
export const FALLBACK_SERVER_VERSION = "1.2.0";

/**
 * Version advertised to MCP clients. Read from package.json so it cannot drift
 * from the published version. Resolves identically from `src/` and `dist/`.
 *
 * Reading it must never be fatal: this runs at module scope, so throwing here
 * takes the whole server down rather than degrading one field.
 */
function resolveServerVersion(): string {
  try {
    return (
      createRequire(import.meta.url)("../package.json") as { version: string }
    ).version;
  } catch {
    return FALLBACK_SERVER_VERSION;
  }
}

export const SERVER_VERSION: string = resolveServerVersion();

/** Name advertised to MCP clients. */
export const SERVER_NAME = "odoo-mcp";

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
  const server = new McpServer(
    { name: SERVER_NAME, title: "Odoo MCP Server", version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} } },
  );

  // Use injected client if provided, otherwise fall back to global
  const getClientFn = deps ? () => deps.client : getClient;

  // Use provided registry or create default Odoo tool registry
  const toolRegistry = deps?.toolRegistry ?? createOdooToolRegistry();

  // ===== Register All Tools from Registry =====
  for (const tool of toolRegistry.getAll()) {
    // Tools are authored as raw Zod shapes for ergonomics; the SDK expects a
    // Standard Schema object, so wrap once here at the registration boundary.
    server.registerTool(
      tool.name,
      {
        ...(tool.title ? { title: tool.title } : {}),
        description: tool.description,
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
        inputSchema: z.object(tool.inputSchema),
      },
      async (input) => {
        const result = await tool.handler(getClientFn(), input);
        return {
          content: [{ type: "text", text: formatToolResult(result) }],
          // Surface handler failures as protocol-level tool errors, otherwise
          // the model reads a failed call as a successful one.
          ...(result.success ? {} : { isError: true }),
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
  /** Custom server factory */
  createMcpServer?: (deps?: ServerDependencies) => McpServer;
  /** Custom stdio serving entry point (for testing) */
  serve?: (
    factory: () => McpServer,
    options?: ServeStdioOptions,
  ) => StdioServerHandle;
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

export async function runServer(
  deps?: BootstrapDependencies,
): Promise<StdioServerHandle> {
  console.error("=== ODOO MCP SERVER STARTING ===");
  console.error(`Node.js version: ${process.version}`);

  logEnvironment();

  // Initialize Odoo client
  const initClient = deps?.initClient ?? initializeClient;
  odooClient = await initClient();

  // `serveStdio` owns the era decision: the opening exchange selects between
  // the 2026-07-28 revision and the 2025 `initialize` handshake, and pins one
  // instance from this factory for the life of the connection. Passing the
  // factory unbuilt is what lets it do that.
  const createMcpServer = deps?.createMcpServer ?? createServer;
  const serve = deps?.serve ?? serveStdio;

  console.error("Starting MCP server with stdio transport...");
  const handle = serve(() => createMcpServer(), {
    onerror: (error) => console.error("MCP stdio error:", error),
  });

  console.error("MCP server running");
  return handle;
}
