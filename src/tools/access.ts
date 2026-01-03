/**
 * Access control tools for checking Odoo permissions
 */

import { z } from "zod";
import type { IOdooClient } from "../types/index.js";
import { defineTool } from "./registry.js";

// ============ Utility Functions ============

function isError(result: unknown): result is { error: string } {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as { error: string }).error === "string"
  );
}

/**
 * Parse Odoo access error message to extract useful information
 */
function parseAccessError(error: string): {
  reason: string;
  requiredGroups?: string[];
} {
  // Common patterns in Odoo access error messages
  const groupMatch = error.match(/group\(s\):\s*([^.]+)/i);
  const modelMatch = error.match(/on model '([^']+)'/i);

  let reason = error;
  const requiredGroups: string[] = [];

  if (groupMatch?.[1]) {
    const groups = groupMatch[1].split(",").map((g) => g.trim());
    requiredGroups.push(...groups);
    reason = `Access denied. Required group(s): ${groups.join(", ")}`;
  } else if (modelMatch?.[1]) {
    reason = `Access denied on model '${modelMatch[1]}'`;
  }

  if (requiredGroups.length > 0) {
    return { reason, requiredGroups };
  }
  return { reason };
}

// ============ Tool: check_access ============

const VALID_OPERATIONS = ["read", "write", "create", "unlink"] as const;

export const CheckAccessInputSchema = z.object({
  model: z.string().describe('Model technical name (e.g., "res.partner")'),
  operation: z
    .enum(VALID_OPERATIONS)
    .describe('Operation to check: "read", "write", "create", or "unlink"'),
  record_ids: z
    .array(z.number())
    .optional()
    .describe("Specific record IDs to check access for (optional)"),
  raise_exception: z
    .boolean()
    .optional()
    .describe(
      "If true, check will fail on access denied. If false (default), returns access info without failing.",
    ),
});

export type CheckAccessInput = z.infer<typeof CheckAccessInputSchema>;

export async function checkAccess(
  client: IOdooClient,
  input: CheckAccessInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const raiseException = input.raise_exception ?? false;

    // Validate model exists
    const fields = await client.getModelFields(input.model);
    if (isError(fields)) {
      return { success: false, error: `Model '${input.model}' not found` };
    }

    // Check model-level access rights
    let hasModelAccess = false;
    let modelAccessError: string | undefined;

    try {
      // Use raise_exception: false to get a boolean return value
      // With raise_exception=false, returns True if access granted, False if denied
      // (raise_exception=true would return None on success in Odoo 18, causing XML-RPC issues)
      const accessResult = await client.execute<boolean>(
        input.model,
        "check_access_rights",
        [input.operation],
        { raise_exception: false },
      );
      hasModelAccess = accessResult === true;
      if (!hasModelAccess) {
        modelAccessError = `Access denied: no ${input.operation} permission on ${input.model}`;
      }
    } catch (error) {
      modelAccessError = String(error);
      hasModelAccess = false;
    }

    // If no model access and raise_exception requested, fail now
    if (!hasModelAccess && raiseException) {
      const parsed = parseAccessError(modelAccessError || "Access denied");
      return {
        success: false,
        error: parsed.reason,
      };
    }

    // If no record IDs specified, just return model-level access
    if (!input.record_ids || input.record_ids.length === 0) {
      const result: Record<string, unknown> = {
        model: input.model,
        operation: input.operation,
        has_access: hasModelAccess,
      };

      if (!hasModelAccess && modelAccessError) {
        const parsed = parseAccessError(modelAccessError);
        result.reason = parsed.reason;
        result.required_groups = parsed.requiredGroups;
      }

      return { success: true, result };
    }

    // Check record-level access rules
    const recordAccess: Record<number, boolean> = {};
    const recordErrors: Record<number, string> = {};

    if (hasModelAccess) {
      // Only check record rules if model access is granted
      for (const recordId of input.record_ids) {
        try {
          // check_access_rule checks record-level security
          await client.execute<boolean>(
            input.model,
            "check_access_rule",
            [input.operation],
            {
              raise_exception: true,
              // We need to specify which records to check
              // This is done by calling browse first, then check_access_rule
            },
          );

          // Alternative: try to read the record to verify access
          const records = await client.readRecords(
            input.model,
            [recordId],
            ["id"],
          );
          recordAccess[recordId] = records.length > 0;
          if (!recordAccess[recordId]) {
            recordErrors[recordId] = "Record not found or access denied";
          }
        } catch (error) {
          recordAccess[recordId] = false;
          recordErrors[recordId] = String(error);
        }
      }
    } else {
      // No model access means no record access
      for (const recordId of input.record_ids) {
        recordAccess[recordId] = false;
        recordErrors[recordId] = "No model-level access";
      }
    }

    // Check if all records are accessible
    const allAccessible = Object.values(recordAccess).every((v) => v);

    if (!allAccessible && raiseException) {
      const deniedIds = Object.entries(recordAccess)
        .filter(([, v]) => !v)
        .map(([id]) => id);
      return {
        success: false,
        error: `Access denied for record(s): ${deniedIds.join(", ")}`,
      };
    }

    const result: Record<string, unknown> = {
      model: input.model,
      operation: input.operation,
      has_access: hasModelAccess && allAccessible,
      model_access: hasModelAccess,
      record_access: recordAccess,
    };

    // Add error details for denied records
    const deniedRecords = Object.entries(recordAccess)
      .filter(([, v]) => !v)
      .map(([id]) => Number(id));

    if (deniedRecords.length > 0) {
      result.denied_records = deniedRecords;
      result.errors = recordErrors;
    }

    if (!hasModelAccess && modelAccessError) {
      const parsed = parseAccessError(modelAccessError);
      result.reason = parsed.reason;
      result.required_groups = parsed.requiredGroups;
    }

    return { success: true, result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const checkAccessTool = defineTool({
  name: "check_access",
  description:
    "Check if the current user has permission to perform an operation on an Odoo model. " +
    "Checks both model-level access rights and record-level access rules. " +
    "Use this before attempting write operations to avoid cryptic access errors. " +
    "Returns detailed information about what's allowed and why access was denied.",
  inputSchema: {
    model: z.string().describe('Model technical name (e.g., "res.partner")'),
    operation: z
      .enum(VALID_OPERATIONS)
      .describe('Operation to check: "read", "write", "create", or "unlink"'),
    record_ids: z
      .array(z.number())
      .optional()
      .describe("Specific record IDs to check access for (optional)"),
    raise_exception: z
      .boolean()
      .optional()
      .describe(
        "If true, check will fail on access denied. If false (default), returns access info without failing.",
      ),
  },
  handler: async (client, input) => checkAccess(client, input),
});
