import { z } from "zod";
import { listEntries, readEntry, saveEntry } from "../docs-system/index.js";
import { defineTool } from "./registry.js";

/**
 * Tool to list available SOPs
 */
export const listSopsTool = defineTool({
  name: "list_sops",
  description:
    "List available Standard Operating Procedures. SOPs are step-by-step instructions you should FOLLOW when performing specific Odoo operations. Check for relevant SOPs before complex tasks like data migrations, integrations, or multi-step workflows.",
  inputSchema: {},
  handler: async () => {
    const sops = listEntries("sops");
    const formatted = sops.map((s) => `- ${s.name} (${s.source})`).join("\n");
    return {
      success: true,
      result: {
        text: `# Available SOPs\n\n${formatted || "No SOPs found. Use save_sop to create one."}`,
      },
    };
  },
});

/**
 * Tool to read a specific SOP
 */
export const readSopTool = defineTool({
  name: "read_sop",
  description:
    "Read a specific SOP by name. SOPs contain proven procedures for Odoo operations - follow these steps when performing the described task to ensure consistency and avoid common pitfalls.",
  inputSchema: {
    name: z
      .string()
      .describe("Name of the SOP to read (without .md extension)"),
  },
  handler: async (_client, input) => {
    const sop = readEntry("sops", input.name);
    if (!sop) {
      return {
        success: false,
        error: `SOP "${input.name}" not found. Use list_sops to see available procedures.`,
      };
    }
    return {
      success: true,
      result: {
        text: `# SOP: ${input.name}\n\n_Source: ${sop.source}_\n\n${sop.content}`,
      },
    };
  },
});

/**
 * Tool to save an SOP to local project
 */
export const saveSopTool = defineTool({
  name: "save_sop",
  description:
    "Save a Standard Operating Procedure to local project (.odoo-mcp/sops/). After successfully completing a complex multi-step operation, save the procedure as an SOP so it can be followed consistently in future similar tasks.",
  inputSchema: {
    name: z.string().describe("Name for the SOP (without .md extension)"),
    content: z.string().describe("Markdown content of the procedure"),
  },
  handler: async (_client, input) => {
    const result = saveEntry("sops", input.name, input.content);
    if (result.success) {
      return {
        success: true,
        result: { text: `Saved SOP "${input.name}" to ${result.path}` },
      };
    }
    return {
      success: false,
      error: `Failed to save SOP: ${result.error}`,
    };
  },
});
