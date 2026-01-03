import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOdooClient } from "../types/index.js";
import { ExecuteMethodInputSchema, executeMethod } from "./execute.js";

describe("execute tool", () => {
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

  describe("ExecuteMethodInputSchema", () => {
    it("validates valid input", () => {
      const result = ExecuteMethodInputSchema.parse({
        model: "res.partner",
        method: "search_read",
        args: [[]],
        kwargs: { limit: 10 },
      });

      expect(result.model).toBe("res.partner");
      expect(result.method).toBe("search_read");
    });

    it("provides defaults for optional fields", () => {
      const result = ExecuteMethodInputSchema.parse({
        model: "res.partner",
        method: "read",
      });

      expect(result.args).toEqual([]);
      expect(result.kwargs).toEqual({});
    });

    it("rejects missing model", () => {
      expect(() =>
        ExecuteMethodInputSchema.parse({
          method: "search",
        }),
      ).toThrow();
    });

    it("rejects missing method", () => {
      expect(() =>
        ExecuteMethodInputSchema.parse({
          model: "res.partner",
        }),
      ).toThrow();
    });
  });

  describe("executeMethod", () => {
    it("executes a simple method call", async () => {
      vi.mocked(mockClient.execute).mockResolvedValue([1, 2, 3]);

      const result = await executeMethod(mockClient, {
        model: "res.partner",
        method: "read",
        args: [[1, 2, 3]],
        kwargs: { fields: ["name"] },
      });

      expect(result.success).toBe(true);
      expect(result.result).toEqual([1, 2, 3]);
      expect(mockClient.execute).toHaveBeenCalledWith(
        "res.partner",
        "read",
        [[1, 2, 3]],
        { fields: ["name"] },
      );
    });

    it("normalizes domain for search method", async () => {
      vi.mocked(mockClient.execute).mockResolvedValue([1, 2]);

      await executeMethod(mockClient, {
        model: "res.partner",
        method: "search",
        args: [["name", "=", "test"]], // single condition, not wrapped
        kwargs: {},
      });

      expect(mockClient.execute).toHaveBeenCalledWith(
        "res.partner",
        "search",
        [[["name", "=", "test"]]], // normalized to proper domain
        {},
      );
    });

    it("normalizes domain for search_read method", async () => {
      vi.mocked(mockClient.execute).mockResolvedValue([]);

      await executeMethod(mockClient, {
        model: "res.partner",
        method: "search_read",
        args: [[["active", "=", true]]],
        kwargs: { fields: ["name"] },
      });

      expect(mockClient.execute).toHaveBeenCalledWith(
        "res.partner",
        "search_read",
        [[["active", "=", true]]],
        { fields: ["name"] },
      );
    });

    it("normalizes domain for search_count method", async () => {
      vi.mocked(mockClient.execute).mockResolvedValue(42);

      await executeMethod(mockClient, {
        model: "res.partner",
        method: "search_count",
        args: [[["is_company", "=", true]]],
        kwargs: {},
      });

      expect(mockClient.execute).toHaveBeenCalledWith(
        "res.partner",
        "search_count",
        [[["is_company", "=", true]]],
        {},
      );
    });

    it("unwraps double-wrapped domains", async () => {
      vi.mocked(mockClient.execute).mockResolvedValue([]);

      await executeMethod(mockClient, {
        model: "res.partner",
        method: "search",
        args: [[[["name", "=", "test"]]]],
        kwargs: {},
      });

      expect(mockClient.execute).toHaveBeenCalledWith(
        "res.partner",
        "search",
        [[["name", "=", "test"]]],
        {},
      );
    });

    it("does not normalize domain for non-search methods", async () => {
      vi.mocked(mockClient.execute).mockResolvedValue(true);

      await executeMethod(mockClient, {
        model: "res.partner",
        method: "write",
        args: [[1], { name: "Updated" }],
        kwargs: {},
      });

      // Args should be passed as-is
      expect(mockClient.execute).toHaveBeenCalledWith(
        "res.partner",
        "write",
        [[1], { name: "Updated" }],
        {},
      );
    });

    it("returns error on client failure", async () => {
      vi.mocked(mockClient.execute).mockRejectedValue(
        new Error("Access denied"),
      );

      const result = await executeMethod(mockClient, {
        model: "res.partner",
        method: "search",
        args: [[]],
        kwargs: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Access denied");
    });

    it("handles empty kwargs", async () => {
      vi.mocked(mockClient.execute).mockResolvedValue([]);

      await executeMethod(mockClient, {
        model: "res.partner",
        method: "search",
        args: [[]],
        kwargs: {},
      });

      expect(mockClient.execute).toHaveBeenCalledWith(
        "res.partner",
        "search",
        [[]],
        {},
      );
    });
  });
});
