import { z } from "zod";
import type { IOdooClient, OdooFieldDef } from "../types/index.js";
import { defineTool } from "./registry.js";

// ============ Types ============

interface ErrorResult {
  error: string;
}

function isError(result: unknown): result is ErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as ErrorResult).error === "string"
  );
}

// ============ Constants ============

const RELATIONAL_TYPES = ["many2one", "one2many", "many2many"];
const KEY_FIELD_NAMES = [
  "id",
  "name",
  "display_name",
  "active",
  "state",
  "create_date",
  "write_date",
];
const TECHNICAL_MODEL_PREFIXES = ["ir.", "mail.", "bus.", "base."];

const VALID_OPERATORS = [
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "in",
  "not in",
  "like",
  "ilike",
  "=like",
  "=ilike",
  "child_of",
  "parent_of",
];

const DEFAULT_SAMPLE_FIELDS = [
  "id",
  "name",
  "display_name",
  "active",
  "state",
  "create_date",
  "write_date",
];

// ============ Utility Functions ============

function isRelationalField(fieldDef: OdooFieldDef): boolean {
  return RELATIONAL_TYPES.includes(fieldDef.type);
}

function isTechnicalModel(model: string): boolean {
  return TECHNICAL_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix));
}

function categorizeFields(fields: Record<string, OdooFieldDef>): {
  keyFields: Record<string, OdooFieldDef>;
  relations: Record<string, OdooFieldDef>;
  dataFields: Record<string, OdooFieldDef>;
} {
  const keyFields: Record<string, OdooFieldDef> = {};
  const relations: Record<string, OdooFieldDef> = {};
  const dataFields: Record<string, OdooFieldDef> = {};

  for (const [name, def] of Object.entries(fields)) {
    if (KEY_FIELD_NAMES.includes(name)) {
      keyFields[name] = def;
    } else if (isRelationalField(def)) {
      relations[name] = def;
    } else {
      dataFields[name] = def;
    }
  }

  return { keyFields, relations, dataFields };
}

function getRelationTypeDescription(type: string): string {
  switch (type) {
    case "many2one":
      return "Links to one record in target model. Returns [id, name] tuple or false.";
    case "one2many":
      return "List of records in target model that reference this record. Returns array of IDs.";
    case "many2many":
      return "Links to multiple records in target model. Returns array of IDs.";
    default:
      return "";
  }
}

function getFieldUsageGuidance(fieldDef: OdooFieldDef): string {
  const guidance: string[] = [];

  switch (fieldDef.type) {
    case "many2one":
      guidance.push(
        "Set with integer ID. Read returns [id, display_name] or false.",
      );
      guidance.push(
        `Search with: ['${fieldDef.relation ? "field_name" : "field"}', '=', record_id]`,
      );
      break;
    case "one2many":
      guidance.push("Read-only computed from related records.");
      guidance.push("Modify by updating related records directly.");
      break;
    case "many2many":
      guidance.push(
        "Set with special commands: [(6, 0, [ids])] to replace, [(4, id)] to add, [(3, id)] to remove.",
      );
      break;
    case "selection":
      guidance.push("Must be one of the defined selection values.");
      break;
    case "boolean":
      guidance.push("Set with true/false. Search with: ['field', '=', True]");
      break;
    case "date":
      guidance.push("Format: 'YYYY-MM-DD'. Example: '2024-01-15'");
      break;
    case "datetime":
      guidance.push(
        "Format: 'YYYY-MM-DD HH:MM:SS' in UTC. Example: '2024-01-15 14:30:00'",
      );
      break;
    case "float":
    case "monetary":
      guidance.push(
        "Decimal number. Monetary fields need currency_id context.",
      );
      break;
    case "integer":
      guidance.push("Whole number.");
      break;
    case "char":
      guidance.push(
        "Short text string. Search with ilike for case-insensitive partial match.",
      );
      break;
    case "text":
      guidance.push("Long text, may contain multiple lines.");
      break;
    case "html":
      guidance.push("HTML content. Sanitized on save.");
      break;
    case "binary":
      guidance.push("Base64 encoded. Often used for file attachments.");
      break;
  }

  if (fieldDef.required) {
    guidance.push("⚠️ Required field - must be provided when creating.");
  }

  if (fieldDef.readonly) {
    guidance.push("🔒 Read-only - cannot be set directly.");
  }

  return guidance.join(" ");
}

