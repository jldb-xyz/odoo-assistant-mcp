import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOdooClient } from "../types/index.js";
import {
  ExecuteActionInputSchema,
  executeAction,
  ListAvailableActionsInputSchema,
  listAvailableActions,
} from "./actions.js";

describe("action tools", () => {
  let mockClient: IOdooClient;

  beforeEach(() => {
    mockClient = {
      execute: vi.fn(),
      getModels: vi.fn(),
      getModelInfo: vi.fn(),
      getModelFields: vi.fn(),
      searchRead: vi.fn(),
      readRecords: vi.fn(),
    };
  });

  describe("ListAvailableActionsInputSchema", () => {
    it("validates valid input with all fields", () => {
      const result = ListAvailableActionsInputSchema.parse({
        model: "sale.order",
        record_id: 123,
        include_server_actions: true,
      });

      expect(result.model).toBe("sale.order");
      expect(result.record_id).toBe(123);
      expect(result.include_server_actions).toBe(true);
    });

    it("validates minimal input", () => {
      const result = ListAvailableActionsInputSchema.parse({
        model: "sale.order",
      });

      expect(result.model).toBe("sale.order");
      expect(result.record_id).toBeUndefined();
      expect(result.include_server_actions).toBeUndefined();
    });

    it("rejects missing model", () => {
      expect(() =>
        ListAvailableActionsInputSchema.parse({
          record_id: 123,
        }),
      ).toThrow();
    });
  });

  describe("listAvailableActions", () => {
    it("returns workflow actions for a model", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        state: {
          type: "selection",
          string: "Status",
          selection: [
            ["draft", "Draft"],
            ["confirmed", "Confirmed"],
            ["done", "Done"],
          ],
        },
      });

      vi.mocked(mockClient.searchRead).mockResolvedValue([]);

      const result = await listAvailableActions(mockClient, {
        model: "sale.order",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.model).toBe("sale.order");
      expect(data.workflow_actions).toBeDefined();
      expect(Array.isArray(data.workflow_actions)).toBe(true);

      const actions = data.workflow_actions as Array<Record<string, unknown>>;
      const actionMethods = actions.map((a) => a.method);
      expect(actionMethods).toContain("action_confirm");
      expect(actionMethods).toContain("action_done");
      expect(actionMethods).toContain("action_cancel");
    });

    it("returns state field information", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        state: {
          type: "selection",
          string: "Status",
          selection: [
            ["draft", "Draft"],
            ["posted", "Posted"],
          ],
        },
      });

      vi.mocked(mockClient.searchRead).mockResolvedValue([]);

      const result = await listAvailableActions(mockClient, {
        model: "account.move",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.state_field).toBeDefined();
      const stateField = data.state_field as Record<string, unknown>;
      expect(stateField.field_name).toBe("state");
      expect(stateField.all_states).toEqual([
        { value: "draft", label: "Draft" },
        { value: "posted", label: "Posted" },
      ]);
    });

    it("returns current state when record_id provided", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        state: {
          type: "selection",
          string: "Status",
          selection: [
            ["draft", "Draft"],
            ["confirmed", "Confirmed"],
          ],
        },
      });

      vi.mocked(mockClient.readRecords).mockResolvedValue([
        { id: 1, state: "draft" },
      ]);

      vi.mocked(mockClient.searchRead).mockResolvedValue([]);

      const result = await listAvailableActions(mockClient, {
        model: "sale.order",
        record_id: 1,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.current_state).toBe("draft");
    });

    it("filters actions by current state", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        state: {
          type: "selection",
          string: "Status",
          selection: [
            ["draft", "Draft"],
            ["confirmed", "Confirmed"],
          ],
        },
      });

      vi.mocked(mockClient.readRecords).mockResolvedValue([
        { id: 1, state: "draft" },
      ]);

      vi.mocked(mockClient.searchRead).mockResolvedValue([]);

      const result = await listAvailableActions(mockClient, {
        model: "sale.order",
        record_id: 1,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      const actions = data.workflow_actions as Array<Record<string, unknown>>;

      // action_confirm should be available from draft (and included in results)
      const confirmAction = actions.find((a) => a.method === "action_confirm");
      expect(confirmAction?.available).toBe(true);

      // action_done is filtered out because it's not available from draft
      // When record_id is provided, only available actions are returned
      const doneAction = actions.find((a) => a.method === "action_done");
      expect(doneAction).toBeUndefined();
    });

    it("includes server actions when requested", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      // First searchRead for ir.model
      vi.mocked(mockClient.searchRead)
        .mockResolvedValueOnce([{ id: 100 }]) // ir.model result
        .mockResolvedValueOnce([
          // ir.actions.server result
          {
            id: 1,
            name: "Send by Email",
            binding_type: "action",
            state: "code",
          },
          {
            id: 2,
            name: "Export to PDF",
            binding_type: "report",
            state: "code",
          },
        ]);

      const result = await listAvailableActions(mockClient, {
        model: "sale.order",
        include_server_actions: true,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.server_actions).toBeDefined();
      const serverActions = data.server_actions as Array<
        Record<string, unknown>
      >;
      expect(serverActions).toHaveLength(2);
      expect(serverActions[0].name).toBe("Send by Email");
    });

    it("returns error for non-existent model", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        error: "Model not found",
      });

      const result = await listAvailableActions(mockClient, {
        model: "invalid.model",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("works with status field instead of state", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        status: {
          type: "selection",
          string: "Status",
          selection: [
            ["pending", "Pending"],
            ["active", "Active"],
          ],
        },
      });

      vi.mocked(mockClient.searchRead).mockResolvedValue([]);

      const result = await listAvailableActions(mockClient, {
        model: "custom.model",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.state_field).toBeDefined();
      const stateField = data.state_field as Record<string, unknown>;
      expect(stateField.field_name).toBe("status");
    });
  });

  describe("ExecuteActionInputSchema", () => {
    it("validates valid input", () => {
      const result = ExecuteActionInputSchema.parse({
        model: "sale.order",
        action: "action_confirm",
        record_ids: [1, 2, 3],
        context: { force: true },
      });

      expect(result.model).toBe("sale.order");
      expect(result.action).toBe("action_confirm");
      expect(result.record_ids).toEqual([1, 2, 3]);
      expect(result.context).toEqual({ force: true });
    });

    it("rejects missing required fields", () => {
      expect(() =>
        ExecuteActionInputSchema.parse({
          action: "action_confirm",
          record_ids: [1],
        }),
      ).toThrow();

      expect(() =>
        ExecuteActionInputSchema.parse({
          model: "sale.order",
          record_ids: [1],
        }),
      ).toThrow();

      expect(() =>
        ExecuteActionInputSchema.parse({
          model: "sale.order",
          action: "action_confirm",
        }),
      ).toThrow();
    });

    it("rejects empty record_ids", () => {
      expect(() =>
        ExecuteActionInputSchema.parse({
          model: "sale.order",
          action: "action_confirm",
          record_ids: [],
        }),
      ).toThrow();
    });
  });

  describe("executeAction", () => {
    it("executes an action successfully", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        state: { type: "selection", string: "Status" },
      });

      vi.mocked(mockClient.readRecords)
        .mockResolvedValueOnce([{ id: 1, state: "draft" }]) // Before
        .mockResolvedValueOnce([{ id: 1, state: "confirmed" }]); // After

      vi.mocked(mockClient.execute).mockResolvedValue(true);

      const result = await executeAction(mockClient, {
        model: "sale.order",
        action: "action_confirm",
        record_ids: [1],
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.model).toBe("sale.order");
      expect(data.action).toBe("action_confirm");
      expect(data.records_processed).toBe(1);
    });

    it("captures state changes", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        state: { type: "selection", string: "Status" },
      });

      vi.mocked(mockClient.readRecords)
        .mockResolvedValueOnce([
          { id: 1, state: "draft" },
          { id: 2, state: "draft" },
        ])
        .mockResolvedValueOnce([
          { id: 1, state: "confirmed" },
          { id: 2, state: "confirmed" },
        ]);

      vi.mocked(mockClient.execute).mockResolvedValue(true);

      const result = await executeAction(mockClient, {
        model: "sale.order",
        action: "action_confirm",
        record_ids: [1, 2],
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      const changes = data.state_changes as Array<Record<string, unknown>>;
      expect(changes).toHaveLength(2);
      expect(changes[0].before).toBe("draft");
      expect(changes[0].after).toBe("confirmed");
      expect(changes[0].changed).toBe(true);
    });

    it("passes context to the action", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
      });

      vi.mocked(mockClient.readRecords).mockResolvedValue([]);
      vi.mocked(mockClient.execute).mockResolvedValue(true);

      await executeAction(mockClient, {
        model: "sale.order",
        action: "action_confirm",
        record_ids: [1],
        context: { skip_validation: true },
      });

      expect(mockClient.execute).toHaveBeenCalledWith(
        "sale.order",
        "action_confirm",
        [[1]],
        { skip_validation: true },
      );
    });

    it("returns error for non-existent action", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
      });

      vi.mocked(mockClient.readRecords).mockResolvedValue([]);
      vi.mocked(mockClient.execute).mockRejectedValue(
        new Error("'sale.order' object has no attribute 'invalid_action'"),
      );

      const result = await executeAction(mockClient, {
        model: "sale.order",
        action: "invalid_action",
        record_ids: [1],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
      expect(result.error).toContain("list_available_actions");
    });

    it("returns error for non-existent model", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        error: "Model not found",
      });

      const result = await executeAction(mockClient, {
        model: "invalid.model",
        action: "action_confirm",
        record_ids: [1],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("handles action that returns a value", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
      });

      vi.mocked(mockClient.readRecords).mockResolvedValue([]);
      vi.mocked(mockClient.execute).mockResolvedValue({
        type: "ir.actions.act_window",
        name: "Invoice",
        res_model: "account.move",
        res_id: 42,
      });

      const result = await executeAction(mockClient, {
        model: "sale.order",
        action: "action_create_invoice",
        record_ids: [1],
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.action_result).toEqual({
        type: "ir.actions.act_window",
        name: "Invoice",
        res_model: "account.move",
        res_id: 42,
      });
    });

    it("reports records without state changes", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        state: { type: "selection", string: "Status" },
      });

      vi.mocked(mockClient.readRecords)
        .mockResolvedValueOnce([{ id: 1, state: "confirmed" }])
        .mockResolvedValueOnce([{ id: 1, state: "confirmed" }]);

      vi.mocked(mockClient.execute).mockResolvedValue(true);

      const result = await executeAction(mockClient, {
        model: "sale.order",
        action: "action_confirm",
        record_ids: [1],
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      const changes = data.state_changes as Array<Record<string, unknown>>;
      expect(changes[0].changed).toBe(false);
      expect(data.records_changed).toBe(0);
    });
  });
});
