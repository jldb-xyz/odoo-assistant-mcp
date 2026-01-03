import { z } from "zod";
import { listEntries, readEntry, saveEntry } from "../docs-system/index.js";
import { defineTool } from "./registry.js";

/**
 * Tool to list available documentation
 */
export const listDocsTool = defineTool({
  name: "list_docs",
  description:
    "List available Odoo technical reference docs. These docs contain essential information for correctly calling Odoo methods via XML-RPC - consult them before complex operations. Sources: bundled (core ORM/domain syntax), global (~/.odoo-mcp/docs/), local (.odoo-mcp/docs/).",
  inputSchema: {},
  handler: async () => {
    const docs = listEntries("docs");
    const formatted = docs.map((d) => `- ${d.name} (${d.source})`).join("\n");
    return {
      success: true,
      result: {
        text: `# Available Documentation\n\n${formatted || "No docs found."}`,
      },
    };
  },
});

/**
 * Tool to read a specific documentation file
 */
export const readDocTool = defineTool({
  name: "read_doc",
  description:
    "Read a specific documentation file by name. Use this to learn correct Odoo API patterns before calling execute_method. Key docs: 'orm-methods' (CRUD/search syntax), 'orm-domains' (filter expressions), 'import-patterns' (bulk operations).",
  inputSchema: {
    name: z
      .string()
      .describe("Name of the doc to read (without .md extension)"),
  },
  handler: async (_client, input) => {
    const doc = readEntry("docs", input.name);
    if (!doc) {
      return {
        success: false,
        error: `Doc "${input.name}" not found. Use list_docs to see available documentation.`,
      };
    }
    return {
      success: true,
      result: {
        text: `# ${input.name}\n\n_Source: ${doc.source}_\n\n${doc.content}`,
      },
    };
  },
});

/**
 * Tool to save documentation to local project
 */
export const saveDocTool = defineTool({
  name: "save_doc",
  description:
    "Save documentation to the local project (.odoo-mcp/docs/). Use this to persist learned patterns about project-specific Odoo models, custom fields, or instance-specific behaviors for future reference.",
  inputSchema: {
    name: z.string().describe("Name for the doc (without .md extension)"),
    content: z.string().describe("Markdown content of the documentation"),
  },
  handler: async (_client, input) => {
    const result = saveEntry("docs", input.name, input.content);
    if (result.success) {
      return {
        success: true,
        result: { text: `Saved doc "${input.name}" to ${result.path}` },
      };
    }
    return {
      success: false,
      error: `Failed to save doc: ${result.error}`,
    };
  },
});