function getExampleValue(fieldDef: OdooFieldDef): unknown {
  switch (fieldDef.type) {
    case "many2one":
      return 1;
    case "one2many":
    case "many2many":
      return [1, 2, 3];
    case "selection":
      return fieldDef.selection?.[0]?.[0] ?? "value";
    case "boolean":
      return true;
    case "date":
      return "2024-01-15";
    case "datetime":
      return "2024-01-15 14:30:00";
    case "float":
    case "monetary":
      return 100.5;
    case "integer":
      return 42;
    case "char":
      return "Example text";
    case "text":
      return "Long text content...";
    case "html":
      return "<p>HTML content</p>";
    case "binary":
      return "base64_encoded_data";
    default:
      return null;
  }
}

// ============ Tool 1: list_models ============

export const ListModelsInputSchema = z.object({
  filter: z
    .string()
    .optional()
    .describe(
      'Optional search filter - matches against model name or label (e.g., "partner", "sale")',
    ),
  category: z
    .enum(["all", "core", "transient"])
    .optional()
    .default("all")
    .describe(
      'Filter by type: "all" (default), "core" (persistent), "transient" (wizards)',
    ),
  limit: z
    .number()
    .optional()
    .default(50)
    .describe("Max models to return (default: 50, max: 200)"),
});

export type ListModelsInput = z.infer<typeof ListModelsInputSchema>;

