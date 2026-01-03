/**
 * Bulk operation tools for batch create/update/delete in Odoo
 */

import { z } from "zod";
import type { IOdooClient, OdooFieldDef } from "../types/index.js";
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
 * Get required fields for a model that don't have defaults
 */
async function getRequiredFields(
  client: IOdooClient,
  model: string,
): Promise<{
  required: string[];
  withDefaults: string[];
  error?: string;
}> {
  const fields = await client.getModelFields(model);
  if (isError(fields)) {
    return { required: [], withDefaults: [], error: fields.error };
  }

  const required: string[] = [];
  const withDefaults: string[] = [];

  for (const [fieldName, fieldDef] of Object.entries(fields)) {
    // Skip computed/related fields and special fields
    if (
      fieldDef.readonly ||
      fieldName === "id" ||
      fieldName.startsWith("_") ||
      fieldDef.type === "one2many"
    ) {
      continue;
    }

    if (fieldDef.required) {
      // Note: We can't detect defaults via XML-RPC, so all required fields are listed
      // Odoo will apply server-side defaults during create if not provided
      required.push(fieldName);
    }
  }

  return { required, withDefaults };
}

/**
 * Validate values against model fields
 */
function validateValues(
  values: Record<string, unknown>,
  fields: Record<string, OdooFieldDef>,
  requiredFields: string[],
): string[] {
  const errors: string[] = [];

  // Check required fields are present
  for (const field of requiredFields) {
    if (
      !(field in values) ||
      values[field] === null ||
      values[field] === undefined
    ) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate field types
  for (const [fieldName, value] of Object.entries(values)) {
    if (!(fieldName in fields)) {
      errors.push(`Unknown field: ${fieldName}`);
      continue;
    }

    const fieldDef = fields[fieldName];
    if (!fieldDef) {
      continue;
    }

    // Type validation
    if (value !== null && value !== undefined && value !== false) {
      switch (fieldDef.type) {
        case "integer":
          if (typeof value !== "number" || !Number.isInteger(value)) {
            errors.push(`Field ${fieldName} must be an integer`);
          }
          break;
        case "float":
        case "monetary":
          if (typeof value !== "number") {
            errors.push(`Field ${fieldName} must be a number`);
          }
          break;
        case "boolean":
          if (typeof value !== "boolean") {
            errors.push(`Field ${fieldName} must be a boolean`);
          }
          break;
        case "many2one":
          if (typeof value !== "number" || !Number.isInteger(value)) {
            errors.push(`Field ${fieldName} (many2one) must be an integer ID`);
          }
          break;
        case "many2many":
        case "one2many":
          if (!Array.isArray(value)) {
            errors.push(`Field ${fieldName} must be an array`);
          }
          break;
        case "selection":
          if (fieldDef.selection && Array.isArray(fieldDef.selection)) {
            const validValues = fieldDef.selection.map(([v]) => v);
            if (!validValues.includes(String(value))) {
              errors.push(
                `Field ${fieldName} must be one of: ${validValues.join(", ")}`,
              );
            }
          }
          break;
      }
    }
  }

  return errors;
}

// ============ Tool: bulk_operation ============

const VALID_OPERATIONS = ["create", "write", "unlink"] as const;
type BulkOperationType = (typeof VALID_OPERATIONS)[number];

export const BulkOperationInputSchema = z.object({
  model: z.string().describe('Model technical name (e.g., "res.partner")'),
  operation: z
    .enum(VALID_OPERATIONS)
    .describe('Operation type: "create", "write", or "unlink"'),
  values: z
    .array(z.record(z.unknown()))
    .optional()
    .describe("For create: array of value dictionaries to create"),
  record_ids: z
    .array(z.number())
    .optional()
    .describe("For write/unlink: record IDs to modify or delete"),
  update_values: z
    .record(z.unknown())
    .optional()
    .describe("For write: values to update on all specified records"),
  batch_size: z
    .number()
    .min(1)
    .max(1000)
    .optional()
    .describe("Records per batch (default: 100). Each batch is atomic."),
  validate_only: z
    .boolean()
    .optional()
    .describe("If true, only validate without executing (dry run)"),
});

export type BulkOperationInput = z.infer<typeof BulkOperationInputSchema>;

interface BulkOperationResult {
  model: string;
  operation: BulkOperationType;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  created_ids?: number[];
  updated_ids?: number[];
  deleted_ids?: number[];
  errors: Array<{
    index: number;
    record_id?: number;
    error: string;
    values?: Record<string, unknown>;
  }>;
  validation_only?: boolean;
  would_affect?: number;
}

export async function bulkOperation(
  client: IOdooClient,
  input: BulkOperationInput,
): Promise<{ success: boolean; result?: BulkOperationResult; error?: string }> {
  try {
    const batchSize = input.batch_size || 100;
    const validateOnly = input.validate_only ?? false;

    // Validate model exists and get fields
    const fields = await client.getModelFields(input.model);
    if (isError(fields)) {
      return { success: false, error: `Model '${input.model}' not found` };
    }

    // Validate operation-specific inputs
    switch (input.operation) {
      case "create":
        if (!input.values || input.values.length === 0) {
          return {
            success: false,
            error:
              "create operation requires 'values' array with at least one entry",
          };
        }
        break;
      case "write":
        if (!input.record_ids || input.record_ids.length === 0) {
          return {
            success: false,
            error: "write operation requires 'record_ids' array",
          };
        }
        if (
          !input.update_values ||
          Object.keys(input.update_values).length === 0
        ) {
          return {
            success: false,
            error: "write operation requires 'update_values' object",
          };
        }
        break;
      case "unlink":
        if (!input.record_ids || input.record_ids.length === 0) {
          return {
            success: false,
            error: "unlink operation requires 'record_ids' array",
          };
        }
        break;
    }

    const result: BulkOperationResult = {
      model: input.model,
      operation: input.operation,
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    // Handle CREATE operation
    if (input.operation === "create" && input.values) {
      result.total = input.values.length;

      // Get required fields
      const { required, error: reqError } = await getRequiredFields(
        client,
        input.model,
      );
      if (reqError) {
        return { success: false, error: reqError };
      }

      // Validate all values first
      const validationErrors: BulkOperationResult["errors"] = [];
      for (let i = 0; i < input.values.length; i++) {
        const currentValues = input.values[i];
        if (!currentValues) continue;
        const valueErrors = validateValues(currentValues, fields, required);
        if (valueErrors.length > 0) {
          validationErrors.push({
            index: i,
            error: valueErrors.join("; "),
            values: currentValues,
          });
        }
      }

      if (validationErrors.length > 0) {
        result.errors = validationErrors;
        result.failed = validationErrors.length;
        return {
          success: false,
          result,
          error: `Validation failed for ${validationErrors.length} record(s)`,
        };
      }

      if (validateOnly) {
        result.validation_only = true;
        result.would_affect = input.values.length;
        return { success: true, result };
      }

      // Execute create in batches
      const createdIds: number[] = [];
      for (let i = 0; i < input.values.length; i += batchSize) {
        const batch = input.values.slice(i, i + batchSize);
        try {
          // Odoo create() with array creates all records atomically
          const ids = await client.execute<number[]>(input.model, "create", [
            batch,
          ]);
          if (Array.isArray(ids)) {
            createdIds.push(...ids);
            result.succeeded += ids.length;
          }
          result.processed += batch.length;
        } catch (error) {
          // Entire batch failed (all-or-nothing)
          const errorStr = String(error);
          for (let j = 0; j < batch.length; j++) {
            const batchValues = batch[j];
            if (batchValues) {
              result.errors.push({
                index: i + j,
                error: errorStr,
                values: batchValues,
              });
            }
          }
          result.failed += batch.length;
          result.processed += batch.length;
        }
      }
      result.created_ids = createdIds;
    }

    // Handle WRITE operation
    if (
      input.operation === "write" &&
      input.record_ids &&
      input.update_values
    ) {
      result.total = input.record_ids.length;

      // Validate update values
      const valueErrors = validateValues(input.update_values, fields, []);
      if (valueErrors.length > 0) {
        result.errors.push({
          index: 0,
          error: valueErrors.join("; "),
          values: input.update_values,
        });
        return {
          success: false,
          result,
          error: `Validation failed: ${valueErrors.join("; ")}`,
        };
      }

      if (validateOnly) {
        result.validation_only = true;
        result.would_affect = input.record_ids.length;
        return { success: true, result };
      }

      // Execute write in batches
      const updatedIds: number[] = [];
      for (let i = 0; i < input.record_ids.length; i += batchSize) {
        const batchIds = input.record_ids.slice(i, i + batchSize);
        try {
          // Odoo write() updates all records atomically
          await client.execute<boolean>(input.model, "write", [
            batchIds,
            input.update_values,
          ]);
          updatedIds.push(...batchIds);
          result.succeeded += batchIds.length;
          result.processed += batchIds.length;
        } catch (error) {
          // Entire batch failed
          const errorStr = String(error);
          for (let j = 0; j < batchIds.length; j++) {
            const recordId = batchIds[j];
            if (recordId !== undefined) {
              result.errors.push({
                index: i + j,
                record_id: recordId,
                error: errorStr,
              });
            }
          }
          result.failed += batchIds.length;
          result.processed += batchIds.length;
        }
      }
      result.updated_ids = updatedIds;
    }

    // Handle UNLINK operation
    if (input.operation === "unlink" && input.record_ids) {
      result.total = input.record_ids.length;

      if (validateOnly) {
        result.validation_only = true;
        result.would_affect = input.record_ids.length;
        return { success: true, result };
      }

      // Execute unlink in batches
      const deletedIds: number[] = [];
      for (let i = 0; i < input.record_ids.length; i += batchSize) {
        const batchIds = input.record_ids.slice(i, i + batchSize);
        try {
          // Odoo unlink() deletes all records atomically
          await client.execute<boolean>(input.model, "unlink", [batchIds]);
          deletedIds.push(...batchIds);
          result.succeeded += batchIds.length;
          result.processed += batchIds.length;
        } catch (error) {
          // Entire batch failed
          const errorStr = String(error);
          for (let j = 0; j < batchIds.length; j++) {
            const recordId = batchIds[j];
            if (recordId !== undefined) {
              result.errors.push({
                index: i + j,
                record_id: recordId,
                error: errorStr,
              });
            }
          }
          result.failed += batchIds.length;
          result.processed += batchIds.length;
        }
      }
      result.deleted_ids = deletedIds;
    }

    return { success: true, result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const bulkOperationTool = defineTool({
  name: "bulk_operation",
  description:
    "Perform bulk create, update, or delete operations on Odoo records. " +
    "Each batch is atomic (all-or-nothing) - if any record in a batch fails, " +
    "the entire batch is rolled back. Includes validation and dry-run mode. " +
    "Use validate_only=true to check for errors before executing.",
  inputSchema: {
    model: z.string().describe('Model technical name (e.g., "res.partner")'),
    operation: z
      .enum(VALID_OPERATIONS)
      .describe('Operation type: "create", "write", or "unlink"'),
    values: z
      .array(z.record(z.unknown()))
      .optional()
      .describe("For create: array of value dictionaries to create"),
    record_ids: z
      .array(z.number())
      .optional()
      .describe("For write/unlink: record IDs to modify or delete"),
    update_values: z
      .record(z.unknown())
      .optional()
      .describe("For write: values to update on all specified records"),
    batch_size: z
      .number()
      .optional()
      .describe("Records per batch (default: 100). Each batch is atomic."),
    validate_only: z
      .boolean()
      .optional()
      .describe("If true, only validate without executing (dry run)"),
  },
  handler: async (client, input) => bulkOperation(client, input),
});
