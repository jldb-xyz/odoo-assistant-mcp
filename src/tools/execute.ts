import { z } from "zod";
import type { OdooClient } from "../connection/odoo-client.js";
import { normalizeDomain, validateDomain } from "./domain-utils.js";

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
  client: OdooClient,
  input: ExecuteMethodInput
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    let args = [...input.args];
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
        `Executing ${method} with normalized domain: ${JSON.stringify(validatedDomain)}`
      );
    }

    const result = await client.execute(model, method, args, kwargs ?? {});
    return { success: true, result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
