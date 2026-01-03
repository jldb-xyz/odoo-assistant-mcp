import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOdooClient } from "../types/index.js";
import { BulkOperationInputSchema, bulkOperation } from "./bulk.js";

describe("bulk tools", () => {
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

  describe("BulkOperationInputSchema", () => {
    it("validates create operation", () => {
      const result = BulkOperationInputSchema.parse({
        model: "res.partner",
        operation: "create",
        values: [{ name: "Test 1" }, { name: "Test 2" }],
        batch_size: 50,
      });

      expect(result.model).toBe("res.partner");
      expect(result.operation).toBe("create");
      expect(result.values).toHaveLength(2);
      expect(result.batch_size).toBe(50);
    });

    it("validates write operation", () => {
      const result = BulkOperationInputSchema.parse({
        model: "res.partner",
        operation: "write",
        record_ids: [1, 2, 3],
        update_values: { active: false },
      });

      expect(result.operation).toBe("write");
      expect(result.record_ids).toEqual([1, 2, 3]);
      expect(result.update_values).toEqual({ active: false });
    });

    it("validates unlink operation", () => {
      const result = BulkOperationInputSchema.parse({
        model: "res.partner",
        operation: "unlink",
        record_ids: [1, 2, 3],
      });

      expect(result.operation).toBe("unlink");
      expect(result.record_ids).toEqual([1, 2, 3]);
    });

    it("validates validate_only flag", () => {
      const result = BulkOperationInputSchema.parse({
        model: "res.partner",
        operation: "create",
        values: [{ name: "Test" }],
        validate_only: true,
      });

      expect(result.validate_only).toBe(true);
    });

    it("rejects missing model", () => {
      expect(() =>
        BulkOperationInputSchema.parse({
          operation: "create",
          values: [{ name: "Test" }],
        }),
      ).toThrow();
    });

    it("rejects invalid operation", () => {
      expect(() =>
        BulkOperationInputSchema.parse({
          model: "res.partner",
          operation: "invalid",
        }),
      ).toThrow();
    });

    it("validates batch_size range", () => {
      expect(() =>
        BulkOperationInputSchema.parse({
          model: "res.partner",
          operation: "create",
          values: [{ name: "Test" }],
          batch_size: 0,
        }),
      ).toThrow();

      expect(() =>
        BulkOperationInputSchema.parse({
          model: "res.partner",
          operation: "create",
          values: [{ name: "Test" }],
          batch_size: 1001,
        }),
      ).toThrow();
    });
  });

  describe("bulkOperation - create", () => {
    it("creates records successfully", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name", required: true },
        email: { type: "char", string: "Email" },
      });

      vi.mocked(mockClient.execute).mockResolvedValue([1, 2]);

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "create",
        values: [{ name: "Test 1" }, { name: "Test 2" }],
      });

      expect(result.success).toBe(true);
      expect(result.result?.succeeded).toBe(2);
      expect(result.result?.created_ids).toEqual([1, 2]);
    });

    it("validates required fields", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name", required: true },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "create",
        values: [{ email: "test@example.com" }], // Missing required 'name'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Validation failed");
      expect(result.result?.errors).toBeDefined();
    });

    it("validates field types", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        sequence: { type: "integer", string: "Sequence" },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "create",
        values: [{ name: "Test", sequence: "not a number" }],
      });

      expect(result.success).toBe(false);
      expect(result.result?.errors[0].error).toContain("integer");
    });

    it("validates selection field values", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        type: {
          type: "selection",
          string: "Type",
          selection: [
            ["contact", "Contact"],
            ["invoice", "Invoice Address"],
          ],
        },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "create",
        values: [{ name: "Test", type: "invalid_type" }],
      });

      expect(result.success).toBe(false);
      expect(result.result?.errors[0].error).toContain("must be one of");
    });

    it("supports validate_only mode", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "create",
        values: [{ name: "Test 1" }, { name: "Test 2" }],
        validate_only: true,
      });

      expect(result.success).toBe(true);
      expect(result.result?.validation_only).toBe(true);
      expect(result.result?.would_affect).toBe(2);
      expect(mockClient.execute).not.toHaveBeenCalled();
    });

    it("handles batch failures atomically", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      vi.mocked(mockClient.execute).mockRejectedValue(
        new Error("Constraint violation"),
      );

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "create",
        values: [{ name: "Test 1" }, { name: "Test 2" }],
      });

      expect(result.success).toBe(true);
      expect(result.result?.failed).toBe(2);
      expect(result.result?.errors).toHaveLength(2);
      expect(result.result?.errors[0].error).toContain("Constraint violation");
    });

    it("requires values array for create", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "create",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("values");
    });

    it("processes in batches", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      vi.mocked(mockClient.execute)
        .mockResolvedValueOnce([1, 2])
        .mockResolvedValueOnce([3]);

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "create",
        values: [{ name: "Test 1" }, { name: "Test 2" }, { name: "Test 3" }],
        batch_size: 2,
      });

      expect(result.success).toBe(true);
      expect(result.result?.succeeded).toBe(3);
      expect(result.result?.created_ids).toEqual([1, 2, 3]);
      expect(mockClient.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe("bulkOperation - write", () => {
    it("updates records successfully", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        active: { type: "boolean", string: "Active" },
      });

      vi.mocked(mockClient.execute).mockResolvedValue(true);

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "write",
        record_ids: [1, 2, 3],
        update_values: { active: false },
      });

      expect(result.success).toBe(true);
      expect(result.result?.succeeded).toBe(3);
      expect(result.result?.updated_ids).toEqual([1, 2, 3]);
    });

    it("validates update_values field types", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        active: { type: "boolean", string: "Active" },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "write",
        record_ids: [1],
        update_values: { active: "not a boolean" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Validation failed");
    });

    it("requires record_ids for write", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "write",
        update_values: { name: "Test" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("record_ids");
    });

    it("requires update_values for write", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "write",
        record_ids: [1, 2],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("update_values");
    });

    it("supports validate_only mode", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "write",
        record_ids: [1, 2, 3],
        update_values: { name: "Updated" },
        validate_only: true,
      });

      expect(result.success).toBe(true);
      expect(result.result?.validation_only).toBe(true);
      expect(result.result?.would_affect).toBe(3);
      expect(mockClient.execute).not.toHaveBeenCalled();
    });
  });

  describe("bulkOperation - unlink", () => {
    it("deletes records successfully", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      vi.mocked(mockClient.execute).mockResolvedValue(true);

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "unlink",
        record_ids: [1, 2, 3],
      });

      expect(result.success).toBe(true);
      expect(result.result?.succeeded).toBe(3);
      expect(result.result?.deleted_ids).toEqual([1, 2, 3]);
    });

    it("requires record_ids for unlink", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "unlink",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("record_ids");
    });

    it("supports validate_only mode", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "unlink",
        record_ids: [1, 2],
        validate_only: true,
      });

      expect(result.success).toBe(true);
      expect(result.result?.validation_only).toBe(true);
      expect(result.result?.would_affect).toBe(2);
      expect(mockClient.execute).not.toHaveBeenCalled();
    });

    it("handles deletion failures atomically", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      vi.mocked(mockClient.execute).mockRejectedValue(
        new Error("Cannot delete: linked records exist"),
      );

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "unlink",
        record_ids: [1, 2],
      });

      expect(result.success).toBe(true);
      expect(result.result?.failed).toBe(2);
      expect(result.result?.errors).toHaveLength(2);
    });
  });

  describe("bulkOperation - common", () => {
    it("returns error for non-existent model", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        error: "Model not found",
      });

      const result = await bulkOperation(mockClient, {
        model: "invalid.model",
        operation: "create",
        values: [{ name: "Test" }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("validates unknown fields", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "create",
        values: [{ name: "Test", unknown_field: "value" }],
      });

      expect(result.success).toBe(false);
      expect(result.result?.errors[0].error).toContain("Unknown field");
    });

    it("validates many2one field as integer", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        company_id: {
          type: "many2one",
          string: "Company",
          relation: "res.company",
        },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "create",
        values: [{ name: "Test", company_id: "not an id" }],
      });

      expect(result.success).toBe(false);
      expect(result.result?.errors[0].error).toContain("integer ID");
    });

    it("validates many2many field as array", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        category_ids: {
          type: "many2many",
          string: "Categories",
          relation: "res.partner.category",
        },
      });

      const result = await bulkOperation(mockClient, {
        model: "res.partner",
        operation: "create",
        values: [{ name: "Test", category_ids: 1 }], // Should be array
      });

      expect(result.success).toBe(false);
      expect(result.result?.errors[0].error).toContain("array");
    });
  });
});
