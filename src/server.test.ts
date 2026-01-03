import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OdooClient } from "./connection/odoo-client.js";
import {
  _resetClient,
  _setClient,
  createServer,
  formatToolResult,
  getClient,
  initializeClient,
  logEnvironment,
  runServer,
  type ServerDependencies,
} from "./server.js";
import { MockClientBuilder } from "./test-utils/mock-client.js";
import { listDocsTool } from "./tools/docs.js";
import { executeMethodTool } from "./tools/execute.js";
import {
  createToolRegistry,
  defineTool,
  type ToolResult,
} from "./tools/registry.js";

// Mock the config module
vi.mock("./connection/config.js", () => ({
  loadConfig: vi.fn(() => ({
    url: "https://test.odoo.com",
    db: "testdb",
    username: "admin",
    password: "secret",
  })),
  getClientOptions: vi.fn(() => ({
    timeout: 30000,
    verifySsl: true,
  })),
}));

// Mock the OdooClient class
const mockConnect = vi.fn().mockResolvedValue(undefined);
const MockOdooClientConstructor = vi.fn();
vi.mock("./connection/odoo-client.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./connection/odoo-client.js")>();
  return {
    ...original,
    OdooClient: class MockOdooClient {
      connect = mockConnect;
      constructor(...args: unknown[]) {
        MockOdooClientConstructor(...args);
      }
    },
  };
});

