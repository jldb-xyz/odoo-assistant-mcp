/**
 * Search tools for finding and querying Odoo records
 */

import { z } from "zod";
import type { Domain, IOdooClient, OdooFieldDef } from "../types/index.js";
import { normalizeDomain, validateDomain } from "./domain-utils.js";
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
 * Model-specific fields to include in search results for better identification
 */
const MODEL_IDENTIFYING_FIELDS: Record<string, string[]> = {
  "res.partner": ["email", "is_company", "phone", "vat"],
  "res.users": ["login", "email"],
  "product.product": ["default_code", "list_price", "barcode"],
  "product.template": ["default_code", "list_price", "type"],
  "account.move": ["ref", "state", "amount_total", "move_type"],
  "account.move.line": ["debit", "credit", "account_id"],
  "sale.order": ["state", "amount_total", "partner_id"],
  "purchase.order": ["state", "amount_total", "partner_id"],
  "stock.picking": ["state", "origin", "partner_id"],
  "hr.employee": ["work_email", "department_id", "job_id"],
  "project.project": ["partner_id", "user_id"],
  "project.task": ["project_id", "user_ids", "stage_id"],
};

/**
 * Default fields to always include in search results
 */
const DEFAULT_FIELDS = ["id", "name", "display_name"];

/**
 * Get identifying fields for a model, filtering to only existing fields
 */
function getIdentifyingFields(
  model: string,
  availableFields: Record<string, OdooFieldDef>,
): string[] {
  const modelFields = MODEL_IDENTIFYING_FIELDS[model] || [];
  const validFields = modelFields.filter((f) => f in availableFields);
  return [...DEFAULT_FIELDS, ...validFields];
}

// ============ Tool 1: find_record_by_name ============

export const FindRecordByNameInputSchema = z.object({
  model: z
    .string()
    .describe('Model technical name (e.g., "res.partner", "product.product")'),
  name: z.string().describe("Search term to find records by"),
  field: z.string().optional().describe('Field to search in (default: "name")'),
  operator: z
    .enum(["=", "ilike", "like", "=ilike", "=like"])
    .optional()
    .describe('Search operator (default: "ilike" for partial match)'),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum results to return (default: 10, max: 100)"),
});

export type FindRecordByNameInput = z.infer<typeof FindRecordByNameInputSchema>;

