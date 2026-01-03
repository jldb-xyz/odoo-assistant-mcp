import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { OdooClient } from "./connection/odoo-client.js";
import { loadConfig, getClientOptions } from "./connection/config.js";

// Tools
import {
  ExecuteMethodInputSchema,
  executeMethod,
} from "./tools/execute.js";
import {
  SearchEmployeeInputSchema,
  searchEmployee,
} from "./tools/employee.js";
import {
  SearchHolidaysInputSchema,
  searchHolidays,
} from "./tools/holidays.js";

// Resources
import {
  handleModelsResource,
  handleModelResource,
  handleRecordResource,
  handleSearchResource,
} from "./resources/odoo-resources.js";

// Docs & SOPs system
import {
  listEntries,
  readEntry,
  saveEntry,
  deleteEntry,
} from "./docs-system/index.js";

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

export function createServer(): McpServer {
  const server = new McpServer({
    name: "Odoo MCP Server",
    version: "1.0.0",
  });

  // Register tools
  server.tool(
    "execute_method",
    "Execute a custom method on an Odoo model",
    {
      model: ExecuteMethodInputSchema.shape.model,
      method: ExecuteMethodInputSchema.shape.method,
      args: z.array(z.unknown()).optional().describe("Positional arguments"),
      kwargs: z.record(z.unknown()).optional().describe("Keyword arguments"),
    },
    async (input) => {
      const result = await executeMethod(getClient(), {
        model: input.model,
        method: input.method,
        args: input.args ?? [],
        kwargs: input.kwargs ?? {},
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "search_employee",
    "Search for employees by name",
    {
      name: SearchEmployeeInputSchema.shape.name,
      limit: z.number().optional().describe("Maximum number of results to return (default: 20)"),
    },
    async (input) => {
      const result = await searchEmployee(getClient(), {
        name: input.name,
        limit: input.limit ?? 20,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "search_holidays",
    "Search for holidays within a date range",
    {
      start_date: SearchHolidaysInputSchema.shape.start_date,
      end_date: SearchHolidaysInputSchema.shape.end_date,
      employee_id: z.number().optional().describe("Optional employee ID to filter holidays"),
    },
    async (input) => {
      const result = await searchHolidays(getClient(), {
        start_date: input.start_date,
        end_date: input.end_date,
        employee_id: input.employee_id,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ===== Documentation Tools =====

  server.tool(
    "list_docs",
    "List available Odoo documentation (bundled + global + local)",
    {},
    async () => {
      const docs = listEntries("docs");
      const formatted = docs.map(d => `- ${d.name} (${d.source})`).join("\n");
      return {
        content: [{ type: "text", text: `# Available Documentation\n\n${formatted || "No docs found."}` }],
      };
    }
  );

  server.tool(
    "read_doc",
    "Read a specific documentation file by name",
    {
      name: z.string().describe("Name of the doc to read (without .md extension)"),
    },
    async ({ name }) => {
      const doc = readEntry("docs", name);
      if (!doc) {
        return {
          content: [{ type: "text", text: `Doc "${name}" not found. Use list_docs to see available documentation.` }],
        };
      }
      return {
        content: [{ type: "text", text: `# ${name}\n\n_Source: ${doc.source}_\n\n${doc.content}` }],
      };
    }
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
          content: [{ type: "text", text: `Saved doc "${name}" to ${result.path}` }],
        };
      }
      return {
        content: [{ type: "text", text: `Failed to save doc: ${result.error}` }],
      };
    }
  );

  // ===== SOP Tools =====

  server.tool(
    "list_sops",
    "List available Standard Operating Procedures (global + local)",
    {},
    async () => {
      const sops = listEntries("sops");
      const formatted = sops.map(s => `- ${s.name} (${s.source})`).join("\n");
      return {
        content: [{ type: "text", text: `# Available SOPs\n\n${formatted || "No SOPs found. Use save_sop to create one."}` }],
      };
    }
  );

  server.tool(
    "read_sop",
    "Read a specific SOP by name",
    {
      name: z.string().describe("Name of the SOP to read (without .md extension)"),
    },
    async ({ name }) => {
      const sop = readEntry("sops", name);
      if (!sop) {
        return {
          content: [{ type: "text", text: `SOP "${name}" not found. Use list_sops to see available procedures.` }],
        };
      }
      return {
        content: [{ type: "text", text: `# SOP: ${name}\n\n_Source: ${sop.source}_\n\n${sop.content}` }],
      };
    }
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
          content: [{ type: "text", text: `Saved SOP "${name}" to ${result.path}` }],
        };
      }
      return {
        content: [{ type: "text", text: `Failed to save SOP: ${result.error}` }],
      };
    }
  );

  // Register static resource
  server.resource(
    "odoo-models",
    "odoo://models",
    { description: "List all available models in the Odoo system" },
    async () => handleModelsResource(getClient())
  );

  // Register dynamic resources with templates
  server.resource(
    "odoo-model",
    new ResourceTemplate("odoo://model/{model_name}", { list: undefined }),
    { description: "Get detailed information about a specific model including fields" },
    async (uri, params) => {
      const modelName = params.model_name as string;
      return handleModelResource(getClient(), modelName);
    }
  );

  server.resource(
    "odoo-record",
    new ResourceTemplate("odoo://record/{model_name}/{record_id}", { list: undefined }),
    { description: "Get detailed information of a specific record by ID" },
    async (uri, params) => {
      const modelName = params.model_name as string;
      const recordId = params.record_id as string;
      return handleRecordResource(getClient(), modelName, recordId);
    }
  );

  server.resource(
    "odoo-search",
    new ResourceTemplate("odoo://search/{model_name}/{+domain}", { list: undefined }),
    { description: "Search for records matching the domain" },
    async (uri, params) => {
      const modelName = params.model_name as string;
      const domain = params.domain as string;
      return handleSearchResource(getClient(), modelName, domain);
    }
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
