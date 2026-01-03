import { beforeEach, describe, expect, it, vi } from "vitest";

// Create mock functions
const mockMethodCall = vi.fn();

// Mock the XmlRpcClient module
vi.mock("./xmlrpc.js", () => ({
  XmlRpcClient: class MockXmlRpcClient {
    options: unknown;
    constructor(options: unknown) {
      this.options = options;
      MockXmlRpcClient.instances.push(this);
    }
    methodCall = mockMethodCall;
    static instances: MockXmlRpcClient[] = [];
    static clear() {
      MockXmlRpcClient.instances = [];
    }
  },
}));

import { OdooClient } from "./odoo-client.js";
import { XmlRpcClient } from "./xmlrpc.js";

// Type for the mocked class
const MockXmlRpcClient = XmlRpcClient as unknown as {
  instances: Array<{ options: unknown; methodCall: typeof mockMethodCall }>;
  clear: () => void;
};

describe("OdooClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockXmlRpcClient.clear();
  });

  describe("constructor", () => {
    it("creates client with normalized URL", () => {
      new OdooClient({
        url: "example.com",
        db: "test",
        username: "admin",
        password: "admin",
      });

      expect(MockXmlRpcClient.instances[0].options).toMatchObject({
        url: "http://example.com",
        path: "/xmlrpc/2/common",
      });
    });

    it("removes trailing slash from URL", () => {
      new OdooClient({
        url: "https://example.com/",
        db: "test",
        username: "admin",
        password: "admin",
      });

      expect(MockXmlRpcClient.instances[0].options).toMatchObject({
        url: "https://example.com",
      });
    });

    it("preserves https protocol", () => {
      new OdooClient({
        url: "https://secure.example.com",
        db: "test",
        username: "admin",
        password: "admin",
      });

      expect(MockXmlRpcClient.instances[0].options).toMatchObject({
        url: "https://secure.example.com",
      });
    });

    it("uses default options when not provided", () => {
      new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "admin",
      });

      expect(MockXmlRpcClient.instances[0].options).toMatchObject({
        timeout: 30000,
        verifySsl: true,
      });
    });

    it("uses custom options when provided", () => {
      new OdooClient(
        {
          url: "https://example.com",
          db: "test",
          username: "admin",
          password: "admin",
        },
        {
          timeout: 60000,
          verifySsl: false,
        },
      );

      expect(MockXmlRpcClient.instances[0].options).toMatchObject({
        timeout: 60000,
        verifySsl: false,
      });
    });

    it("creates both common and object clients", () => {
      new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "admin",
      });

      expect(MockXmlRpcClient.instances).toHaveLength(2);
      expect(MockXmlRpcClient.instances[0].options).toMatchObject({
        path: "/xmlrpc/2/common",
      });
      expect(MockXmlRpcClient.instances[1].options).toMatchObject({
        path: "/xmlrpc/2/object",
      });
    });
  });

  describe("connect", () => {
    it("authenticates successfully with valid credentials", async () => {
      mockMethodCall.mockResolvedValue(42);

      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "secret",
      });

      await expect(client.connect()).resolves.toBeUndefined();

      expect(mockMethodCall).toHaveBeenCalledWith("authenticate", [
        "test",
        "admin",
        "secret",
        {},
      ]);
    });

    it("throws error when authentication returns false", async () => {
      mockMethodCall.mockResolvedValue(false);

      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "wrong",
      });

      await expect(client.connect()).rejects.toThrow(
        "Authentication failed: Invalid username or password",
      );
    });

    it("throws error when authentication returns 0", async () => {
      mockMethodCall.mockResolvedValue(0);

      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "wrong",
      });

      await expect(client.connect()).rejects.toThrow(
        "Authentication failed: Invalid username or password",
      );
    });

    it("propagates XML-RPC errors", async () => {
      mockMethodCall.mockRejectedValue(new Error("Connection refused"));

      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "admin",
      });

      await expect(client.connect()).rejects.toThrow("Connection refused");
    });
  });

  describe("execute", () => {
    it("throws error when not connected", async () => {
      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "admin",
      });

      await expect(
        client.execute("res.partner", "search", [[]]),
      ).rejects.toThrow("Not connected. Call connect() first.");
    });

    it("executes method after connection", async () => {
      mockMethodCall
        .mockResolvedValueOnce(42) // auth returns uid
        .mockResolvedValueOnce([1, 2, 3]); // execute returns data

      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "secret",
      });

      await client.connect();
      const result = await client.execute("res.partner", "search", [[]]);

      expect(result).toEqual([1, 2, 3]);
      expect(mockMethodCall).toHaveBeenLastCalledWith("execute_kw", [
        "test",
        42,
        "secret",
        "res.partner",
        "search",
        [[]],
        {},
      ]);
    });

    it("passes kwargs correctly", async () => {
      mockMethodCall
        .mockResolvedValueOnce(42) // auth
        .mockResolvedValueOnce([]); // execute

      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "secret",
      });

      await client.connect();
      await client.execute("res.partner", "search_read", [[]], {
        fields: ["name", "email"],
        limit: 10,
      });

      expect(mockMethodCall).toHaveBeenLastCalledWith("execute_kw", [
        "test",
        42,
        "secret",
        "res.partner",
        "search_read",
        [[]],
        { fields: ["name", "email"], limit: 10 },
      ]);
    });
  });

  describe("getModels", () => {
    it("returns list of models", async () => {
      mockMethodCall
        .mockResolvedValueOnce(42) // auth
        .mockResolvedValueOnce([1, 2]) // search
        .mockResolvedValueOnce([
          // read
          { id: 1, model: "res.partner", name: "Contact" },
          { id: 2, model: "res.users", name: "Users" },
        ]);

      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "secret",
      });

      await client.connect();
      const result = await client.getModels();

      expect(result.model_names).toEqual(["res.partner", "res.users"]);
      expect(result.models_details).toEqual({
        "res.partner": { name: "Contact" },
        "res.users": { name: "Users" },
      });
    });

    it("returns empty when no models found", async () => {
      mockMethodCall
        .mockResolvedValueOnce(42) // auth
        .mockResolvedValueOnce([]); // search returns empty

      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "secret",
      });

      await client.connect();
      const result = await client.getModels();

      expect(result.model_names).toEqual([]);
      expect(result.error).toBe("No models found");
    });

    it("returns error on failure", async () => {
      mockMethodCall
        .mockResolvedValueOnce(42) // auth
        .mockRejectedValueOnce(new Error("Access denied")); // search fails

      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "secret",
      });

      await client.connect();
      const result = await client.getModels();

      expect(result.error).toContain("Access denied");
    });
  });

  describe("getModelInfo", () => {
    it("returns model info", async () => {
      mockMethodCall
        .mockResolvedValueOnce(42) // auth
        .mockResolvedValueOnce([
          { id: 1, name: "Contact", model: "res.partner" },
        ]);

      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "secret",
      });

      await client.connect();
      const result = await client.getModelInfo("res.partner");

      expect(result).toEqual({ id: 1, name: "Contact", model: "res.partner" });
    });

    it("returns error when model not found", async () => {
      mockMethodCall
        .mockResolvedValueOnce(42) // auth
        .mockResolvedValueOnce([]); // search_read returns empty

      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "secret",
      });

      await client.connect();
      const result = await client.getModelInfo("nonexistent.model");

      expect(result).toEqual({ error: "Model nonexistent.model not found" });
    });
  });

  describe("searchRead", () => {
    it("executes search_read with domain and options", async () => {
      mockMethodCall
        .mockResolvedValueOnce(42) // auth
        .mockResolvedValueOnce([{ id: 1, name: "Test" }]);

      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "secret",
      });

      await client.connect();
      const result = await client.searchRead(
        "res.partner",
        [["is_company", "=", true]],
        { fields: ["name"], limit: 10, order: "name asc" },
      );

      expect(result).toEqual([{ id: 1, name: "Test" }]);
      expect(mockMethodCall).toHaveBeenLastCalledWith("execute_kw", [
        "test",
        42,
        "secret",
        "res.partner",
        "search_read",
        [[["is_company", "=", true]]],
        { fields: ["name"], limit: 10, order: "name asc" },
      ]);
    });
  });

  describe("readRecords", () => {
    it("reads records by ID", async () => {
      mockMethodCall
        .mockResolvedValueOnce(42) // auth
        .mockResolvedValueOnce([
          { id: 1, name: "Test 1" },
          { id: 2, name: "Test 2" },
        ]);

      const client = new OdooClient({
        url: "https://example.com",
        db: "test",
        username: "admin",
        password: "secret",
      });

      await client.connect();
      const result = await client.readRecords("res.partner", [1, 2], ["name"]);

      expect(result).toEqual([
        { id: 1, name: "Test 1" },
        { id: 2, name: "Test 2" },
      ]);
    });
  });
});
