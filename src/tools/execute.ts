import { z } from "zod";
import type { IOdooClient } from "../types/index.js";
import { normalizeDomain, validateDomain } from "./domain-utils.js";
import { defineTool } from "./registry.js";

/**
 * Input schema for execute_method tool
 */
export const ExecuteMethodInputSchema = z.object({
  model: z.string().describe('The model name (e.g., "res.partner")'),
  method: z.string().describe("Method name to execute"),
  args: z
    .array(z.unknown())
    .optional()
    .default([])
    .describe("Positional arguments"),
  kwargs: z
    .record(z.unknown())
    .optional()
    .default({})
    .describe("Keyword arguments"),
});

export type ExecuteMethodInput = z.infer<typeof ExecuteMethodInputSchema>;

const SEARCH_METHODS = ["search", "search_count", "search_read"];

/**
 * Execute a custom method on an Odoo model
 */
export async function executeMethod(
  client: IOdooClient,
  input: ExecuteMethodInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const args = [...input.args];
    const { model, method, kwargs } = input;

    // Special handling for search methods (domain normalization)
    if (SEARCH_METHODS.includes(method) && args.length > 0) {
      let domain = args[0];

      // Unwrap double-wrapped domains [[domain]] -> [domain]
      if (
        Array.isArray(domain) &&
        domain.length === 1 &&
        Array.isArray(domain[0])
      ) {
        domain = domain[0];
      }

      // Normalize and validate domain
      const normalizedDomain = normalizeDomain(domain);
      const validatedDomain = validateDomain(normalizedDomain);

      args[0] = validatedDomain;

      console.error(
        `Executing ${method} with normalized domain: ${JSON.stringify(validatedDomain)}`,
      );
    }

    const result = await client.execute(model, method, args, kwargs ?? {});
    return { success: true, result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Tool definition for registry
 */
export const executeMethodTool = defineTool({
  name: "execute_method",
  description: "Execute a custom method on an Odoo model",
  inputSchema: {
    model: ExecuteMethodInputSchema.shape.model,
    method: ExecuteMethodInputSchema.shape.method,
    args: z.array(z.unknown()).optional().describe("Positional arguments"),
    kwargs: z.record(z.unknown()).optional().describe("Keyword arguments"),
  },
  handler: async (client, input) => {
    return executeMethod(client, {
      model: input.model,
      method: input.method,
      args: input.args ?? [],
      kwargs: input.kwargs ?? {},
    });
  },
});
