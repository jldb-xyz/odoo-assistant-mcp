/**
 * Action tools for discovering and executing Odoo workflow actions
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
 * Common workflow action patterns in Odoo
 * Maps method names to human-readable labels and typical state transitions
 */
const COMMON_WORKFLOW_ACTIONS: Record<
  string,
  { label: string; typical_states?: { from: string[]; to: string } }
> = {
  action_confirm: {
    label: "Confirm",
    typical_states: { from: ["draft"], to: "confirmed" },
  },
  action_done: {
    label: "Mark as Done",
    typical_states: { from: ["confirmed", "in_progress"], to: "done" },
  },
  action_cancel: {
    label: "Cancel",
    typical_states: { from: ["draft", "confirmed"], to: "cancel" },
  },
  action_draft: {
    label: "Set to Draft",
    typical_states: { from: ["cancel"], to: "draft" },
  },
  action_post: {
    label: "Post",
    typical_states: { from: ["draft"], to: "posted" },
  },
  action_validate: {
    label: "Validate",
    typical_states: { from: ["draft"], to: "validated" },
  },
  action_approve: {
    label: "Approve",
    typical_states: { from: ["submitted", "pending"], to: "approved" },
  },
  action_refuse: {
    label: "Refuse",
    typical_states: { from: ["submitted", "pending"], to: "refused" },
  },
  action_send: {
    label: "Send",
    typical_states: { from: ["draft"], to: "sent" },
  },
  action_open: {
    label: "Open",
    typical_states: { from: ["draft"], to: "open" },
  },
  action_close: {
    label: "Close",
    typical_states: { from: ["open", "in_progress"], to: "closed" },
  },
  action_start: {
    label: "Start",
    typical_states: { from: ["confirmed"], to: "in_progress" },
  },
  action_assign: { label: "Assign" },
  action_unassign: { label: "Unassign" },
  button_confirm: {
    label: "Confirm",
    typical_states: { from: ["draft"], to: "confirmed" },
  },
  button_validate: {
    label: "Validate",
    typical_states: { from: ["draft"], to: "validated" },
  },
  button_cancel: {
    label: "Cancel",
    typical_states: { from: ["draft", "confirmed"], to: "cancel" },
  },
  button_draft: {
    label: "Reset to Draft",
    typical_states: { from: ["cancel"], to: "draft" },
  },
};

/**
 * Extract selection field values from field definition
 */
function getSelectionValues(
  fieldDef: OdooFieldDef,
): Array<{ value: string; label: string }> | undefined {
  if (fieldDef.type !== "selection" || !fieldDef.selection) {
    return undefined;
  }

  // Selection can be an array of [value, label] tuples
  if (Array.isArray(fieldDef.selection)) {
    return fieldDef.selection.map(([value, label]) => ({
      value: String(value),
      label: String(label),
    }));
  }

  return undefined;
}

// ============ Tool 1: list_available_actions ============

export const ListAvailableActionsInputSchema = z.object({
  model: z.string().describe('Model technical name (e.g., "sale.order")'),
  record_id: z
    .number()
    .optional()
    .describe("Specific record ID to check available actions for"),
  include_server_actions: z
    .boolean()
    .optional()
    .describe("Include ir.actions.server bound to this model (default: true)"),
});

export type ListAvailableActionsInput = z.infer<
  typeof ListAvailableActionsInputSchema
>;

interface WorkflowAction {
  method: string;
  label: string;
  from_states?: string[];
  to_state?: string;
  available: boolean;
  source: "discovered" | "pattern" | "server_action";
}

interface ServerAction {
  id: number;
  name: string;
  binding_type: string;
  state: string;
}

