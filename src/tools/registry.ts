import type { ZodRawShape, z } from "zod";
import type { IOdooClient } from "../types/index.js";

/**
 * Result type returned by tool handlers
 */
export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string | null;
}

/**
 * Base definition for storage in the registry.
 * Uses a generic handler type to allow storing tools with different input schemas.
 */
export interface ToolDefinition {
  /**
   * Unique name for the tool (e.g., "execute_method", "search_employee")
   */
  name: string;

  /**
   * Human-readable description of what the tool does
   */
  description: string;

  /**
   * Zod schema shape for validating input parameters
   */
  inputSchema: ZodRawShape;

  /**
   * Handler function that executes the tool logic.
   * Input is typed as unknown since different tools have different schemas.
   */
  handler: (client: IOdooClient, input: unknown) => Promise<ToolResult>;
}

/**
 * Typed definition of a tool for use with defineTool().
 * Provides full type safety when defining individual tools.
 */
export interface TypedToolDefinition<TShape extends ZodRawShape> {
  name: string;
  description: string;
  inputSchema: TShape;
  handler: (
    client: IOdooClient,
    input: z.infer<z.ZodObject<TShape>>,
  ) => Promise<ToolResult>;
}

/**
 * Registry for managing tool definitions.
 * Enables dynamic registration and retrieval of tools.
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a new tool with the registry
   * @throws Error if a tool with the same name is already registered
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Remove a tool from the registry
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get the number of registered tools
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * Create a new tool registry
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

/**
 * Helper function to define a tool with proper typing.
 * Returns a ToolDefinition that can be stored in the registry.
 */
export function defineTool<TShape extends ZodRawShape>(
  definition: TypedToolDefinition<TShape>,
): ToolDefinition {
  // Cast the typed handler to the base type for storage
  return definition as unknown as ToolDefinition;
}
