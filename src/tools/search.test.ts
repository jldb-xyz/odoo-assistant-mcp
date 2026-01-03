import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOdooClient } from "../types/index.js";
import {
  FindRecordByNameInputSchema,
  findRecordByName,
  SearchRecordsInputSchema,
  searchRecords,
} from "./search.js";

describe("search tools", () => {
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

  describe("FindRecordByNameInputSchema", () => {
    it("validates valid input with all fields", () => {
      const result = FindRecordByNameInputSchema.parse({
        model: "res.partner",
        name: "John",
        field: "name",
        operator: "ilike",
        limit: 20,
      });

      expect(result.model).toBe("res.partner");
      expect(result.name).toBe("John");
      expect(result.field).toBe("name");
      expect(result.operator).toBe("ilike");
      expect(result.limit).toBe(20);
    });

    it("validates minimal input", () => {
      const result = FindRecordByNameInputSchema.parse({
        model: "res.partner",
        name: "Test",
      });

      expect(result.model).toBe("res.partner");
      expect(result.name).toBe("Test");
      expect(result.field).toBeUndefined();
      expect(result.operator).toBeUndefined();
    });

    it("rejects missing model", () => {
      expect(() =>
        FindRecordByNameInputSchema.parse({
          name: "John",
        }),
      ).toThrow();
    });

    it("rejects missing name", () => {
      expect(() =>
        FindRecordByNameInputSchema.parse({
          model: "res.partner",
        }),
      ).toThrow();
    });

    it("validates operator enum", () => {
      expect(() =>
        FindRecordByNameInputSchema.parse({
          model: "res.partner",
          name: "John",
          operator: "invalid",
        }),
      ).toThrow();
    });

    it("validates limit range", () => {
      expect(() =>
        FindRecordByNameInputSchema.parse({
          model: "res.partner",
          name: "John",
          limit: 0,
        }),
      ).toThrow();

      expect(() =>
        FindRecordByNameInputSchema.parse({
          model: "res.partner",
          name: "John",
          limit: 101,
        }),
      ).toThrow();
    });
  });

  describe("findRecordByName", () => {
    it("finds records by name with ilike operator", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        display_name: { type: "char", string: "Display Name" },
      });

      vi.mocked(mockClient.searchRead).mockResolvedValue([
        { id: 1, name: "John Doe", display_name: "John Doe" },
        { id: 2, name: "Johnny Smith", display_name: "Johnny Smith" },
      ]);

      const result = await findRecordByName(mockClient, {
        model: "res.partner",
        name: "John",
      });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      const data = result.result as Record<string, unknown>;
      expect(data.count).toBe(2);
      expect(data.matches).toHaveLength(2);
    });

    it("returns single match as exact_match", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        display_name: { type: "char", string: "Display Name" },
      });

      vi.mocked(mockClient.searchRead).mockResolvedValue([
        { id: 1, name: "John Doe", display_name: "John Doe" },
      ]);

      const result = await findRecordByName(mockClient, {
        model: "res.partner",
        name: "John Doe",
        operator: "=",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.exact_match).toEqual({ id: 1, name: "John Doe" });
    });

    it("returns error for non-existent model", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        error: "Model not found",
      });

      const result = await findRecordByName(mockClient, {
        model: "invalid.model",
        name: "Test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("returns error for invalid search field", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      const result = await findRecordByName(mockClient, {
        model: "res.partner",
        name: "Test",
        field: "invalid_field",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("includes model-specific identifying fields for res.partner", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        display_name: { type: "char", string: "Display Name" },
        email: { type: "char", string: "Email" },
        is_company: { type: "boolean", string: "Is Company" },
        phone: { type: "char", string: "Phone" },
        vat: { type: "char", string: "VAT" },
      });

      vi.mocked(mockClient.searchRead).mockResolvedValue([
        {
          id: 1,
          name: "Test Company",
          display_name: "Test Company",
          email: "test@example.com",
          is_company: true,
          phone: "+1234567890",
          vat: "US123456789",
        },
      ]);

      const result = await findRecordByName(mockClient, {
        model: "res.partner",
        name: "Test",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      const matches = data.matches as Array<Record<string, unknown>>;
      expect(matches[0].email).toBe("test@example.com");
      expect(matches[0].is_company).toBe(true);
    });

    it("adds wildcards for ilike operator", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        display_name: { type: "char", string: "Display Name" },
      });

      vi.mocked(mockClient.searchRead).mockResolvedValue([]);

      await findRecordByName(mockClient, {
        model: "res.partner",
        name: "Test",
        operator: "ilike",
      });

      expect(mockClient.searchRead).toHaveBeenCalledWith(
        "res.partner",
        [["name", "ilike", "%Test%"]],
        expect.any(Object),
      );
    });

    it("does not add wildcards for exact match operator", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        display_name: { type: "char", string: "Display Name" },
      });

      vi.mocked(mockClient.searchRead).mockResolvedValue([]);

      await findRecordByName(mockClient, {
        model: "res.partner",
        name: "Test",
        operator: "=",
      });

      expect(mockClient.searchRead).toHaveBeenCalledWith(
        "res.partner",
        [["name", "=", "Test"]],
        expect.any(Object),
      );
    });
  });

  describe("SearchRecordsInputSchema", () => {
    it("validates valid input with all fields", () => {
      const result = SearchRecordsInputSchema.parse({
        model: "res.partner",
        domain: [["is_company", "=", true]],
        fields: ["id", "name"],
        limit: 50,
        offset: 10,
        order: "name asc",
        count_only: false,
      });

      expect(result.model).toBe("res.partner");
      expect(result.domain).toEqual([["is_company", "=", true]]);
      expect(result.fields).toEqual(["id", "name"]);
    });

    it("validates minimal input", () => {
      const result = SearchRecordsInputSchema.parse({
        model: "res.partner",
        domain: [],
      });

      expect(result.model).toBe("res.partner");
      expect(result.domain).toEqual([]);
    });

    it("rejects missing model", () => {
      expect(() =>
        SearchRecordsInputSchema.parse({
          domain: [],
        }),
      ).toThrow();
    });

    it("rejects missing domain", () => {
      expect(() =>
        SearchRecordsInputSchema.parse({
          model: "res.partner",
        }),
      ).toThrow();
    });

    it("validates limit range", () => {
      expect(() =>
        SearchRecordsInputSchema.parse({
          model: "res.partner",
          domain: [],
          limit: 0,
        }),
      ).toThrow();

      expect(() =>
        SearchRecordsInputSchema.parse({
          model: "res.partner",
          domain: [],
          limit: 1001,
        }),
      ).toThrow();
    });
  });

  describe("searchRecords", () => {
    it("searches records with domain", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        display_name: { type: "char", string: "Display Name" },
        is_company: { type: "boolean", string: "Is Company" },
      });

      vi.mocked(mockClient.searchRead).mockResolvedValue([
        { id: 1, name: "Company A", display_name: "Company A" },
        { id: 2, name: "Company B", display_name: "Company B" },
      ]);

      vi.mocked(mockClient.execute).mockResolvedValue(2);

      const result = await searchRecords(mockClient, {
        model: "res.partner",
        domain: [["is_company", "=", true]],
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.count).toBe(2);
      expect(data.total_count).toBe(2);
      expect(data.records).toHaveLength(2);
    });

    it("returns count only when count_only is true", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        display_name: { type: "char", string: "Display Name" },
      });

      vi.mocked(mockClient.execute).mockResolvedValue(42);

      const result = await searchRecords(mockClient, {
        model: "res.partner",
        domain: [],
        count_only: true,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.count).toBe(42);
      expect(data.records).toBeUndefined();
    });

    it("validates requested fields exist", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      const result = await searchRecords(mockClient, {
        model: "res.partner",
        domain: [],
        fields: ["id", "name", "invalid_field"],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid fields");
      expect(result.error).toContain("invalid_field");
    });

    it("validates domain field names", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        display_name: { type: "char", string: "Display Name" },
      });

      const result = await searchRecords(mockClient, {
        model: "res.partner",
        domain: [["invalid_field", "=", "test"]],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Domain validation errors");
    });

    it("handles dotted field names in domain", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        display_name: { type: "char", string: "Display Name" },
        country_id: {
          type: "many2one",
          string: "Country",
          relation: "res.country",
        },
      });

      vi.mocked(mockClient.searchRead).mockResolvedValue([]);
      vi.mocked(mockClient.execute).mockResolvedValue(0);

      const result = await searchRecords(mockClient, {
        model: "res.partner",
        domain: [["country_id.code", "=", "US"]],
      });

      expect(result.success).toBe(true);
    });

    it("indicates has_more when more records exist", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        display_name: { type: "char", string: "Display Name" },
      });

      // Return 11 records (1 more than limit of 10)
      const records = Array.from({ length: 11 }, (_, i) => ({
        id: i + 1,
        name: `Record ${i + 1}`,
        display_name: `Record ${i + 1}`,
      }));
      vi.mocked(mockClient.searchRead).mockResolvedValue(records);
      vi.mocked(mockClient.execute).mockResolvedValue(50);

      const result = await searchRecords(mockClient, {
        model: "res.partner",
        domain: [],
        limit: 10,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.has_more).toBe(true);
      expect(data.total_count).toBe(50);
      expect((data.records as unknown[]).length).toBe(10);
    });

    it("returns error for non-existent model", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        error: "Model not found",
      });

      const result = await searchRecords(mockClient, {
        model: "invalid.model",
        domain: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("ensures id is always included in fields", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      vi.mocked(mockClient.searchRead).mockResolvedValue([]);
      vi.mocked(mockClient.execute).mockResolvedValue(0);

      await searchRecords(mockClient, {
        model: "res.partner",
        domain: [],
        fields: ["name"],
      });

      expect(mockClient.searchRead).toHaveBeenCalledWith(
        "res.partner",
        expect.any(Array),
        expect.objectContaining({
          fields: expect.arrayContaining(["id", "name"]),
        }),
      );
    });

    it("applies order parameter", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        display_name: { type: "char", string: "Display Name" },
      });

      vi.mocked(mockClient.searchRead).mockResolvedValue([]);
      vi.mocked(mockClient.execute).mockResolvedValue(0);

      await searchRecords(mockClient, {
        model: "res.partner",
        domain: [],
        order: "name desc",
      });

      expect(mockClient.searchRead).toHaveBeenCalledWith(
        "res.partner",
        expect.any(Array),
        expect.objectContaining({
          order: "name desc",
        }),
      );
    });
  });
});
