export * from "./docs.js";
export * from "./domain-utils.js";
export * from "./employee.js";
export * from "./execute.js";
export * from "./holidays.js";
export * from "./registry.js";
export * from "./sops.js";

// Import tool definitions for the default registry
import { listDocsTool, readDocTool, saveDocTool } from "./docs.js";
import { searchEmployeeTool } from "./employee.js";
import { executeMethodTool } from "./execute.js";
import { searchHolidaysTool } from "./holidays.js";
import {
  createToolRegistry,
  type ToolDefinition,
  type ToolRegistry,
} from "./registry.js";
import { listSopsTool, readSopTool, saveSopTool } from "./sops.js";

/**
 * All built-in tool definitions (Odoo + Docs + SOPs)
 */
export const allToolDefinitions: ToolDefinition[] = [
  // Odoo tools
  executeMethodTool,
  searchEmployeeTool,
  searchHolidaysTool,
  // Documentation tools
  listDocsTool,
  readDocTool,
  saveDocTool,
  // SOP tools
  listSopsTool,
  readSopTool,
  saveSopTool,
];

/**
 * Create a tool registry pre-populated with all tools
 */
export function createOdooToolRegistry(): ToolRegistry {
  const registry = createToolRegistry();
  for (const tool of allToolDefinitions) {
    registry.register(tool);
  }
  return registry;
}

/**
 * Pre-built default registry with all tools.
 * Use this for quick access when you don't need to customize the registry.
 */
export const defaultOdooRegistry: ToolRegistry = createOdooToolRegistry();
