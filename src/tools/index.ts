export * from "./access.js";
export * from "./actions.js";
export * from "./bulk.js";
export * from "./docs.js";
export * from "./domain-utils.js";
export * from "./execute.js";
export * from "./introspection.js";
export * from "./registry.js";
export * from "./search.js";
export * from "./sops.js";

// Import tool definitions for the default registry
import { checkAccessTool } from "./access.js";
import { executeActionTool, listAvailableActionsTool } from "./actions.js";
import { bulkOperationTool } from "./bulk.js";
import { listDocsTool, readDocTool, saveDocTool } from "./docs.js";
import { executeMethodTool } from "./execute.js";
import {
  explainFieldTool,
  getCreateRequirementsTool,
  getModelRelationsTool,
  getModelSchemaTool,
  getRecordSampleTool,
  getSelectionValuesTool,
  listModelsTool,
  validateDomainTool,
} from "./introspection.js";
import {
  createToolRegistry,
  type ToolDefinition,
  type ToolRegistry,
} from "./registry.js";
import { findRecordByNameTool, searchRecordsTool } from "./search.js";
import { listSopsTool, readSopTool, saveSopTool } from "./sops.js";

/**
 * All built-in tool definitions (Odoo + Docs + SOPs)
 */
export const allToolDefinitions: ToolDefinition[] = [
  // Core Odoo tool
  executeMethodTool,
  // Model introspection tools
  listModelsTool,
  getModelSchemaTool,
  getModelRelationsTool,
  getCreateRequirementsTool,
  getSelectionValuesTool,
  explainFieldTool,
  getRecordSampleTool,
  validateDomainTool,
  // Search and record resolution tools
  findRecordByNameTool,
  searchRecordsTool,
  // Access control tools
  checkAccessTool,
  // Workflow action tools
  listAvailableActionsTool,
  executeActionTool,
  // Bulk operation tools
  bulkOperationTool,
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
