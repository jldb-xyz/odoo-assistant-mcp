import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bulkOperation } from "../../tools/bulk.js";
import type { IOdooClient } from "../../types/index.js";
import {
  createTestClient,
  getOdooVersion,
  shouldSkipIntegrationTests,
  type TestClientResult,
} from "./setup/index.js";

describe(`bulk tools - Odoo ${getOdooVersion()}`, () => {
  let testClient: TestClientResult | null = null;
  let client: IOdooClient;
  let skipReason: string | null = null;
  const createdPartnerIds: number[] = [];

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
    // Cleanup any created partners
    if (client && createdPartnerIds.length > 0) {
      try {
        await client.execute("res.partner", "unlink", [createdPartnerIds]);
      } catch {
        // Ignore cleanup errors
      }
    }
    if (testClient) {
      await testClient.cleanup();
    }
  });

  describe("bulk_operation - create", () => {
    it("creates multiple records in bulk", async () => {
      if (skipReason) return;

      const result = await bulkOperation(client, {
        model: "res.partner",
        operation: "create",
        values: [
          { name: "Bulk Partner 1", email: "bulk1@test.example.com" },
          { name: "Bulk Partner 2", email: "bulk2@test.example.com" },
          { name: "Bulk Partner 3", email: "bulk3@test.example.com" },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      const data = result.result as NonNullable<typeof result.result>;

      expect(data.model).toBe("res.partner");
      expect(data.operation).toBe("create");
      expect(data.total).toBe(3);
      expect(data.succeeded).toBe(3);
      expect(data.failed).toBe(0);
      expect(data.created_ids).toBeDefined();
      expect(data.created_ids).toHaveLength(3);

      // Track for cleanup
      createdPartnerIds.push(...(data.created_ids || []));
    });

    it("validates without executing (dry run)", async () => {
      if (skipReason) return;

      const result = await bulkOperation(client, {
        model: "res.partner",
        operation: "create",
        values: [{ name: "Dry Run Partner 1" }, { name: "Dry Run Partner 2" }],
        validate_only: true,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      const data = result.result as NonNullable<typeof result.result>;

      expect(data.validation_only).toBe(true);
      expect(data.would_affect).toBe(2);
      expect(data.created_ids).toBeUndefined();
    });

    it("validates field types", async () => {
      if (skipReason) return;

      const result = await bulkOperation(client, {
        model: "res.partner",
        operation: "create",
        values: [
          {
            name: "Type Validation Partner",
            is_company: "not a boolean", // Should be boolean
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Validation failed");
      expect(result.result?.errors.length).toBeGreaterThan(0);
    });

    it("detects unknown fields", async () => {
      if (skipReason) return;

      const result = await bulkOperation(client, {
        model: "res.partner",
        operation: "create",
        values: [
          {
            name: "Unknown Field Partner",
            nonexistent_field_xyz: "some value",
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.result?.errors).toBeDefined();
      const errorMessages = result.result?.errors.map((e) => e.error).join(" ");
      expect(errorMessages).toContain("Unknown field");
    });

    it("returns error for empty values array", async () => {
      if (skipReason) return;

      const result = await bulkOperation(client, {
        model: "res.partner",
        operation: "create",
        values: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("requires 'values'");
    });
  });

  describe("bulk_operation - write", () => {
    let updateTestIds: number[] = [];

    beforeAll(async () => {
      if (skipReason) return;

      // Create some test partners to update
      const ids = await client.execute<number[]>("res.partner", "create", [
        [
          { name: "Update Test 1", email: "update1@test.example.com" },
          { name: "Update Test 2", email: "update2@test.example.com" },
        ],
      ]);
      updateTestIds = ids;
      createdPartnerIds.push(...ids);
    });

    it("updates multiple records in bulk", async () => {
      if (skipReason || updateTestIds.length === 0) return;

      const result = await bulkOperation(client, {
        model: "res.partner",
        operation: "write",
        record_ids: updateTestIds,
        update_values: { comment: "Bulk updated" },
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      const data = result.result as NonNullable<typeof result.result>;

      expect(data.model).toBe("res.partner");
      expect(data.operation).toBe("write");
      expect(data.total).toBe(updateTestIds.length);
      expect(data.succeeded).toBe(updateTestIds.length);
      expect(data.updated_ids).toBeDefined();
      expect(data.updated_ids).toHaveLength(updateTestIds.length);

      // Verify the update worked - comment field stores HTML in Odoo
      const records = await client.readRecords("res.partner", updateTestIds, [
        "comment",
      ]);
      for (const record of records as Array<{ comment: string }>) {
        expect(record.comment).toContain("Bulk updated");
      }
    });

    it("validates update values (dry run)", async () => {
      if (skipReason || updateTestIds.length === 0) return;

      const result = await bulkOperation(client, {
        model: "res.partner",
        operation: "write",
        record_ids: updateTestIds,
        update_values: { comment: "Dry run comment" },
        validate_only: true,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      const data = result.result as NonNullable<typeof result.result>;

      expect(data.validation_only).toBe(true);
      expect(data.would_affect).toBe(updateTestIds.length);
      expect(data.updated_ids).toBeUndefined();
    });

    it("returns error for missing record_ids", async () => {
      if (skipReason) return;

      const result = await bulkOperation(client, {
        model: "res.partner",
        operation: "write",
        update_values: { comment: "test" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("requires 'record_ids'");
    });

    it("returns error for missing update_values", async () => {
      if (skipReason) return;

      const result = await bulkOperation(client, {
        model: "res.partner",
        operation: "write",
        record_ids: [1],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("requires 'update_values'");
    });
  });

  describe("bulk_operation - unlink", () => {
    it("deletes multiple records in bulk", async () => {
      if (skipReason) return;

      // Create records specifically for deletion
      const ids = await client.execute<number[]>("res.partner", "create", [
        [
          { name: "Delete Test 1", email: "delete1@test.example.com" },
          { name: "Delete Test 2", email: "delete2@test.example.com" },
        ],
      ]);

      const result = await bulkOperation(client, {
        model: "res.partner",
        operation: "unlink",
        record_ids: ids,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      const data = result.result as NonNullable<typeof result.result>;

      expect(data.model).toBe("res.partner");
      expect(data.operation).toBe("unlink");
      expect(data.total).toBe(2);
      expect(data.succeeded).toBe(2);
      expect(data.deleted_ids).toBeDefined();
      expect(data.deleted_ids).toHaveLength(2);

      // Verify deletion
      const remaining = await client.searchRead(
        "res.partner",
        [["id", "in", ids]],
        { fields: ["id"] },
      );
      expect(remaining).toHaveLength(0);
    });

    it("validates unlink (dry run)", async () => {
      if (skipReason) return;

      // Create a record for dry run test
      const id = await client.execute<number>("res.partner", "create", [
        { name: "Dry Run Delete Test", email: "drydel@test.example.com" },
      ]);
      createdPartnerIds.push(id);

      const result = await bulkOperation(client, {
        model: "res.partner",
        operation: "unlink",
        record_ids: [id],
        validate_only: true,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      const data = result.result as NonNullable<typeof result.result>;

      expect(data.validation_only).toBe(true);
      expect(data.would_affect).toBe(1);
      expect(data.deleted_ids).toBeUndefined();

      // Verify record still exists
      const records = await client.searchRead(
        "res.partner",
        [["id", "=", id]],
        { fields: ["id"] },
      );
      expect(records).toHaveLength(1);
    });

    it("returns error for missing record_ids", async () => {
      if (skipReason) return;

      const result = await bulkOperation(client, {
        model: "res.partner",
        operation: "unlink",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("requires 'record_ids'");
    });
  });

  describe("bulk_operation - error handling", () => {
    it("returns error for non-existent model", async () => {
      if (skipReason) return;

      const result = await bulkOperation(client, {
        model: "nonexistent.model.xyz",
        operation: "create",
        values: [{ name: "Test" }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("handles batch_size parameter", async () => {
      if (skipReason) return;

      // Create with small batch size
      const result = await bulkOperation(client, {
        model: "res.partner",
        operation: "create",
        values: [
          { name: "Batch 1", email: "batch1@test.example.com" },
          { name: "Batch 2", email: "batch2@test.example.com" },
          { name: "Batch 3", email: "batch3@test.example.com" },
        ],
        batch_size: 1, // Process one at a time
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      const data = result.result as NonNullable<typeof result.result>;
      expect(data.succeeded).toBe(3);

      // Track for cleanup
      createdPartnerIds.push(...(data.created_ids || []));
    });
  });
});
