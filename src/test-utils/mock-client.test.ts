import { describe, expect, it } from "vitest";
import {
  createMockClient,
  MockClientBuilder,
  mockClient,
} from "./mock-client.js";

describe("mock-client", () => {
  describe("createMockClient", () => {
    it("should create client with default empty config", async () => {
      const client = createMockClient();

      // getModels returns empty by default
      const models = await client.getModels();
      expect(models).toEqual({ model_names: [], models_details: {} });
    });

    it("should throw for unconfigured execute calls", async () => {
      const client = createMockClient();

      await expect(client.execute("res.partner", "search", [])).rejects.toThrow(
        "Mock not configured for execute: res.partner.search",
      );
    });

    it("should return configured execute result", async () => {
      const executeResults = new Map();
      executeResults.set("res.partner.read", [{ id: 1, name: "Test" }]);

      const client = createMockClient({ executeResults });

      const result = await client.execute("res.partner", "read", [[1]]);
      expect(result).toEqual([{ id: 1, name: "Test" }]);
    });

    it("should throw configured execute error", async () => {
      const executeErrors = new Map();
      executeErrors.set("res.partner.delete", new Error("Access denied"));

      const client = createMockClient({ executeErrors });

      await expect(
        client.execute("res.partner", "delete", [[1]]),
      ).rejects.toThrow("Access denied");
    });

    it("should prioritize error over result", async () => {
      const executeResults = new Map();
      executeResults.set("res.partner.write", { success: true });

      const executeErrors = new Map();
      executeErrors.set("res.partner.write", new Error("Error takes priority"));

      const client = createMockClient({ executeResults, executeErrors });

      await expect(
        client.execute("res.partner", "write", [[1], {}]),
      ).rejects.toThrow("Error takes priority");
    });

    it("should return configured models", async () => {
      const models = {
        model_names: ["res.partner", "res.users"],
        models_details: { "res.partner": { name: "Contact" } },
      };

      const client = createMockClient({ models });

      const result = await client.getModels();
      expect(result).toEqual(models);
    });

    it("should return configured model info", async () => {
      const modelInfo = new Map();
      modelInfo.set("res.partner", { model: "res.partner", name: "Contact" });

      const client = createMockClient({ modelInfo });

      const result = await client.getModelInfo("res.partner");
      expect(result).toEqual({ model: "res.partner", name: "Contact" });
    });

    it("should return error for unconfigured model info", async () => {
      const client = createMockClient();

      const result = await client.getModelInfo("unknown.model");
      expect(result).toEqual({ error: "Model unknown.model not found" });
    });

    it("should return configured model fields", async () => {
      const modelFields = new Map();
      modelFields.set("res.partner", {
        name: { type: "char", string: "Name" },
      });

      const client = createMockClient({ modelFields });

      const result = await client.getModelFields("res.partner");
      expect(result).toEqual({ name: { type: "char", string: "Name" } });
    });

    it("should return error for unconfigured model fields", async () => {
      const client = createMockClient();

      const result = await client.getModelFields("unknown.model");
      expect(result).toEqual({ error: "Model unknown.model not found" });
    });

    it("should return configured searchRead results", async () => {
      const searchReadResults = new Map();
      searchReadResults.set("res.partner", [{ id: 1 }, { id: 2 }]);

      const client = createMockClient({ searchReadResults });

      const result = await client.searchRead("res.partner", []);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("should return empty array for unconfigured searchRead", async () => {
      const client = createMockClient();

      const result = await client.searchRead("res.partner", []);
      expect(result).toEqual([]);
    });

    it("should return configured readRecords results by key", async () => {
      const readRecordsResults = new Map();
      readRecordsResults.set("res.partner:1,2", [
        { id: 1, name: "A" },
        { id: 2, name: "B" },
      ]);

      const client = createMockClient({ readRecordsResults });

      const result = await client.readRecords("res.partner", [1, 2]);
      expect(result).toEqual([
        { id: 1, name: "A" },
        { id: 2, name: "B" },
      ]);
    });

    it("should fallback to model name for readRecords", async () => {
      const readRecordsResults = new Map();
      readRecordsResults.set("res.partner", [{ id: 99, name: "Fallback" }]);

      const client = createMockClient({ readRecordsResults });

      // Request with different IDs, should fallback to model name
      const result = await client.readRecords("res.partner", [5, 10]);
      expect(result).toEqual([{ id: 99, name: "Fallback" }]);
    });

    it("should return empty array for unconfigured readRecords", async () => {
      const client = createMockClient();

      const result = await client.readRecords("res.partner", [1]);
      expect(result).toEqual([]);
    });
  });

  describe("MockClientBuilder", () => {
    it("should build client with fluent API", async () => {
      const client = new MockClientBuilder()
        .withExecuteResult("res.partner", "search", [1, 2, 3])
        .build();

      const result = await client.execute("res.partner", "search", [[]]);
      expect(result).toEqual([1, 2, 3]);
    });

    it("should configure execute errors", async () => {
      const client = new MockClientBuilder()
        .withExecuteError("res.partner", "unlink", new Error("Cannot delete"))
        .build();

      await expect(
        client.execute("res.partner", "unlink", [[1]]),
      ).rejects.toThrow("Cannot delete");
    });

    it("should configure models", async () => {
      const client = new MockClientBuilder()
        .withModels({
          model_names: ["sale.order"],
          models_details: { "sale.order": { name: "Sales Order" } },
        })
        .build();

      const result = await client.getModels();
      expect(result.model_names).toContain("sale.order");
    });

    it("should configure model info", async () => {
      const client = new MockClientBuilder()
        .withModelInfo("sale.order", { model: "sale.order", name: "Sales" })
        .build();

      const result = await client.getModelInfo("sale.order");
      expect(result).toEqual({ model: "sale.order", name: "Sales" });
    });

    it("should configure model fields", async () => {
      const client = new MockClientBuilder()
        .withModelFields("sale.order", {
          name: { type: "char", string: "Name" },
          amount: { type: "float", string: "Amount" },
        })
        .build();

      const result = await client.getModelFields("sale.order");
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("amount");
    });

    it("should configure searchRead results", async () => {
      const client = new MockClientBuilder()
        .withSearchReadResults("sale.order", [{ id: 1, name: "SO001" }])
        .build();

      const result = await client.searchRead("sale.order", []);
      expect(result).toEqual([{ id: 1, name: "SO001" }]);
    });

    it("should configure readRecords results", async () => {
      const client = new MockClientBuilder()
        .withReadRecordsResults("sale.order:1", [{ id: 1, name: "SO001" }])
        .build();

      const result = await client.readRecords("sale.order", [1]);
      expect(result).toEqual([{ id: 1, name: "SO001" }]);
    });

    it("should support method chaining", () => {
      const builder = new MockClientBuilder()
        .withExecuteResult("a", "b", 1)
        .withExecuteError("c", "d", new Error("e"))
        .withModels({ model_names: [], models_details: {} })
        .withModelInfo("f", { model: "f", name: "F" })
        .withModelFields("g", {})
        .withSearchReadResults("h", [])
        .withReadRecordsResults("i", []);

      expect(builder).toBeInstanceOf(MockClientBuilder);
    });
  });

  describe("mockClient helper", () => {
    it("should return a MockClientBuilder instance", () => {
      const builder = mockClient();

      expect(builder).toBeInstanceOf(MockClientBuilder);
    });

    it("should be usable with fluent API", async () => {
      const client = mockClient()
        .withExecuteResult("res.partner", "check", true)
        .build();

      const result = await client.execute("res.partner", "check", []);
      expect(result).toBe(true);
    });
  });
});
