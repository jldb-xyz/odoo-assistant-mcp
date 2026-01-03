import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkAccess } from "../../tools/access.js";
import type { IOdooClient } from "../../types/index.js";
import {
  createTestClient,
  createTestPartner,
  getOdooVersion,
  shouldSkipIntegrationTests,
  type TestClientResult,
} from "./setup/index.js";

describe(`access tools - Odoo ${getOdooVersion()}`, () => {
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

    // Create a test partner for access tests
    const testPartner = await createTestPartner(client, {
      name: "Access Test Partner",
      email: "access_test@test.example.com",
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

  describe("check_access", () => {
    it("checks read access on res.partner model", async () => {
      if (skipReason) return;

      const result = await checkAccess(client, {
        model: "res.partner",
        operation: "read",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        model: string;
        operation: string;
        has_access: boolean;
      };

      expect(data.model).toBe("res.partner");
      expect(data.operation).toBe("read");
      // Admin should have read access to res.partner
      expect(data.has_access).toBe(true);
    });

    it("checks write access on res.partner model", async () => {
      if (skipReason) return;

      const result = await checkAccess(client, {
        model: "res.partner",
        operation: "write",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        has_access: boolean;
      };

      // Admin should have write access
      expect(data.has_access).toBe(true);
    });

    it("checks create access on res.partner model", async () => {
      if (skipReason) return;

      const result = await checkAccess(client, {
        model: "res.partner",
        operation: "create",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        has_access: boolean;
      };

      expect(data.has_access).toBe(true);
    });

    it("checks unlink access on res.partner model", async () => {
      if (skipReason) return;

      const result = await checkAccess(client, {
        model: "res.partner",
        operation: "unlink",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        has_access: boolean;
      };

      expect(data.has_access).toBe(true);
    });

    it("checks record-level access for specific records", async () => {
      if (skipReason || testPartnerId === null) return;

      const result = await checkAccess(client, {
        model: "res.partner",
        operation: "read",
        record_ids: [testPartnerId],
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        model_access: boolean;
        record_access: Record<number, boolean>;
        has_access: boolean;
      };

      expect(data.model_access).toBe(true);
      expect(data.record_access).toBeDefined();
      // Record access check is included and returns a value for the record
      expect(testPartnerId in data.record_access).toBe(true);
      // has_access reflects overall access (model + records)
      expect(typeof data.has_access).toBe("boolean");
    });

    it("checks access for multiple records", async () => {
      if (skipReason || testPartnerId === null) return;

      // Get admin partner (id=1 or close to it)
      const result = await checkAccess(client, {
        model: "res.partner",
        operation: "read",
        record_ids: [1, testPartnerId],
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        record_access: Record<number, boolean>;
      };

      expect(data.record_access).toBeDefined();
    });

    it("detects non-existent records", async () => {
      if (skipReason) return;

      // Very high ID unlikely to exist
      const nonExistentId = 99999999;
      const result = await checkAccess(client, {
        model: "res.partner",
        operation: "read",
        record_ids: [nonExistentId],
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        record_access: Record<number, boolean>;
        denied_records?: number[];
      };

      expect(data.record_access[nonExistentId]).toBe(false);
      expect(data.denied_records).toContain(nonExistentId);
    });

    it("returns error with raise_exception for denied access", async () => {
      if (skipReason) return;

      // Try to access non-existent record with raise_exception
      const nonExistentId = 99999999;
      const result = await checkAccess(client, {
        model: "res.partner",
        operation: "read",
        record_ids: [nonExistentId],
        raise_exception: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Access denied");
    });

    it("returns error for non-existent model", async () => {
      if (skipReason) return;

      const result = await checkAccess(client, {
        model: "nonexistent.model.xyz",
        operation: "read",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("checks access on ir.model (internal model)", async () => {
      if (skipReason) return;

      const result = await checkAccess(client, {
        model: "ir.model",
        operation: "read",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        has_access: boolean;
      };

      // Admin should have read access to ir.model
      expect(data.has_access).toBe(true);
    });

    it("checks write access on ir.model (may be restricted)", async () => {
      if (skipReason) return;

      const result = await checkAccess(client, {
        model: "ir.model",
        operation: "write",
      });

      expect(result.success).toBe(true);
      // This may or may not be allowed depending on Odoo configuration
      const data = result.result as {
        has_access: boolean;
        reason?: string;
      };

      // Just verify the structure is correct
      expect(typeof data.has_access).toBe("boolean");
    });
  });
});
