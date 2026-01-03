import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOdooClient } from "../types/index.js";
import { CheckAccessInputSchema, checkAccess } from "./access.js";

describe("access tools", () => {
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

  describe("CheckAccessInputSchema", () => {
    it("validates valid input with all fields", () => {
      const result = CheckAccessInputSchema.parse({
        model: "res.partner",
        operation: "write",
        record_ids: [1, 2, 3],
        raise_exception: true,
      });

      expect(result.model).toBe("res.partner");
      expect(result.operation).toBe("write");
      expect(result.record_ids).toEqual([1, 2, 3]);
      expect(result.raise_exception).toBe(true);
    });

    it("validates minimal input", () => {
      const result = CheckAccessInputSchema.parse({
        model: "res.partner",
        operation: "read",
      });

      expect(result.model).toBe("res.partner");
      expect(result.operation).toBe("read");
      expect(result.record_ids).toBeUndefined();
      expect(result.raise_exception).toBeUndefined();
    });

    it("rejects missing model", () => {
      expect(() =>
        CheckAccessInputSchema.parse({
          operation: "read",
        }),
      ).toThrow();
    });

    it("rejects missing operation", () => {
      expect(() =>
        CheckAccessInputSchema.parse({
          model: "res.partner",
        }),
      ).toThrow();
    });

    it("validates operation enum", () => {
      expect(() =>
        CheckAccessInputSchema.parse({
          model: "res.partner",
          operation: "invalid",
        }),
      ).toThrow();
    });

    it("accepts all valid operations", () => {
      for (const op of ["read", "write", "create", "unlink"]) {
        const result = CheckAccessInputSchema.parse({
          model: "res.partner",
          operation: op,
        });
        expect(result.operation).toBe(op);
      }
    });
  });

  describe("checkAccess", () => {
    it("returns model-level access when granted", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      vi.mocked(mockClient.execute).mockResolvedValue(true);

      const result = await checkAccess(mockClient, {
        model: "res.partner",
        operation: "read",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.has_access).toBe(true);
      expect(data.model).toBe("res.partner");
      expect(data.operation).toBe("read");
    });

    it("returns model-level access when denied", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      vi.mocked(mockClient.execute).mockRejectedValue(
        new Error("Access denied"),
      );

      const result = await checkAccess(mockClient, {
        model: "res.partner",
        operation: "write",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.has_access).toBe(false);
      expect(data.reason).toBeDefined();
    });

    it("returns error for non-existent model", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        error: "Model not found",
      });

      const result = await checkAccess(mockClient, {
        model: "invalid.model",
        operation: "read",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("checks record-level access for specific records", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      vi.mocked(mockClient.execute).mockResolvedValue(true);
      vi.mocked(mockClient.readRecords).mockResolvedValue([
        { id: 1, name: "Record 1" },
        { id: 2, name: "Record 2" },
      ]);

      const result = await checkAccess(mockClient, {
        model: "res.partner",
        operation: "read",
        record_ids: [1, 2],
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.model_access).toBe(true);
      expect(data.record_access).toEqual({ 1: true, 2: true });
    });

    it("identifies records with no access", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      vi.mocked(mockClient.execute).mockResolvedValue(true);
      // Code reads each record individually, so mock both calls
      vi.mocked(mockClient.readRecords)
        .mockResolvedValueOnce([{ id: 1, name: "Record 1" }]) // Record 1 found
        .mockResolvedValueOnce([]); // Record 2 not found

      const result = await checkAccess(mockClient, {
        model: "res.partner",
        operation: "read",
        record_ids: [1, 2],
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.record_access).toEqual({ 1: true, 2: false });
      expect(data.denied_records).toEqual([2]);
    });

    it("returns error when raise_exception is true and access denied", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      vi.mocked(mockClient.execute).mockRejectedValue(
        new Error("Access denied for operation write"),
      );

      const result = await checkAccess(mockClient, {
        model: "res.partner",
        operation: "write",
        raise_exception: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Access denied");
    });

    it("returns record access errors when raise_exception is true", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      vi.mocked(mockClient.execute).mockResolvedValue(true);
      vi.mocked(mockClient.readRecords).mockResolvedValue([]);

      const result = await checkAccess(mockClient, {
        model: "res.partner",
        operation: "read",
        record_ids: [1, 2],
        raise_exception: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Access denied for record");
    });

    it("parses access error for required groups", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      vi.mocked(mockClient.execute).mockRejectedValue(
        new Error(
          "Sorry, you are not allowed to access this document. " +
            "This operation is allowed for the following group(s): Sales / Manager, Administration / Settings",
        ),
      );

      const result = await checkAccess(mockClient, {
        model: "res.partner",
        operation: "write",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.has_access).toBe(false);
      expect(data.required_groups).toContain("Sales / Manager");
      expect(data.required_groups).toContain("Administration / Settings");
    });

    it("marks all record access as denied when model access denied", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      vi.mocked(mockClient.execute).mockRejectedValue(
        new Error("Access denied"),
      );

      const result = await checkAccess(mockClient, {
        model: "res.partner",
        operation: "write",
        record_ids: [1, 2, 3],
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.model_access).toBe(false);
      expect(data.record_access).toEqual({ 1: false, 2: false, 3: false });
      expect(data.errors).toEqual({
        1: "No model-level access",
        2: "No model-level access",
        3: "No model-level access",
      });
    });
  });
});
