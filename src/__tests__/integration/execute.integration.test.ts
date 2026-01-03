import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeMethod } from "../../tools/execute.js";
import type { IOdooClient } from "../../types/index.js";
import {
  createTestClient,
  createTestPartner,
  getOdooVersion,
  shouldSkipIntegrationTests,
  type TestClientResult,
} from "./setup/index.js";

describe(`execute tools - Odoo ${getOdooVersion()}`, () => {
  let testClient: TestClientResult | null = null;
  let client: IOdooClient;
  let skipReason: string | null = null;
  let testPartnerId: number | null = null;
  let cleanupTestPartner: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    skipReason = await shouldSkipIntegrationTests();
    if (skipReason) {
      console.log(`Skipping integration tests: ${skipReason}`);
      return;
    }

    testClient = await createTestClient();
    client = testClient.client;

    // Create a test partner
    const testPartner = await createTestPartner(client, {
      name: "Execute Test Partner",
      email: "execute_test@test.example.com",
    });
    testPartnerId = testPartner.id;
    cleanupTestPartner = testPartner.cleanup;
  }, 60000);

  afterAll(async () => {
    if (cleanupTestPartner) {
      await cleanupTestPartner();
    }
    if (testClient) {
      await testClient.cleanup();
    }
  });

  describe("execute_method", () => {
    it("executes search method", async () => {
      if (skipReason) return;

      const result = await executeMethod(client, {
        model: "res.partner",
        method: "search",
        args: [[["is_company", "=", true]]],
        kwargs: { limit: 5 },
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
      // Search returns array of IDs
      const ids = result.result as number[];
      expect(ids.length).toBeLessThanOrEqual(5);
    });

    it("executes search_count method", async () => {
      if (skipReason) return;

      const result = await executeMethod(client, {
        model: "res.partner",
        method: "search_count",
        args: [[["active", "=", true]]],
      });

      expect(result.success).toBe(true);
      expect(typeof result.result).toBe("number");
      expect(result.result as number).toBeGreaterThanOrEqual(0);
    });

    it("executes search_read method", async () => {
      if (skipReason) return;

      const result = await executeMethod(client, {
        model: "res.partner",
        method: "search_read",
        args: [[]],
        kwargs: { fields: ["id", "name"], limit: 3 },
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
      const records = result.result as Array<{ id: number; name: string }>;
      expect(records.length).toBeLessThanOrEqual(3);
      if (records.length > 0) {
        expect(records[0]).toHaveProperty("id");
        expect(records[0]).toHaveProperty("name");
      }
    });

    it("executes read method", async () => {
      if (skipReason || testPartnerId === null) return;

      const result = await executeMethod(client, {
        model: "res.partner",
        method: "read",
        args: [[testPartnerId], ["id", "name", "email"]],
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
      const records = result.result as Array<{
        id: number;
        name: string;
        email: string;
      }>;
      expect(records.length).toBe(1);
      expect(records[0]?.id).toBe(testPartnerId);
      expect(records[0]?.name).toBe("Execute Test Partner");
      expect(records[0]?.email).toBe("execute_test@test.example.com");
    });

    it("executes read method with display_name", async () => {
      if (skipReason || testPartnerId === null) return;

      const result = await executeMethod(client, {
        model: "res.partner",
        method: "read",
        args: [[testPartnerId], ["id", "display_name"]],
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
      const records = result.result as Array<{
        id: number;
        display_name: string;
      }>;
      expect(records.length).toBe(1);
      expect(records[0]?.id).toBe(testPartnerId);
      expect(records[0]?.display_name).toContain("Execute Test Partner");
    });

    it("executes fields_get method", async () => {
      if (skipReason) return;

      const result = await executeMethod(client, {
        model: "res.partner",
        method: "fields_get",
        args: [],
        kwargs: { attributes: ["type", "string", "required"] },
      });

      expect(result.success).toBe(true);
      expect(typeof result.result).toBe("object");
      const fields = result.result as Record<string, { type: string }>;
      expect(fields).toHaveProperty("name");
      expect(fields).toHaveProperty("id");
      expect(fields.name?.type).toBe("char");
      expect(fields.id?.type).toBe("integer");
    });

    it("executes create method", async () => {
      if (skipReason) return;

      const result = await executeMethod(client, {
        model: "res.partner",
        method: "create",
        args: [
          { name: "Created by execute", email: "exec_create@test.example.com" },
        ],
      });

      expect(result.success).toBe(true);
      expect(typeof result.result).toBe("number");
      const createdId = result.result as number;
      expect(createdId).toBeGreaterThan(0);

      // Cleanup
      await client.execute("res.partner", "unlink", [[createdId]]);
    });

    it("executes write method", async () => {
      if (skipReason || testPartnerId === null) return;

      // Update the test partner
      const result = await executeMethod(client, {
        model: "res.partner",
        method: "write",
        args: [[testPartnerId], { comment: "Updated via execute" }],
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe(true);

      // Verify the update - comment field stores HTML in Odoo
      const records = await client.readRecords(
        "res.partner",
        [testPartnerId],
        ["comment"],
      );
      expect((records[0] as { comment: string })?.comment).toContain(
        "Updated via execute",
      );
    });

    it("normalizes domain for search methods", async () => {
      if (skipReason) return;

      // Test with double-wrapped domain
      const result = await executeMethod(client, {
        model: "res.partner",
        method: "search",
        args: [[[["active", "=", true]]]],
        kwargs: { limit: 1 },
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
    });

    it("handles empty domain", async () => {
      if (skipReason) return;

      const result = await executeMethod(client, {
        model: "res.partner",
        method: "search",
        args: [[]],
        kwargs: { limit: 5 },
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
    });

    it("returns error for non-existent method", async () => {
      if (skipReason) return;

      const result = await executeMethod(client, {
        model: "res.partner",
        method: "nonexistent_method_xyz",
        args: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("returns error for non-existent model", async () => {
      if (skipReason) return;

      const result = await executeMethod(client, {
        model: "nonexistent.model.xyz",
        method: "search",
        args: [[]],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("executes with complex kwargs", async () => {
      if (skipReason) return;

      const result = await executeMethod(client, {
        model: "res.partner",
        method: "search_read",
        args: [[["active", "=", true]]],
        kwargs: {
          fields: ["id", "name", "email"],
          limit: 5,
          offset: 0,
          order: "name asc",
        },
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
      const records = result.result as Array<Record<string, unknown>>;
      if (records.length > 0) {
        expect(records[0]).toHaveProperty("id");
        expect(records[0]).toHaveProperty("name");
        expect(records[0]).toHaveProperty("email");
      }
    });

    it("executes on ir.model to list models", async () => {
      if (skipReason) return;

      const result = await executeMethod(client, {
        model: "ir.model",
        method: "search_read",
        args: [[["model", "ilike", "res.partner"]]],
        kwargs: { fields: ["model", "name"], limit: 5 },
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
      const models = result.result as Array<{ model: string; name: string }>;
      expect(models.some((m) => m.model === "res.partner")).toBe(true);
    });

    it("handles missing optional args and kwargs", async () => {
      if (skipReason) return;

      const result = await executeMethod(client, {
        model: "res.partner",
        method: "search_count",
        args: [[]],
      });

      expect(result.success).toBe(true);
      expect(typeof result.result).toBe("number");
    });
  });
});