export async function findRecordByName(
  client: IOdooClient,
  input: FindRecordByNameInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const searchField = input.field || "name";
    const operator = input.operator || "ilike";
    const limit = input.limit || 10;

    // Validate model exists and get fields
    const fields = await client.getModelFields(input.model);
    if (isError(fields)) {
      return { success: false, error: `Model '${input.model}' not found` };
    }

    // Validate search field exists
    if (!(searchField in fields)) {
      const availableFields = Object.keys(fields)
        .filter((f) => {
          const fieldDef = fields[f];
          return fieldDef && ["char", "text"].includes(fieldDef.type);
        })
        .slice(0, 10);
      return {
        success: false,
        error:
          `Field '${searchField}' not found on model ${input.model}. ` +
          `Searchable text fields: ${availableFields.join(", ")}`,
      };
    }

    // Build search value based on operator
    let searchValue = input.name;
    if (operator === "ilike" || operator === "like") {
      // Add wildcards for partial match if not already present
      if (!searchValue.includes("%")) {
        searchValue = `%${searchValue}%`;
      }
    }

    // Build domain - cast to Domain type for searchRead
    const domain: Domain = [[searchField, operator as "ilike", searchValue]];

    // Determine fields to return
    const returnFields = getIdentifyingFields(input.model, fields);

    // Execute search
    const records = await client.searchRead(input.model, domain, {
      fields: returnFields,
      limit,
    });

    // Format results
    const matches = (records as Array<Record<string, unknown>>).map(
      (record) => {
        const result: Record<string, unknown> = {
          id: record.id,
          name: record.name,
          display_name: record.display_name,
        };
        // Add model-specific identifying fields
        for (const field of returnFields) {
          if (field !== "id" && field !== "name" && field !== "display_name") {
            if (record[field] !== undefined && record[field] !== false) {
              result[field] = record[field];
            }
          }
        }
        return result;
      },
    );

    // Check for exact match (single result)
    const firstMatch = matches[0];
    const exactMatch =
      matches.length === 1 && firstMatch
        ? { id: firstMatch.id as number, name: firstMatch.name as string }
        : undefined;

    return {
      success: true,
      result: {
        model: input.model,
        search_term: input.name,
        search_field: searchField,
        operator,
        matches,
        count: matches.length,
        exact_match: exactMatch,
        guidance:
          matches.length === 0
            ? `No records found matching '${input.name}'. Try a different search term or use operator '=' for exact match.`
            : matches.length === 1
              ? `Found exactly one match. Use id=${exactMatch?.id} for operations.`
              : `Found ${matches.length} matches. Refine your search or use a more specific term.`,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const findRecordByNameTool = defineTool({
  name: "find_record_by_name",
  description:
    "Find Odoo records by name or other text field. " +
    "Resolves human-readable names to record IDs. " +
    "Returns matching records with key identifying fields. " +
    "Use this to look up partner IDs, product IDs, etc. before create/update operations.",
  inputSchema: {
    model: z
      .string()
      .describe(
        'Model technical name (e.g., "res.partner", "product.product")',
      ),
    name: z.string().describe("Search term to find records by"),
    field: z
      .string()
      .optional()
      .describe('Field to search in (default: "name")'),
    operator: z
      .enum(["=", "ilike", "like", "=ilike", "=like"])
      .optional()
      .describe('Search operator (default: "ilike" for partial match)'),
    limit: z
      .number()
      .optional()
      .describe("Maximum results to return (default: 10, max: 100)"),
  },
  handler: async (client, input) => findRecordByName(client, input),
});

// ============ Tool 2: search_records ============

export const SearchRecordsInputSchema = z.object({
  model: z.string().describe('Model technical name (e.g., "res.partner")'),
  domain: z
    .array(z.unknown())
    .describe(
      'Odoo domain filter (e.g., [["is_company", "=", true], ["country_id.code", "=", "US"]])',
    ),
  fields: z
    .array(z.string())
    .optional()
    .describe("Fields to return (validates existence, defaults to key fields)"),
  limit: z
    .number()
    .min(1)
    .max(1000)
    .optional()
    .describe("Maximum records to return (default: 100, max: 1000)"),
  offset: z.number().min(0).optional().describe("Number of records to skip"),
  order: z
    .string()
    .optional()
    .describe('Sort order (e.g., "name asc", "create_date desc")'),
  count_only: z
    .boolean()
    .optional()
    .describe("If true, only return count without records"),
});

export type SearchRecordsInput = z.infer<typeof SearchRecordsInputSchema>;

export async function searchRecords(
  client: IOdooClient,
  input: SearchRecordsInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const limit = input.limit || 100;
    const offset = input.offset || 0;

    // Validate model exists and get fields
    const fields = await client.getModelFields(input.model);
    if (isError(fields)) {
      return { success: false, error: `Model '${input.model}' not found` };
    }

    // Validate requested fields exist
    const requestedFields =
      input.fields || getIdentifyingFields(input.model, fields);
    const invalidFields = requestedFields.filter((f) => !(f in fields));
    if (invalidFields.length > 0) {
      return {
        success: false,
        error:
          `Invalid fields: ${invalidFields.join(", ")}. ` +
          `Use get_model_schema to see available fields.`,
      };
    }

    // Ensure 'id' is always included
    if (!requestedFields.includes("id")) {
      requestedFields.unshift("id");
    }

    // Normalize and validate domain
    const normalizedDomain = normalizeDomain(input.domain);
    const validatedDomain = validateDomain(normalizedDomain);

    // Validate domain field names
    const domainErrors: string[] = [];
    for (const condition of validatedDomain) {
      if (Array.isArray(condition) && condition.length >= 1) {
        const fieldName = String(condition[0]);
        // Handle dotted field names (e.g., "partner_id.name")
        const baseField = fieldName.split(".")[0] || fieldName;
        if (!(baseField in fields)) {
          domainErrors.push(`Field '${baseField}' not found on model`);
        }
      }
    }
    if (domainErrors.length > 0) {
      return {
        success: false,
        error: `Domain validation errors: ${domainErrors.join("; ")}`,
      };
    }

    // If count_only, just return count
    if (input.count_only) {
      const count = await client.execute<number>(input.model, "search_count", [
        validatedDomain,
      ]);
      return {
        success: true,
        result: {
          model: input.model,
          count,
          domain_used: validatedDomain,
        },
      };
    }

    // Execute search
    const searchOptions: {
      fields: string[];
      limit: number;
      offset: number;
      order?: string;
    } = {
      fields: requestedFields,
      limit: limit + 1, // Fetch one extra to check if there are more
      offset,
    };
    if (input.order) {
      searchOptions.order = input.order;
    }
    const records = await client.searchRead(
      input.model,
      validatedDomain,
      searchOptions,
    );

    const recordArray = records as Array<Record<string, unknown>>;
    const hasMore = recordArray.length > limit;
    const resultRecords = hasMore ? recordArray.slice(0, limit) : recordArray;

    // Get total count for pagination info
    const totalCount = await client.execute<number>(
      input.model,
      "search_count",
      [validatedDomain],
    );

    return {
      success: true,
      result: {
        model: input.model,
        records: resultRecords,
        count: resultRecords.length,
        total_count: totalCount,
        has_more: hasMore,
        offset,
        limit,
        domain_used: validatedDomain,
        fields_returned: requestedFields,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const searchRecordsTool = defineTool({
  name: "search_records",
  description:
    "Search Odoo records with automatic field and domain validation. " +
    "Returns matching records with pagination info. " +
    "Validates that all fields and domain conditions reference valid model fields. " +
    "More user-friendly than raw execute_method with built-in error checking.",
  inputSchema: {
    model: z.string().describe('Model technical name (e.g., "res.partner")'),
    domain: z
      .array(z.unknown())
      .describe(
        'Odoo domain filter (e.g., [["is_company", "=", true], ["country_id.code", "=", "US"]])',
      ),
    fields: z
      .array(z.string())
      .optional()
      .describe(
        "Fields to return (validates existence, defaults to key fields)",
      ),
    limit: z
      .number()
      .optional()
      .describe("Maximum records to return (default: 100, max: 1000)"),
    offset: z.number().optional().describe("Number of records to skip"),
    order: z
      .string()
      .optional()
      .describe('Sort order (e.g., "name asc", "create_date desc")'),
    count_only: z
      .boolean()
      .optional()
      .describe("If true, only return count without records"),
  },
  handler: async (client, input) => searchRecords(client, input),
});