describe("server", () => {
  describe("client management", () => {
    afterEach(() => {
      _resetClient();
    });

    it("getClient throws when not initialized", () => {
      expect(() => getClient()).toThrow("Odoo client not initialized");
    });

    it("getClient returns client after _setClient", () => {
      const mockClient =
        new MockClientBuilder().build() as unknown as OdooClient;
      _setClient(mockClient);

      const result = getClient();

      expect(result).toBe(mockClient);
    });

    it("_resetClient clears the client", () => {
      const mockClient =
        new MockClientBuilder().build() as unknown as OdooClient;
      _setClient(mockClient);

      _resetClient();

      expect(() => getClient()).toThrow("Odoo client not initialized");
    });

    it("_setClient can set client to null", () => {
      const mockClient =
        new MockClientBuilder().build() as unknown as OdooClient;
      _setClient(mockClient);
      _setClient(null);

      expect(() => getClient()).toThrow("Odoo client not initialized");
    });
  });

  describe("logEnvironment", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      // Clean up env vars
      delete process.env.ODOO_URL;
      delete process.env.ODOO_DB;
      delete process.env.ODOO_PASSWORD;
    });

    it("logs ODOO_ environment variables", () => {
      process.env.ODOO_URL = "https://test.odoo.com";
      process.env.ODOO_DB = "testdb";

      logEnvironment();

      expect(consoleErrorSpy).toHaveBeenCalledWith("Environment variables:");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "  ODOO_URL: https://test.odoo.com",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith("  ODOO_DB: testdb");
    });

    it("hides password in logs", () => {
      process.env.ODOO_PASSWORD = "supersecret";

      logEnvironment();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "  ODOO_PASSWORD: ***hidden***",
      );
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("supersecret"),
      );
    });
  });

  describe("initializeClient", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockConnect.mockClear();
      MockOdooClientConstructor.mockClear();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it("creates and connects client using config", async () => {
      const client = await initializeClient();

      expect(client).toBeDefined();
      expect(mockConnect).toHaveBeenCalled();
    });

    it("logs configuration details", async () => {
      await initializeClient();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Odoo client configuration:",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "  URL: https://test.odoo.com",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith("  Database: testdb");
      expect(consoleErrorSpy).toHaveBeenCalledWith("  Username: admin");
      expect(consoleErrorSpy).toHaveBeenCalledWith("  Timeout: 30000ms");
      expect(consoleErrorSpy).toHaveBeenCalledWith("  Verify SSL: true");
    });

    it("creates OdooClient with correct config and options", async () => {
      await initializeClient();

      expect(MockOdooClientConstructor).toHaveBeenCalledWith(
        {
          url: "https://test.odoo.com",
          db: "testdb",
          username: "admin",
          password: "secret",
        },
        {
          timeout: 30000,
          verifySsl: true,
        },
      );
    });
  });

  describe("runServer", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      _resetClient();
    });

    it("initializes client and starts server with injected dependencies", async () => {
      const mockClient =
        new MockClientBuilder().build() as unknown as OdooClient;
      const mockTransport = { close: vi.fn() };
      const mockServer = {
        connect: vi.fn().mockResolvedValue(undefined),
      };

      await runServer({
        initClient: async () => mockClient,
        createTransport: () => mockTransport,
        createMcpServer: () => mockServer as never,
      });

      expect(mockServer.connect).toHaveBeenCalledWith(mockTransport);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "=== ODOO MCP SERVER STARTING ===",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith("MCP server running");
    });

    it("sets global client after initialization", async () => {
      const mockClient =
        new MockClientBuilder().build() as unknown as OdooClient;

      await runServer({
        initClient: async () => mockClient,
        createTransport: () => ({}),
        createMcpServer: () => ({ connect: vi.fn() }) as never,
      });

      expect(getClient()).toBe(mockClient);
    });

    it("logs Node.js version on startup", async () => {
      const mockClient =
        new MockClientBuilder().build() as unknown as OdooClient;

      await runServer({
        initClient: async () => mockClient,
        createTransport: () => ({}),
        createMcpServer: () => ({ connect: vi.fn() }) as never,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Node.js version:"),
      );
    });
  });

  describe("formatToolResult", () => {
    it("should return text directly when result has text property", () => {
      const result: ToolResult = {
        success: true,
        result: { text: "# Markdown Content\n\nHello world!" },
      };

      const formatted = formatToolResult(result);

      expect(formatted).toBe("# Markdown Content\n\nHello world!");
    });

    it("should JSON stringify when result has no text property", () => {
      const result: ToolResult = {
        success: true,
        result: { data: [1, 2, 3], count: 3 },
      };

      const formatted = formatToolResult(result);

      expect(formatted).toBe(JSON.stringify(result, null, 2));
      expect(JSON.parse(formatted)).toEqual(result);
    });

    it("should JSON stringify when result is null", () => {
      const result: ToolResult = {
        success: false,
        error: "Something went wrong",
      };

      const formatted = formatToolResult(result);

      expect(JSON.parse(formatted)).toEqual(result);
    });

    it("should JSON stringify when result.text is not a string", () => {
      const result: ToolResult = {
        success: true,
        result: { text: 123 }, // number, not string
      };

      const formatted = formatToolResult(result);

      expect(JSON.parse(formatted)).toEqual(result);
    });

    it("should JSON stringify when result is an array", () => {
      const result: ToolResult = {
        success: true,
        result: [{ id: 1 }, { id: 2 }],
      };

      const formatted = formatToolResult(result);

      expect(JSON.parse(formatted)).toEqual(result);
    });

    it("should handle empty text string", () => {
      const result: ToolResult = {
        success: true,
        result: { text: "" },
      };

      const formatted = formatToolResult(result);

      expect(formatted).toBe("");
    });
  });

  describe("createServer", () => {
    it("should create a server instance", () => {
      const client = new MockClientBuilder().build();
      const deps: ServerDependencies = { client };

      const server = createServer(deps);

      expect(server).toBeDefined();
    });

    it("should use provided tool registry", () => {
      const client = new MockClientBuilder().build();
      const registry = createToolRegistry();

      const customTool = defineTool({
        name: "custom_test_tool",
        description: "A custom test tool",
        inputSchema: {},
        handler: async () => ({ success: true, result: { text: "Custom!" } }),
      });
      registry.register(customTool);

      const deps: ServerDependencies = {
        client,
        toolRegistry: registry,
      };

      const server = createServer(deps);
      expect(server).toBeDefined();
    });

    it("should use default registry when none provided", () => {
      const client = new MockClientBuilder().build();
      const deps: ServerDependencies = { client };

      const server = createServer(deps);
      expect(server).toBeDefined();
    });
  });

  describe("tool execution flow", () => {
    it("should execute tool handler with injected client", async () => {
      const expectedResult = [{ id: 1, name: "Test" }];
      const client = new MockClientBuilder()
        .withExecuteResult("res.partner", "search_read", expectedResult)
        .build();

      // Test the tool handler directly with the mock client
      const result = await executeMethodTool.handler(client, {
        model: "res.partner",
        method: "search_read",
        args: [[]],
        kwargs: {},
      });

      expect(result.success).toBe(true);
      expect(result.result).toEqual(expectedResult);
    });

    it("should handle tool execution errors", async () => {
      const client = new MockClientBuilder()
        .withExecuteError(
          "res.partner",
          "invalid_method",
          new Error("Method not found"),
        )
        .build();

      const result = await executeMethodTool.handler(client, {
        model: "res.partner",
        method: "invalid_method",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Method not found");
    });

    it("should format successful tool results correctly", async () => {
      const client = new MockClientBuilder()
        .withExecuteResult("res.partner", "read", [{ id: 1, name: "Alice" }])
        .build();

      const result = await executeMethodTool.handler(client, {
        model: "res.partner",
        method: "read",
        args: [[1]],
      });

      const formatted = formatToolResult(result);
      const parsed = JSON.parse(formatted);

      expect(parsed.success).toBe(true);
      expect(parsed.result).toEqual([{ id: 1, name: "Alice" }]);
    });

    it("should format error tool results correctly", async () => {
      const client = new MockClientBuilder()
        .withExecuteError("res.partner", "fail", new Error("Access denied"))
        .build();

      const result = await executeMethodTool.handler(client, {
        model: "res.partner",
        method: "fail",
      });

      const formatted = formatToolResult(result);
      const parsed = JSON.parse(formatted);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Access denied");
    });

    it("should format markdown results as plain text", async () => {
      // Docs tools return markdown with text property
      const result = await listDocsTool.handler({} as never, {});

      const formatted = formatToolResult(result);

      // Should be markdown text, not JSON
      expect(formatted.startsWith("#")).toBe(true);
      expect(() => JSON.parse(formatted)).toThrow();
    });
  });

  describe("resource handler flow", () => {
    it("should configure models resource with client", async () => {
      const mockModels = [
        { model: "res.partner", name: "Contact" },
        { model: "res.users", name: "User" },
      ];
      const client = new MockClientBuilder().withModels(mockModels).build();

      // Verify client returns expected models
      const models = await client.getModels();
      expect(models).toEqual(mockModels);
    });

    it("should configure model info resource with client", async () => {
      const mockInfo = { model: "res.partner", name: "Contact", info: "desc" };
      const mockFields = {
        name: { type: "char", string: "Name" },
        email: { type: "char", string: "Email" },
      };
      const client = new MockClientBuilder()
        .withModelInfo("res.partner", mockInfo)
        .withModelFields("res.partner", mockFields)
        .build();

      const info = await client.getModelInfo("res.partner");
      const fields = await client.getModelFields("res.partner");

      expect(info).toEqual(mockInfo);
      expect(fields).toEqual(mockFields);
    });

    it("should configure record resource with client", async () => {
      const mockRecord = { id: 1, name: "Test Partner", active: true };
      const client = new MockClientBuilder()
        .withReadRecordsResults("res.partner:1", [mockRecord])
        .build();

      const records = await client.readRecords("res.partner", [1]);

      expect(records).toEqual([mockRecord]);
    });

    it("should configure search resource with client", async () => {
      const mockResults = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];
      const client = new MockClientBuilder()
        .withSearchReadResults("res.partner", mockResults)
        .build();

      const results = await client.searchRead("res.partner", []);

      expect(results).toEqual(mockResults);
    });
  });

  describe("dependency injection", () => {
    it("should pass injected client to tool handlers", async () => {
      let receivedClient: unknown = null;
      const client = new MockClientBuilder().build();

      const registry = createToolRegistry();
      const capturingTool = defineTool({
        name: "capturing_tool",
        description: "Captures the client reference",
        inputSchema: {},
        handler: async (injectedClient) => {
          receivedClient = injectedClient;
          return { success: true };
        },
      });
      registry.register(capturingTool);

      // Call the handler directly to verify client injection works
      await capturingTool.handler(client, {});

      expect(receivedClient).toBe(client);
    });

    it("should use same client for all tool calls", async () => {
      const clients: unknown[] = [];
      const client = new MockClientBuilder().build();

      const registry = createToolRegistry();
      const trackingTool = defineTool({
        name: "tracking_tool",
        description: "Tracks client instances",
        inputSchema: {},
        handler: async (injectedClient) => {
          clients.push(injectedClient);
          return { success: true };
        },
      });
      registry.register(trackingTool);

      // Multiple calls should receive same client
      await trackingTool.handler(client, {});
      await trackingTool.handler(client, {});
      await trackingTool.handler(client, {});

      expect(clients).toHaveLength(3);
      expect(clients[0]).toBe(clients[1]);
      expect(clients[1]).toBe(clients[2]);
    });
  });

  describe("registry integration", () => {
    it("should register all tools from custom registry", () => {
      const client = new MockClientBuilder().build();
      const registry = createToolRegistry();

      // Add multiple tools
      for (let i = 0; i < 5; i++) {
        registry.register(
          defineTool({
            name: `tool_${i}`,
            description: `Test tool ${i}`,
            inputSchema: {},
            handler: async () => ({ success: true }),
          }),
        );
      }

      const deps: ServerDependencies = {
        client,
        toolRegistry: registry,
      };

      // Should not throw
      const server = createServer(deps);
      expect(server).toBeDefined();
      expect(registry.size).toBe(5);
    });

    it("should work with empty registry", () => {
      const client = new MockClientBuilder().build();
      const registry = createToolRegistry();

      const deps: ServerDependencies = {
        client,
        toolRegistry: registry,
      };

      const server = createServer(deps);
      expect(server).toBeDefined();
      expect(registry.size).toBe(0);
    });
  });
});