export async function listAvailableActions(
  client: IOdooClient,
  input: ListAvailableActionsInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const includeServerActions = input.include_server_actions ?? true;

    // Validate model exists and get fields
    const fields = await client.getModelFields(input.model);
    if (isError(fields)) {
      return { success: false, error: `Model '${input.model}' not found` };
    }

    // Check for state field
    const stateField = fields.state || fields.status;
    const stateFieldName = fields.state
      ? "state"
      : fields.status
        ? "status"
        : undefined;
    let currentState: string | undefined;
    let allStates: Array<{ value: string; label: string }> | undefined;

    if (stateField && stateFieldName) {
      allStates = getSelectionValues(stateField);

      // If record_id provided, get current state
      if (input.record_id) {
        try {
          const records = await client.readRecords(
            input.model,
            [input.record_id],
            [stateFieldName],
          );
          if (records.length > 0) {
            const record = records[0] as Record<string, unknown>;
            currentState = String(record[stateFieldName] || "");
          }
        } catch {
          // Record may not exist or not accessible
        }
      }
    }

    // Discover workflow actions from common patterns
    const workflowActions: WorkflowAction[] = [];

    for (const [method, info] of Object.entries(COMMON_WORKFLOW_ACTIONS)) {
      // Check if this action might be available based on state
      let available = true;
      if (currentState && info.typical_states) {
        available = info.typical_states.from.includes(currentState);
      }

      const action: WorkflowAction = {
        method,
        label: info.label,
        available,
        source: "pattern",
      };

      if (info.typical_states) {
        action.from_states = info.typical_states.from;
        action.to_state = info.typical_states.to;
      }

      workflowActions.push(action);
    }

    // Query ir.actions.server for model-bound server actions
    let serverActions: ServerAction[] = [];
    if (includeServerActions) {
      try {
        // First get the model ID
        const modelRecords = await client.searchRead(
          "ir.model",
          [["model", "=", input.model]],
          { fields: ["id"], limit: 1 },
        );

        if (Array.isArray(modelRecords) && modelRecords.length > 0) {
          const modelId = (modelRecords[0] as { id: number }).id;

          // Query server actions bound to this model
          const actions = await client.searchRead(
            "ir.actions.server",
            [
              ["model_id", "=", modelId],
              ["binding_model_id", "!=", false],
            ],
            {
              fields: ["id", "name", "binding_type", "state"],
              limit: 50,
            },
          );

          if (Array.isArray(actions)) {
            serverActions = actions.map((action) => {
              const a = action as Record<string, unknown>;
              return {
                id: a.id as number,
                name: String(a.name || ""),
                binding_type: String(a.binding_type || "action"),
                state: String(a.state || "code"),
              };
            });
          }
        }
      } catch {
        // Server actions may not be accessible
      }
    }

    // Note: Additional method discovery could be done by parsing form view XML
    // or querying ir.model.data, but these are complex and may not be accessible
    const discoveredMethods: string[] = [];

    // Build result
    const result: Record<string, unknown> = {
      model: input.model,
      record_id: input.record_id,
      current_state: currentState,
      workflow_actions: workflowActions.filter((a) =>
        // Only include actions that might be valid for current state
        input.record_id ? a.available : true,
      ),
    };

    if (serverActions.length > 0) {
      result.server_actions = serverActions;
    }

    if (stateFieldName && allStates) {
      result.state_field = {
        field_name: stateFieldName,
        current: currentState,
        all_states: allStates,
      };
    }

    if (discoveredMethods.length > 0) {
      result.discovered_methods = discoveredMethods;
    }

    result.guidance =
      "Workflow actions are discovered from common Odoo patterns. " +
      "Not all actions may exist on this model. " +
      "Use execute_action to attempt running an action - it will validate before execution.";

    return { success: true, result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const listAvailableActionsTool = defineTool({
  name: "list_available_actions",
  description:
    "Discover workflow actions and state transitions available on an Odoo model. " +
    "Returns common workflow actions (action_confirm, action_post, etc.), " +
    "server actions bound to the model, and state field information. " +
    "Use this to understand what operations can be performed on records.",
  inputSchema: {
    model: z.string().describe('Model technical name (e.g., "sale.order")'),
    record_id: z
      .number()
      .optional()
      .describe("Specific record ID to check available actions for"),
    include_server_actions: z
      .boolean()
      .optional()
      .describe(
        "Include ir.actions.server bound to this model (default: true)",
      ),
  },
  handler: async (client, input) => listAvailableActions(client, input),
});

// ============ Tool 2: execute_action ============

export const ExecuteActionInputSchema = z.object({
  model: z.string().describe('Model technical name (e.g., "sale.order")'),
  action: z
    .string()
    .describe('Action method name to execute (e.g., "action_confirm")'),
  record_ids: z
    .array(z.number())
    .min(1)
    .describe("Record IDs to execute the action on"),
  context: z
    .record(z.unknown())
    .optional()
    .describe("Additional context to pass to the action"),
});

export type ExecuteActionInput = z.infer<typeof ExecuteActionInputSchema>;

export async function executeAction(
  client: IOdooClient,
  input: ExecuteActionInput,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    // Validate model exists and get fields
    const fields = await client.getModelFields(input.model);
    if (isError(fields)) {
      return { success: false, error: `Model '${input.model}' not found` };
    }

    // Determine state field
    const stateFieldName = fields.state
      ? "state"
      : fields.status
        ? "status"
        : undefined;

    // Read current state of records (before action)
    const beforeStates: Record<number, string> = {};
    if (stateFieldName) {
      try {
        const records = await client.readRecords(
          input.model,
          input.record_ids,
          [stateFieldName],
        );
        for (const record of records) {
          const r = record as Record<string, unknown>;
          beforeStates[r.id as number] = String(r[stateFieldName] || "");
        }
      } catch {
        // May fail if records don't exist
      }
    }

    // Validate all records exist
    const existingIds = Object.keys(beforeStates).map(Number);
    const missingIds = input.record_ids.filter(
      (id) => !existingIds.includes(id),
    );
    if (missingIds.length > 0 && stateFieldName) {
      return {
        success: false,
        error: `Records not found: ${missingIds.join(", ")}`,
      };
    }

    // Execute the action
    let actionResult: unknown;
    const errors: Array<{ record_id: number; error: string }> = [];

    try {
      // Call the action method on the records
      actionResult = await client.execute(
        input.model,
        input.action,
        [input.record_ids],
        input.context || {},
      );
    } catch (error) {
      // Check if it's a method not found error
      const errorStr = String(error);
      if (
        errorStr.includes("object has no attribute") ||
        errorStr.includes("is not defined")
      ) {
        return {
          success: false,
          error:
            `Action '${input.action}' does not exist on model '${input.model}'. ` +
            `Use list_available_actions to discover valid actions.`,
        };
      }
      return { success: false, error: errorStr };
    }

    // Read new state of records (after action)
    const afterStates: Record<number, string> = {};
    if (stateFieldName) {
      try {
        const records = await client.readRecords(
          input.model,
          input.record_ids,
          [stateFieldName],
        );
        for (const record of records) {
          const r = record as Record<string, unknown>;
          afterStates[r.id as number] = String(r[stateFieldName] || "");
        }
      } catch {
        // May fail if records were deleted
      }
    }

    // Build state transition summary
    const stateChanges: Array<{
      record_id: number;
      before: string;
      after: string;
      changed: boolean;
    }> = [];

    for (const recordId of input.record_ids) {
      if (stateFieldName) {
        const before = beforeStates[recordId] || "unknown";
        const after = afterStates[recordId] || "unknown";
        stateChanges.push({
          record_id: recordId,
          before,
          after,
          changed: before !== after,
        });
      }
    }

    const result: Record<string, unknown> = {
      model: input.model,
      action: input.action,
      records_processed: input.record_ids.length,
      action_result: actionResult,
    };

    if (stateFieldName && stateChanges.length > 0) {
      result.state_changes = stateChanges;
      result.records_changed = stateChanges.filter((c) => c.changed).length;
    }

    if (errors.length > 0) {
      result.errors = errors;
    }

    return { success: true, result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const executeActionTool = defineTool({
  name: "execute_action",
  description:
    "Execute a workflow action on Odoo records. " +
    "Captures state before and after execution to show what changed. " +
    "Common actions: action_confirm, action_post, action_cancel, action_done. " +
    "Use list_available_actions first to discover valid actions for a model.",
  inputSchema: {
    model: z.string().describe('Model technical name (e.g., "sale.order")'),
    action: z
      .string()
      .describe('Action method name to execute (e.g., "action_confirm")'),
    record_ids: z
      .array(z.number())
      .describe("Record IDs to execute the action on"),
    context: z
      .record(z.unknown())
      .optional()
      .describe("Additional context to pass to the action"),
  },
  handler: async (client, input) => executeAction(client, input),
});
