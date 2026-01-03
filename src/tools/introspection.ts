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
          .filter(([, def]) => isRelationalField(def) && def.relation)
          .filter(
            ([, def]) => includeTechnical || !isTechnicalModel(def.relation!),
          )
          .map(([name, def]) => ({
            field: name,
            target_model: def.relation!,
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
