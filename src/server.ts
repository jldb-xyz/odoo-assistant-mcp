import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getClientOptions, loadConfig } from "./connection/config.js";
import { OdooClient } from "./connection/odoo-client.js";
// Docs & SOPs system
import { listEntries, readEntry, saveEntry } from "./docs-system/index.js";
// Resources
import {
  handleModelResource,
  handleModelsResource,
  handleRecordResource,
  handleSearchResource,
} from "./resources/odoo-resources.js";
// Tools
import { createOdooToolRegistry, type ToolRegistry } from "./tools/index.js";
import type { IOdooClient } from "./types/index.js";

// Global client instance
let odooClient: OdooClient | null = null;

async function initializeClient(): Promise<OdooClient> {
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

function getClient(): OdooClient {
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

  // ===== Register Odoo Tools from Registry =====
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
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );
  }

  // ===== Documentation Tools =====

  server.tool(
    "list_docs",
    "List available Odoo documentation (bundled + global + local)",
    {},
    async () => {
      const docs = listEntries("docs");
      const formatted = docs.map((d) => `- ${d.name} (${d.source})`).join("\n");
      return {
        content: [
          {
            type: "text",
            text: `# Available Documentation\n\n${formatted || "No docs found."}`,
          },
        ],
      };
    },
  );

  server.tool(
    "read_doc",
    "Read a specific documentation file by name",
    {
      name: z
        .string()
        .describe("Name of the doc to read (without .md extension)"),
    },
    async ({ name }) => {
      const doc = readEntry("docs", name);
      if (!doc) {
        return {
          content: [
            {
              type: "text",
              text: `Doc "${name}" not found. Use list_docs to see available documentation.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `# ${name}\n\n_Source: ${doc.source}_\n\n${doc.content}`,
          },
        ],
      };
    },
  );

  server.tool(
    "save_doc",
    "Save documentation to the local project (.odoo-mcp/docs/)",
    {
      name: z.string().describe("Name for the doc (without .md extension)"),
      content: z.string().describe("Markdown content of the documentation"),
    },
    async ({ name, content }) => {
      const result = saveEntry("docs", name, content);
      if (result.success) {
        return {
          content: [
            { type: "text", text: `Saved doc "${name}" to ${result.path}` },
          ],
        };
      }
      return {
        content: [
          { type: "text", text: `Failed to save doc: ${result.error}` },
        ],
      };
    },
  );

  // ===== SOP Tools =====

  server.tool(
    "list_sops",
    "List available Standard Operating Procedures (global + local)",
    {},
    async () => {
      const sops = listEntries("sops");
      const formatted = sops.map((s) => `- ${s.name} (${s.source})`).join("\n");
      return {
        content: [
          {
            type: "text",
            text: `# Available SOPs\n\n${formatted || "No SOPs found. Use save_sop to create one."}`,
          },
        ],
      };
    },
  );

  server.tool(
    "read_sop",
    "Read a specific SOP by name",
    {
      name: z
        .string()
        .describe("Name of the SOP to read (without .md extension)"),
    },
    async ({ name }) => {
      const sop = readEntry("sops", name);
      if (!sop) {
        return {
          content: [
            {
              type: "text",
              text: `SOP "${name}" not found. Use list_sops to see available procedures.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `# SOP: ${name}\n\n_Source: ${sop.source}_\n\n${sop.content}`,
          },
        ],
      };
    },
  );

  server.tool(
    "save_sop",
    "Save a Standard Operating Procedure to local project (.odoo-mcp/sops/)",
    {
      name: z.string().describe("Name for the SOP (without .md extension)"),
      content: z.string().describe("Markdown content of the procedure"),
    },
    async ({ name, content }) => {
      const result = saveEntry("sops", name, content);
      if (result.success) {
        return {
          content: [
            { type: "text", text: `Saved SOP "${name}" to ${result.path}` },
          ],
        };
      }
      return {
        content: [
          { type: "text", text: `Failed to save SOP: ${result.error}` },
        ],
      };
    },
  );

  // ===== Register Resources =====

  // Register static resource
  server.resource(
    "odoo-models",
    "odoo://models",
    { description: "List all available models in the Odoo system" },
    async () => handleModelsResource(getClientFn()),
  );

  // Register dynamic resources with templates
  server.resource(
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

  server.resource(
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

  server.resource(
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

export async function runServer(): Promise<void> {
  console.error("=== ODOO MCP SERVER STARTING ===");
  console.error(`Node.js version: ${process.version}`);

  // Log Odoo-related environment variables
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

  // Initialize Odoo client
  odooClient = await initializeClient();

  // Create and start server
  const server = createServer();
  const transport = new StdioServerTransport();

  console.error("Starting MCP server with stdio transport...");
  await server.connect(transport);

  console.error("MCP server running");
}