export async function listModels(
  client: IOdooClient,
  input: ListModelsInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    // Build domain
    const domain: Array<[string, string, unknown] | string> = [];

    if (input.filter) {
      domain.push("|");
      domain.push(["model", "ilike", input.filter]);
      domain.push(["name", "ilike", input.filter]);
    }

    if (input.category === "core") {
      domain.push(["transient", "=", false]);
    } else if (input.category === "transient") {
      domain.push(["transient", "=", true]);
    }

    const limit = Math.min(input.limit ?? 50, 200);

    // Fetch models with field count
    const models = await client.execute<
      Array<{
        id: number;
        model: string;
        name: string;
        transient: boolean;
        field_id: number[];
      }>
    >("ir.model", "search_read", [domain], {
      fields: ["model", "name", "transient", "field_id"],
      limit,
      order: "model",
    });

    // Get total count
    const totalCount = await client.execute<number>(
      "ir.model",
      "search_count",
      [domain],
    );

    return {
      success: true,
      result: {
        total_matched: totalCount,
        showing: models.length,
        models: models.map((m) => ({
          model: m.model,
          name: m.name,
          transient: m.transient,
          field_count: m.field_id?.length ?? 0,
        })),
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const listModelsTool = defineTool({
  name: "list_models",
  description:
    "List and filter Odoo models. Use this to discover available models before querying data. " +
    "Supports filtering by name/label and model type (core vs transient/wizard).",
  inputSchema: {
    filter: z
      .string()
      .optional()
      .describe(
        'Optional search filter - matches against model name or label (e.g., "partner", "sale")',
      ),
    category: z
      .enum(["all", "core", "transient"])
      .optional()
      .describe(
        'Filter by type: "all" (default), "core" (persistent), "transient" (wizards)',
      ),
    limit: z
      .number()
      .optional()
      .describe("Max models to return (default: 50, max: 200)"),
  },
  handler: async (client, input) =>
    listModels(client, {
      filter: input.filter,
      category: input.category ?? "all",
      limit: input.limit ?? 50,
    }),
});

// ============ Tool 2: get_model_schema ============

export const GetModelSchemaInputSchema = z.object({
  model: z.string().describe('Model technical name (e.g., "res.partner")'),
  field_types: z
    .array(z.string())
    .optional()
    .describe('Filter to specific types (e.g., ["many2one", "char"])'),
});

export type GetModelSchemaInput = z.infer<typeof GetModelSchemaInputSchema>;

export async function getModelSchema(
  client: IOdooClient,
  input: GetModelSchemaInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    // Get model info
    const modelInfo = await client.getModelInfo(input.model);
    if (isError(modelInfo)) {
      return { success: false, error: modelInfo.error };
    }

    // Get fields
    const fieldsResult = await client.getModelFields(input.model);
    if (isError(fieldsResult)) {
      return { success: false, error: fieldsResult.error };
    }

    // Filter by types if specified
    let fields = fieldsResult;
    if (input.field_types && input.field_types.length > 0) {
      fields = Object.fromEntries(
        Object.entries(fieldsResult).filter(([, def]) =>
          input.field_types?.includes(def.type),
        ),
      );
    }

    // Categorize fields
    const { keyFields, relations, dataFields } = categorizeFields(fields);

    // Format outgoing relations with more detail
    const outgoingRelations: Record<string, unknown> = {};
    for (const [name, def] of Object.entries(relations)) {
      outgoingRelations[name] = {
        type: def.type,
        string: def.string,
        relation: def.relation,
        help: def.help,
        required: def.required,
      };
    }

    return {
      success: true,
      result: {
        model: input.model,
        name: modelInfo.name,
        key_fields: keyFields,
        relations: { outgoing: outgoingRelations },
        data_fields: dataFields,
        field_count: Object.keys(fieldsResult).length,
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const getModelSchemaTool = defineTool({
  name: "get_model_schema",
  description:
    "Get detailed field schema for an Odoo model. Returns fields organized by type: " +
    "key fields (id, name, state), relations (many2one, one2many, many2many), and data fields. " +
    "Use this to understand a model's structure before reading/writing data.",
  inputSchema: {
    model: z.string().describe('Model technical name (e.g., "res.partner")'),
    field_types: z
      .array(z.string())
      .optional()
      .describe('Filter to specific types (e.g., ["many2one", "char"])'),
  },
  handler: async (client, input) =>
    getModelSchema(client, {
      model: input.model,
      field_types: input.field_types,
    }),
});

// ============ Tool 3: get_model_relations ============

export const GetModelRelationsInputSchema = z.object({
  model: z.string().describe('Model technical name (e.g., "res.partner")'),
  direction: z
    .enum(["both", "outgoing", "incoming"])
    .optional()
    .default("both")
    .describe(
      '"both" (default), "outgoing" (this model to others), "incoming" (others to this)',
    ),
  include_technical: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include technical models (ir.*, mail.*, etc.)"),
});

export type GetModelRelationsInput = z.infer<
  typeof GetModelRelationsInputSchema
>;

export async function getModelRelations(
  client: IOdooClient,
  input: GetModelRelationsInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const modelInfo = await client.getModelInfo(input.model);
    if (isError(modelInfo)) {
      return { success: false, error: modelInfo.error };
    }

    const result: {
      model: string;
      name: string;
      outgoing_relations?: Array<{
        field: string;
        target_model: string;
        type: string;
        label: string;
      }>;
      incoming_relations?: Array<{
        source_model: string;
        field: string;
        type: string;
        label: string;
      }>;
      summary: { outgoing_count: number; incoming_count: number };
    } = {
      model: input.model,
      name: modelInfo.name,
      summary: { outgoing_count: 0, incoming_count: 0 },
    };

    const direction = input.direction ?? "both";
    const includeTechnical = input.include_technical ?? false;

    // Get outgoing relations
    if (direction === "both" || direction === "outgoing") {
      const fields = await client.getModelFields(input.model);
      if (!isError(fields)) {
        const outgoing = Object.entries(fields)
          .filter(
            (
              entry,
            ): entry is [string, (typeof entry)[1] & { relation: string }] =>
              isRelationalField(entry[1]) &&
              typeof entry[1].relation === "string",
          )
          .filter(
            ([, def]) => includeTechnical || !isTechnicalModel(def.relation),
          )
          .map(([name, def]) => ({
            field: name,
            target_model: def.relation,
            type: def.type,
            label: def.string,
          }));

        result.outgoing_relations = outgoing;
        result.summary.outgoing_count = outgoing.length;
      }
    }

    // Get incoming relations
    if (direction === "both" || direction === "incoming") {
      const incomingFields = await client.execute<
        Array<{
          id: number;
          model_id: [number, string];
          name: string;
          ttype: string;
          field_description: string;
        }>
      >(
        "ir.model.fields",
        "search_read",
        [
          [
            ["relation", "=", input.model],
            ["ttype", "in", RELATIONAL_TYPES],
          ],
        ],
        { fields: ["model_id", "name", "ttype", "field_description"] },
      );

      const incoming = incomingFields
        .filter((f) => includeTechnical || !isTechnicalModel(f.model_id[1]))
        .map((f) => ({
          source_model: f.model_id[1],
          field: f.name,
          type: f.ttype,
          label: f.field_description,
        }));

      result.incoming_relations = incoming;
      result.summary.incoming_count = incoming.length;
    }

    return { success: true, result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const getModelRelationsTool = defineTool({
  name: "get_model_relations",
  description:
    "Show relationships to/from an Odoo model. Outgoing = fields on this model that reference others. " +
    "Incoming = fields on other models that reference this one. " +
    "Essential for understanding data flow and building complex queries with joins.",
  inputSchema: {
    model: z.string().describe('Model technical name (e.g., "res.partner")'),
    direction: z
      .enum(["both", "outgoing", "incoming"])
      .optional()
      .describe(
        '"both" (default), "outgoing" (this model to others), "incoming" (others to this)',
      ),
    include_technical: z
      .boolean()
      .optional()
      .describe("Include technical models (ir.*, mail.*, etc.)"),
  },
  handler: async (client, input) =>
    getModelRelations(client, {
      model: input.model,
      direction: input.direction ?? "both",
      include_technical: input.include_technical ?? false,
    }),
});

// ============ Tool 4: get_create_requirements ============

export const GetCreateRequirementsInputSchema = z.object({
  model: z.string().describe('Model technical name (e.g., "res.partner")'),
});

export type GetCreateRequirementsInput = z.infer<
  typeof GetCreateRequirementsInputSchema
>;

export async function getCreateRequirements(
  client: IOdooClient,
  input: GetCreateRequirementsInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    // Get all fields
    const fields = await client.getModelFields(input.model);
    if (isError(fields)) {
      return { success: false, error: fields.error };
    }

    // Identify required and optional fields
    const requiredFields: Record<
      string,
      { type: string; label: string; relation?: string }
    > = {};
    const optionalFields: string[] = [];

    for (const [name, def] of Object.entries(fields)) {
      // Skip computed/readonly fields
      if (def.readonly) continue;

      if (def.required) {
        requiredFields[name] = {
          type: def.type,
          label: def.string,
          ...(def.relation && { relation: def.relation }),
        };
      } else {
        optionalFields.push(name);
      }
    }

    // Get defaults for required fields
    const requiredFieldNames = Object.keys(requiredFields);
    let defaults: Record<string, unknown> = {};

    if (requiredFieldNames.length > 0) {
      try {
        defaults = await client.execute<Record<string, unknown>>(
          input.model,
          "default_get",
          [requiredFieldNames],
        );
      } catch {
        // default_get may not be available on all models
        defaults = {};
      }
    }

    // Categorize required fields
    const mustProvide: Record<string, unknown> = {};
    const hasDefault: Record<string, unknown> = {};

    for (const [name, info] of Object.entries(requiredFields)) {
      if (
        name in defaults &&
        defaults[name] !== null &&
        defaults[name] !== false
      ) {
        hasDefault[name] = {
          ...info,
          default_value: defaults[name],
        };
      } else {
        mustProvide[name] = info;
      }
    }

    // Build minimal payload example
    const minimalPayload: Record<string, unknown> = {};
    for (const name of Object.keys(mustProvide)) {
      const fieldDef = fields[name];
      if (fieldDef) {
        minimalPayload[name] = getExampleValue(fieldDef);
      }
    }

    return {
      success: true,
      result: {
        model: input.model,
        must_provide: mustProvide,
        has_defaults: hasDefault,
        minimal_payload_example: minimalPayload,
        optional_field_count: optionalFields.length,
        guidance:
          "Fields in 'must_provide' are required and have no default. " +
          "Fields in 'has_defaults' are required but Odoo provides a default value.",
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const getCreateRequirementsTool = defineTool({
  name: "get_create_requirements",
  description:
    "Show required fields for creating records on an Odoo model. " +
    "Returns fields that must be provided vs those with defaults. " +
    "Essential before calling create() to avoid validation errors.",
  inputSchema: {
    model: z.string().describe('Model technical name (e.g., "res.partner")'),
  },
  handler: async (client, input) => getCreateRequirements(client, input),
});

// ============ Tool 5: get_selection_values ============

export const GetSelectionValuesInputSchema = z.object({
  model: z.string().describe('Model technical name (e.g., "sale.order")'),
  field: z
    .string()
    .optional()
    .describe(
      "Specific field name to get values for. If omitted, returns all selection fields.",
    ),
});

export type GetSelectionValuesInput = z.infer<
  typeof GetSelectionValuesInputSchema
>;

export async function getSelectionValues(
  client: IOdooClient,
  input: GetSelectionValuesInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const fields = await client.getModelFields(input.model);
    if (isError(fields)) {
      return { success: false, error: fields.error };
    }

    // If specific field requested, return full values
    if (input.field) {
      const fieldDef = fields[input.field];
      if (!fieldDef) {
        return {
          success: false,
          error: `Field '${input.field}' not found on model ${input.model}`,
        };
      }
      if (fieldDef.type !== "selection" || !fieldDef.selection) {
        return {
          success: false,
          error: `Field '${input.field}' exists but is type '${fieldDef.type}', not selection`,
        };
      }

      return {
        success: true,
        result: {
          model: input.model,
          field: input.field,
          label: fieldDef.string,
          required: fieldDef.required ?? false,
          values: fieldDef.selection.map(([value, label]) => ({
            value,
            label,
          })),
          value_count: fieldDef.selection.length,
        },
      };
    }

    // No field specified: return summary only (names + counts, no values)
    const selectionFields: Array<{
      field: string;
      label: string;
      value_count: number;
      required: boolean;
    }> = [];

    for (const [name, def] of Object.entries(fields)) {
      if (def.type !== "selection" || !def.selection) continue;

      selectionFields.push({
        field: name,
        label: def.string,
        value_count: def.selection.length,
        required: def.required ?? false,
      });
    }

    return {
      success: true,
      result: {
        model: input.model,
        selection_fields: selectionFields,
        count: selectionFields.length,
        guidance:
          "Call again with a specific field name to get the allowed values.",
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const getSelectionValuesTool = defineTool({
  name: "get_selection_values",
  description:
    "Get valid values for selection (dropdown) fields on an Odoo model. " +
    "Returns the allowed values with their display labels. " +
    "Use this before setting selection fields to ensure valid values.",
  inputSchema: {
    model: z.string().describe('Model technical name (e.g., "sale.order")'),
    field: z
      .string()
      .optional()
      .describe(
        "Specific field name. If omitted, returns all selection fields on the model.",
      ),
  },
  handler: async (client, input) => getSelectionValues(client, input),
});

// ============ Tool 6: explain_field ============

export const ExplainFieldInputSchema = z.object({
  model: z.string().describe('Model technical name (e.g., "res.partner")'),
  field: z.string().describe('Field name (e.g., "partner_id", "state")'),
});

export type ExplainFieldInput = z.infer<typeof ExplainFieldInputSchema>;

export async function explainField(
  client: IOdooClient,
  input: ExplainFieldInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const fields = await client.getModelFields(input.model);
    if (isError(fields)) {
      return { success: false, error: fields.error };
    }

    const fieldDef = fields[input.field];
    if (!fieldDef) {
      // Suggest similar field names
      const suggestions = Object.keys(fields)
        .filter(
          (name) =>
            name.includes(input.field) ||
            input.field.includes(name) ||
            name.toLowerCase().includes(input.field.toLowerCase()),
        )
        .slice(0, 5);

      return {
        success: false,
        error: `Field '${input.field}' not found on model ${input.model}`,
        ...(suggestions.length > 0 && { suggestions }),
      };
    }

    const result: Record<string, unknown> = {
      model: input.model,
      field: input.field,
      label: fieldDef.string,
      type: fieldDef.type,
      required: fieldDef.required ?? false,
      readonly: fieldDef.readonly ?? false,
      help: fieldDef.help || null,
      usage_guidance: getFieldUsageGuidance(fieldDef),
      example_value: getExampleValue(fieldDef),
    };

    // Add relation details for relational fields
    if (isRelationalField(fieldDef) && fieldDef.relation) {
      result.relation = {
        target_model: fieldDef.relation,
        relationship_type: fieldDef.type,
        description: getRelationTypeDescription(fieldDef.type),
      };
    }

    // Add selection values for selection fields
    if (fieldDef.type === "selection" && fieldDef.selection) {
      result.selection_values = fieldDef.selection.map(([value, label]) => ({
        value,
        label,
      }));
    }

    return { success: true, result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const explainFieldTool = defineTool({
  name: "explain_field",
  description:
    "Get detailed information about a specific field on an Odoo model. " +
    "Returns type, constraints, relation details, selection values, and usage guidance. " +
    "Use this to understand how to read/write a specific field correctly.",
  inputSchema: {
    model: z.string().describe('Model technical name (e.g., "res.partner")'),
    field: z.string().describe('Field name (e.g., "partner_id", "state")'),
  },
  handler: async (client, input) => explainField(client, input),
});

// ============ Tool 7: get_record_sample ============

export const GetRecordSampleInputSchema = z.object({
  model: z.string().describe('Model technical name (e.g., "res.partner")'),
  domain: z
    .array(z.unknown())
    .optional()
    .describe(
      'Optional domain filter (e.g., [["active", "=", true]]). Defaults to [].',
    ),
  fields: z
    .array(z.string())
    .optional()
    .describe(
      "Optional field names to include. Defaults to common fields (id, name, display_name, etc.).",
    ),
});

export type GetRecordSampleInput = z.infer<typeof GetRecordSampleInputSchema>;

export async function getRecordSample(
  client: IOdooClient,
  input: GetRecordSampleInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    // Get model fields to provide type info
    const fields = await client.getModelFields(input.model);
    if (isError(fields)) {
      return { success: false, error: fields.error };
    }

    // Determine which fields to fetch
    let requestedFields = input.fields;
    if (!requestedFields || requestedFields.length === 0) {
      // Use default fields that exist on this model
      requestedFields = DEFAULT_SAMPLE_FIELDS.filter((f) => f in fields);
    }

    // Validate requested fields exist
    const invalidFields = requestedFields.filter((f) => !(f in fields));
    if (invalidFields.length > 0) {
      return {
        success: false,
        error: `Fields not found: ${invalidFields.join(", ")}`,
      };
    }

    // Fetch one record
    const domain = (input.domain as Array<unknown>) ?? [];
    const records = await client.execute<Array<Record<string, unknown>>>(
      input.model,
      "search_read",
      [domain],
      {
        fields: requestedFields,
        limit: 1,
      },
    );

    if (!records || records.length === 0) {
      return {
        success: true,
        result: {
          model: input.model,
          record: null,
          message: "No records found matching the criteria",
          available_fields: requestedFields,
        },
      };
    }

    // Annotate record with field types
    const record = records[0];
    const annotatedFields: Record<string, { value: unknown; type: string }> =
      {};

    if (record) {
      for (const [name, value] of Object.entries(record)) {
        annotatedFields[name] = {
          value,
          type: fields[name]?.type ?? "unknown",
        };
      }
    }

    return {
      success: true,
      result: {
        model: input.model,
        record: annotatedFields,
        field_count: Object.keys(annotatedFields).length,
        guidance:
          "This is a sample record. Use get_model_schema for full field list.",
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const getRecordSampleTool = defineTool({
  name: "get_record_sample",
  description:
    "Fetch one example record from an Odoo model to see real data structure. " +
    "Returns actual field values with their types. " +
    "Useful for understanding data format before building queries.",
  inputSchema: {
    model: z.string().describe('Model technical name (e.g., "res.partner")'),
    domain: z
      .array(z.unknown())
      .optional()
      .describe(
        'Optional domain filter (e.g., [["active", "=", true]]). Defaults to [].',
      ),
    fields: z
      .array(z.string())
      .optional()
      .describe(
        "Optional field names to include. Defaults to: id, name, display_name, active, state, create_date, write_date.",
      ),
  },
  handler: async (client, input) => getRecordSample(client, input),
});

// ============ Tool 8: validate_domain ============

export const ValidateDomainInputSchema = z.object({
  model: z.string().describe('Model technical name (e.g., "res.partner")'),
  domain: z
    .array(z.unknown())
    .describe(
      'Domain to validate (e.g., [["name", "ilike", "test"], ["active", "=", true]])',
    ),
  test_execution: z
    .boolean()
    .optional()
    .describe(
      "If true, also executes search_count to verify domain works at runtime. Default: false.",
    ),
});

export type ValidateDomainInput = z.infer<typeof ValidateDomainInputSchema>;

export async function checkDomainValidity(
  client: IOdooClient,
  input: ValidateDomainInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    // Get model fields for validation
    const fields = await client.getModelFields(input.model);
    if (isError(fields)) {
      return { success: false, error: fields.error };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const validConditions: Array<{
      field: string;
      operator: string;
      value: unknown;
    }> = [];

    // Validate each condition in the domain
    for (const item of input.domain) {
      // Skip logical operators
      if (item === "&" || item === "|" || item === "!") {
        continue;
      }

      // Check if it's a valid condition tuple
      if (!Array.isArray(item) || item.length !== 3) {
        errors.push(
          `Invalid condition format: ${JSON.stringify(item)}. Expected [field, operator, value].`,
        );
        continue;
      }

      const [field, operator, value] = item as [string, string, unknown];

      // Check field exists (supporting dot notation for related fields)
      const baseFieldName = field.split(".")[0] ?? field;
      if (!(baseFieldName in fields)) {
        const suggestions = Object.keys(fields)
          .filter(
            (name) =>
              name.includes(baseFieldName) ||
              baseFieldName.includes(name.slice(0, 3)),
          )
          .slice(0, 3);
        errors.push(
          `Field '${baseFieldName}' not found on model ${input.model}.${suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : ""}`,
        );
        continue;
      }

      // Check operator is valid
      if (!VALID_OPERATORS.includes(operator)) {
        errors.push(
          `Invalid operator '${operator}' for field '${field}'. Valid operators: ${VALID_OPERATORS.join(", ")}`,
        );
        continue;
      }

      // Type-specific warnings
      const fieldDef = fields[baseFieldName];
      if (
        fieldDef &&
        fieldDef.type === "many2one" &&
        operator === "=" &&
        typeof value === "string"
      ) {
        warnings.push(
          `Field '${field}' is many2one - use integer ID instead of string '${value}'`,
        );
      }

      if (
        fieldDef &&
        fieldDef.type === "selection" &&
        fieldDef.selection &&
        (operator === "=" || operator === "!=")
      ) {
        const validValues = fieldDef.selection.map(
          ([v]: [string, string]) => v,
        );
        if (!validValues.includes(value as string)) {
          warnings.push(
            `Field '${field}' selection value '${value}' may be invalid. Valid: ${validValues.join(", ")}`,
          );
        }
      }

      validConditions.push({ field, operator, value });
    }

    // Optionally test execution
    let executionResult: {
      success: boolean;
      count?: number;
      error?: string;
    } | null = null;
    if (input.test_execution && errors.length === 0) {
      try {
        const count = await client.execute<number>(
          input.model,
          "search_count",
          [input.domain],
        );
        executionResult = { success: true, count };
      } catch (execError) {
        executionResult = { success: false, error: String(execError) };
      }
    }

    return {
      success: true,
      result: {
        model: input.model,
        valid: errors.length === 0,
        errors,
        warnings,
        validated_conditions: validConditions,
        ...(executionResult && { execution_test: executionResult }),
        guidance:
          errors.length === 0
            ? "Domain syntax is valid."
            : "Fix the errors above before using this domain.",
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const validateDomainTool = defineTool({
  name: "validate_domain",
  description:
    "Check if an Odoo domain filter is syntactically valid and fields exist. " +
    "Catches common errors like invalid field names, wrong operators, and type mismatches. " +
    "Optionally test-executes the domain to verify it works at runtime.",
  inputSchema: {
    model: z.string().describe('Model technical name (e.g., "res.partner")'),
    domain: z
      .array(z.unknown())
      .describe(
        'Domain to validate (e.g., [["name", "ilike", "test"], ["active", "=", true]])',
      ),
    test_execution: z
      .boolean()
      .optional()
      .describe(
        "If true, also executes search_count to verify domain works. Default: false.",
      ),
  },
  handler: async (client, input) =>
    checkDomainValidity(client, {
      model: input.model,
      domain: input.domain,
      test_execution: input.test_execution ?? false,
    }),
});
