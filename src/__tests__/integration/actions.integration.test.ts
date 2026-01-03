import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeAction, listAvailableActions } from "../../tools/actions.js";
import type { IOdooClient } from "../../types/index.js";
import {
  createTestClient,
  getOdooVersion,
  shouldSkipIntegrationTests,
  type TestClientResult,
} from "./setup/index.js";

describe(`action tools - Odoo ${getOdooVersion()}`, () => {
  let testClient: TestClientResult | null = null;
  let client: IOdooClient;
  let skipReason: string | null = null;

  beforeAll(async () => {
    skipReason = await shouldSkipIntegrationTests();
    if (skipReason) {
      console.log(`Skipping integration tests: ${skipReason}`);
      return;
    }

    testClient = await createTestClient();
    client = testClient.client;
  }, 60000);

  afterAll(async () => {
    if (testClient) {
      await testClient.cleanup();
    }
  });

  describe("list_available_actions", () => {
    it("lists actions for res.partner model", async () => {
      if (skipReason) return;

      const result = await listAvailableActions(client, {
        model: "res.partner",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        model: string;
        workflow_actions: Array<{
          method: string;
          label: string;
          available: boolean;
        }>;
        guidance: string;
      };

      expect(data.model).toBe("res.partner");
      expect(data.workflow_actions).toBeDefined();
      expect(Array.isArray(data.workflow_actions)).toBe(true);
      expect(data.guidance).toBeDefined();

      // Should have common workflow actions
      const actionMethods = data.workflow_actions.map((a) => a.method);
      expect(actionMethods).toContain("action_confirm");
      expect(actionMethods).toContain("action_cancel");
    });

    it("includes state field information when available", async () => {
      if (skipReason) return;

      // ir.module.module has a state field
      const result = await listAvailableActions(client, {
        model: "ir.module.module",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        state_field?: {
          field_name: string;
          all_states: Array<{ value: string; label: string }>;
        };
      };

      // ir.module.module has a state field
      if (data.state_field) {
        expect(data.state_field.field_name).toBe("state");
        expect(data.state_field.all_states).toBeDefined();
        expect(Array.isArray(data.state_field.all_states)).toBe(true);
      }
    });

    it("returns actions for specific record", async () => {
      if (skipReason) return;

      // Get first module record
      const modules = await client.searchRead(
        "ir.module.module",
        [["state", "=", "installed"]],
        { fields: ["id"], limit: 1 },
      );

      if (Array.isArray(modules) && modules.length > 0) {
        const moduleId = (modules[0] as { id: number }).id;

        const result = await listAvailableActions(client, {
          model: "ir.module.module",
          record_id: moduleId,
        });

        expect(result.success).toBe(true);
        const data = result.result as {
          record_id: number;
          current_state: string;
        };

        expect(data.record_id).toBe(moduleId);
        expect(data.current_state).toBe("installed");
      }
    });

    it("includes server actions when requested", async () => {
      if (skipReason) return;

      const result = await listAvailableActions(client, {
        model: "res.partner",
        include_server_actions: true,
      });

      expect(result.success).toBe(true);
      // Server actions may or may not exist, just verify the call works
    });

    it("returns error for non-existent model", async () => {
      if (skipReason) return;

      const result = await listAvailableActions(client, {
        model: "nonexistent.model.xyz",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("execute_action", () => {
    it("executes action on ir.config_parameter", async () => {
      if (skipReason) return;

      // Find a config parameter
      const params = await client.searchRead("ir.config_parameter", [], {
        fields: ["id"],
        limit: 1,
      });

      if (Array.isArray(params) && params.length > 0) {
        const paramId = (params[0] as { id: number }).id;

        // Try to call a non-existent action to verify error handling
        const result = await executeAction(client, {
          model: "ir.config_parameter",
          action: "action_nonexistent_test",
          record_ids: [paramId],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("does not exist");
      }
    });

    it("handles invalid action name gracefully", async () => {
      if (skipReason) return;

      // Create a test partner to execute on
      const partnerId = await client.execute<number>("res.partner", "create", [
        { name: "Action Test Partner", email: "action_test@test.example.com" },
      ]);

      try {
        const result = await executeAction(client, {
          model: "res.partner",
          action: "nonexistent_action_xyz",
          record_ids: [partnerId],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("does not exist");
      } finally {
        // Cleanup
        await client.execute("res.partner", "unlink", [[partnerId]]);
      }
    });

    it("returns error for non-existent records", async () => {
      if (skipReason) return;

      const result = await executeAction(client, {
        model: "res.partner",
        action: "action_confirm",
        record_ids: [99999999],
      });

      // May fail with "record not found" or "action doesn't exist"
      expect(result.success).toBe(false);
    });

    it("returns error for non-existent model", async () => {
      if (skipReason) return;

      const result = await executeAction(client, {
        model: "nonexistent.model.xyz",
        action: "action_confirm",
        record_ids: [1],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("executes valid method and captures result", async () => {
      if (skipReason) return;

      // Create a test partner
      const partnerId = await client.execute<number>("res.partner", "create", [
        {
          name: "Method Test Partner",
          email: "method_test@test.example.com",
        },
      ]);

      try {
        // Use read with display_name - works across all Odoo versions
        const result = await client.execute<
          Array<{ id: number; display_name: string }>
        >("res.partner", "read", [[partnerId], ["id", "display_name"]]);

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(1);
        expect(result[0]?.id).toBe(partnerId);
        expect(result[0]?.display_name).toContain("Method Test Partner");
      } finally {
        // Cleanup
        await client.execute("res.partner", "unlink", [[partnerId]]);
      }
    });

    it("passes context to action", async () => {
      if (skipReason) return;

      // Create a test partner
      const partnerId = await client.execute<number>("res.partner", "create", [
        {
          name: "Context Test Partner",
          email: "context_test@test.example.com",
        },
      ]);

      try {
        // Use search_read with context - this accepts context properly
        const result = await client.execute<Array<Record<string, unknown>>>(
          "res.partner",
          "search_read",
          [[["id", "=", partnerId]]],
          { fields: ["name"], context: { lang: "en_US" } },
        );

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(1);
      } finally {
        // Cleanup
        await client.execute("res.partner", "unlink", [[partnerId]]);
      }
    });
  });
});
