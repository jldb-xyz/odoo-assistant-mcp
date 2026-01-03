export * from "./domain-utils.js";
export * from "./employee.js";
export * from "./execute.js";
export * from "./holidays.js";
export * from "./registry.js";

// Import tool definitions for the default registry
import { searchEmployeeTool } from "./employee.js";
import { executeMethodTool } from "./execute.js";
import { searchHolidaysTool } from "./holidays.js";
import {
  createToolRegistry,
  type ToolDefinition,
  type ToolRegistry,
} from "./registry.js";

/**
 * All built-in Odoo tool definitions
 */
export const odooToolDefinitions: ToolDefinition[] = [
  executeMethodTool,
  searchEmployeeTool,
  searchHolidaysTool,
];

/**
 * Create a tool registry pre-populated with all Odoo tools
 */
export function createOdooToolRegistry(): ToolRegistry {
  const registry = createToolRegistry();
  for (const tool of odooToolDefinitions) {
    registry.register(tool);
  }
  return registry;
}

/**
 * Pre-built default registry with all Odoo tools.
 * Use this for quick access when you don't need to customize the registry.
 */
export const defaultOdooRegistry: ToolRegistry = createOdooToolRegistry();
