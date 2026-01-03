import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findRecordByName, searchRecords } from "../../tools/search.js";
import type { IOdooClient } from "../../types/index.js";
import {
  createTestClient,
  createTestPartner,
  getOdooVersion,
  shouldSkipIntegrationTests,
  type TestClientResult,
} from "./setup/index.js";

describe(`search tools - Odoo ${getOdooVersion()}`, () => {
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

    // Create a test partner for search tests
    const testPartner = await createTestPartner(client, {
      name: "Integration Test Partner ABC123",
      email: "integration_abc123@test.example.com",
      isCompany: true,
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

  describe("find_record_by_name", () => {
    it("finds records by partial name match", async () => {
      if (skipReason) return;

      const result = await findRecordByName(client, {
        model: "res.partner",
        name: "ABC123",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        model: string;
        search_term: string;
        matches: Array<{ id: number; name: string }>;
        count: number;
      };

      expect(data.model).toBe("res.partner");
      expect(data.search_term).toBe("ABC123");
      expect(data.count).toBeGreaterThanOrEqual(1);

      // Should find our test partner
      const found = data.matches.some(
        (m) => m.name === "Integration Test Partner ABC123",
      );
      expect(found).toBe(true);
    });

    it("finds exact match by name", async () => {
      if (skipReason) return;

      const result = await findRecordByName(client, {
        model: "res.partner",
        name: "Integration Test Partner ABC123",
        operator: "=",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        matches: Array<{ id: number; name: string }>;
        count: number;
        exact_match?: { id: number; name: string };
      };

      expect(data.count).toBe(1);
      expect(data.exact_match).toBeDefined();
      expect(data.exact_match?.id).toBe(testPartnerId);
    });

    it("searches by email field", async () => {
      if (skipReason) return;

      const result = await findRecordByName(client, {
        model: "res.partner",
        name: "integration_abc123",
        field: "email",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        search_field: string;
        matches: Array<{ id: number; email: string }>;
        count: number;
      };

      expect(data.search_field).toBe("email");
      expect(data.count).toBeGreaterThanOrEqual(1);
    });

    it("returns empty results for non-matching search", async () => {
      if (skipReason) return;

      const result = await findRecordByName(client, {
        model: "res.partner",
        name: "nonexistent_partner_xyz_12345",
        operator: "=",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        matches: unknown[];
        count: number;
        guidance: string;
      };

      expect(data.count).toBe(0);
      expect(data.matches).toHaveLength(0);
      expect(data.guidance).toContain("No records found");
    });

    it("returns error for non-existent model", async () => {
      if (skipReason) return;

      const result = await findRecordByName(client, {
        model: "nonexistent.model.xyz",
        name: "test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("returns error for non-existent field", async () => {
      if (skipReason) return;

      const result = await findRecordByName(client, {
        model: "res.partner",
        name: "test",
        field: "nonexistent_field",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("includes model-specific identifying fields", async () => {
      if (skipReason) return;

      const result = await findRecordByName(client, {
        model: "res.partner",
        name: "ABC123",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        matches: Array<Record<string, unknown>>;
      };

      // res.partner should include email and is_company
      const match = data.matches.find(
        (m) => m.name === "Integration Test Partner ABC123",
      );
      expect(match).toBeDefined();
      if (match) {
        expect(match).toHaveProperty("email");
        expect(match).toHaveProperty("is_company");
      }
    });

    it("respects limit parameter", async () => {
      if (skipReason) return;

      const result = await findRecordByName(client, {
        model: "res.partner",
        name: "a", // Common letter, should match many
        limit: 3,
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        matches: unknown[];
        count: number;
      };

      expect(data.count).toBeLessThanOrEqual(3);
    });
  });

  describe("search_records", () => {
    it("searches with empty domain", async () => {
      if (skipReason) return;

      const result = await searchRecords(client, {
        model: "res.partner",
        domain: [],
        limit: 5,
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        model: string;
        records: unknown[];
        count: number;
        total_count: number;
      };

      expect(data.model).toBe("res.partner");
      expect(data.count).toBeLessThanOrEqual(5);
      expect(data.total_count).toBeGreaterThanOrEqual(data.count);
    });

    it("searches with domain filter", async () => {
      if (skipReason) return;

      const result = await searchRecords(client, {
        model: "res.partner",
        domain: [["is_company", "=", true]],
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        records: Array<{ id: number; is_company: boolean }>;
        domain_used: unknown[];
      };

      // Domain filter was applied successfully
      expect(data.domain_used).toBeDefined();
    });

    it("searches with complex domain (OR)", async () => {
      if (skipReason) return;

      const result = await searchRecords(client, {
        model: "res.partner",
        domain: [
          "|",
          ["name", "ilike", "ABC123"],
          ["email", "ilike", "integration_abc123"],
        ],
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        records: Array<{ id: number }>;
        count: number;
      };

      expect(data.count).toBeGreaterThanOrEqual(1);
      // Should find our test partner
      expect(data.records.some((r) => r.id === testPartnerId)).toBe(true);
    });

    it("returns specific fields", async () => {
      if (skipReason) return;

      const result = await searchRecords(client, {
        model: "res.partner",
        domain: [["id", "=", testPartnerId]],
        fields: ["id", "name", "email", "is_company"],
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        records: Array<Record<string, unknown>>;
        fields_returned: string[];
      };

      expect(data.fields_returned).toContain("id");
      expect(data.fields_returned).toContain("name");
      expect(data.fields_returned).toContain("email");
      expect(data.fields_returned).toContain("is_company");

      if (data.records.length > 0) {
        const record = data.records[0];
        expect(record).toHaveProperty("id");
        expect(record).toHaveProperty("name");
        expect(record).toHaveProperty("email");
        expect(record).toHaveProperty("is_company");
      }
    });

    it("count_only returns only count", async () => {
      if (skipReason) return;

      const result = await searchRecords(client, {
        model: "res.partner",
        domain: [["active", "=", true]],
        count_only: true,
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        count: number;
        records?: unknown[];
      };

      expect(typeof data.count).toBe("number");
      expect(data.count).toBeGreaterThanOrEqual(0);
      expect(data.records).toBeUndefined();
    });

    it("supports pagination with offset", async () => {
      if (skipReason) return;

      // First page
      const page1 = await searchRecords(client, {
        model: "res.partner",
        domain: [],
        limit: 5,
        offset: 0,
      });

      // Second page
      const page2 = await searchRecords(client, {
        model: "res.partner",
        domain: [],
        limit: 5,
        offset: 5,
      });

      expect(page1.success).toBe(true);
      expect(page2.success).toBe(true);

      const data1 = page1.result as { records: Array<{ id: number }> };
      const data2 = page2.result as { records: Array<{ id: number }> };

      // Pages should have different records (if enough records exist)
      if (data1.records.length > 0 && data2.records.length > 0) {
        const ids1 = data1.records.map((r) => r.id);
        const ids2 = data2.records.map((r) => r.id);
        const overlap = ids1.filter((id) => ids2.includes(id));
        expect(overlap.length).toBe(0);
      }
    });

    it("supports ordering", async () => {
      if (skipReason) return;

      const result = await searchRecords(client, {
        model: "res.partner",
        domain: [],
        limit: 10,
        order: "name asc",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        records: Array<{ name: string }>;
      };

      // Verify records are sorted by name
      if (data.records.length > 1) {
        for (let i = 1; i < data.records.length; i++) {
          const prev = data.records[i - 1]?.name?.toLowerCase() ?? "";
          const curr = data.records[i]?.name?.toLowerCase() ?? "";
          expect(prev <= curr).toBe(true);
        }
      }
    });

    it("indicates has_more for paginated results", async () => {
      if (skipReason) return;

      const result = await searchRecords(client, {
        model: "res.partner",
        domain: [],
        limit: 2,
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        has_more: boolean;
        total_count: number;
        count: number;
      };

      // If there are more than 2 partners, has_more should be true
      if (data.total_count > 2) {
        expect(data.has_more).toBe(true);
      }
    });

    it("returns error for invalid fields", async () => {
      if (skipReason) return;

      const result = await searchRecords(client, {
        model: "res.partner",
        domain: [],
        fields: ["id", "nonexistent_field"],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid fields");
    });

    it("returns error for invalid domain field", async () => {
      if (skipReason) return;

      const result = await searchRecords(client, {
        model: "res.partner",
        domain: [["nonexistent_field", "=", "test"]],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Domain validation errors");
    });

    it("handles dotted field names in domain", async () => {
      if (skipReason) return;

      const result = await searchRecords(client, {
        model: "res.partner",
        domain: [["country_id.code", "!=", false]],
        limit: 5,
      });

      expect(result.success).toBe(true);
    });
  });
});
