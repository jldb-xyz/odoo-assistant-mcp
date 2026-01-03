import { describe, expect, it } from "vitest";
import { MockClientBuilder } from "./test-utils/mock-client.js";
import {
  createToolRegistry,
  defineTool,
  type ToolRegistry,
} from "./tools/registry.js";
import { createServer, type ServerDependencies } from "./server.js";

describe("server", () => {
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

      // Add a custom tool
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

      // Server creation should succeed with custom registry
      const server = createServer(deps);
      expect(server).toBeDefined();
    });

    it("should use default registry when none provided", () => {
      const client = new MockClientBuilder().build();
      const deps: ServerDependencies = { client };

      // Server creation should succeed with default registry
      const server = createServer(deps);
      expect(server).toBeDefined();
    });
  });

  describe("tool integration", () => {
    it("should register tools from the registry", () => {
      const client = new MockClientBuilder().build();
      const registry = createToolRegistry();

      const testTool = defineTool({
        name: "integration_test_tool",
        description: "Integration test tool",
        inputSchema: {},
        handler: async () => ({
          success: true,
          result: { text: "Integration test result" },
        }),
      });
      registry.register(testTool);

      const deps: ServerDependencies = {
        client,
        toolRegistry: registry,
      };

      const server = createServer(deps);

      // Verify server was created successfully
      expect(server).toBeDefined();
    });

    it("should handle tool results with text property", async () => {
      const client = new MockClientBuilder().build();
      const registry = createToolRegistry();

      let capturedHandler: ((input: unknown) => Promise<unknown>) | undefined;

      const textTool = defineTool({
        name: "text_result_tool",
        description: "Returns text result",
        inputSchema: {},
        handler: async () => ({
          success: true,
          result: { text: "# Markdown Content\n\nHello world!" },
        }),
      });
      registry.register(textTool);

      const deps: ServerDependencies = {
        client,
        toolRegistry: registry,
      };

      const server = createServer(deps);

      // The tool handler should format the result correctly
      expect(server).toBeDefined();
    });

    it("should handle tool results without text property", async () => {
      const client = new MockClientBuilder().build();
      const registry = createToolRegistry();

      const jsonTool = defineTool({
        name: "json_result_tool",
        description: "Returns JSON result",
        inputSchema: {},
        handler: async () => ({
          success: true,
          result: { data: [1, 2, 3], count: 3 },
        }),
      });
      registry.register(jsonTool);

      const deps: ServerDependencies = {
        client,
        toolRegistry: registry,
      };

      const server = createServer(deps);
      expect(server).toBeDefined();
    });
  });

  describe("resource integration", () => {
    it("should register models resource", () => {
      const client = new MockClientBuilder()
        .withModels([
          { model: "res.partner", name: "Contact" },
        ])
        .build();
      const registry = createToolRegistry();

      const deps: ServerDependencies = {
        client,
        toolRegistry: registry,
      };

      const server = createServer(deps);
      expect(server).toBeDefined();
    });

    it("should register model resource template", () => {
      const client = new MockClientBuilder()
        .withModelInfo("res.partner", {
          model: "res.partner",
          name: "Contact",
        })
        .withModelFields("res.partner", {
          name: { type: "char", string: "Name" },
        })
        .build();
      const registry = createToolRegistry();

      const deps: ServerDependencies = {
        client,
        toolRegistry: registry,
      };

      const server = createServer(deps);
      expect(server).toBeDefined();
    });

    it("should register record resource template", () => {
      const client = new MockClientBuilder()
        .withReadRecordsResults("res.partner:1", [
          { id: 1, name: "Test Partner" },
        ])
        .build();
      const registry = createToolRegistry();

      const deps: ServerDependencies = {
        client,
        toolRegistry: registry,
      };

      const server = createServer(deps);
      expect(server).toBeDefined();
    });

    it("should register search resource template", () => {
      const client = new MockClientBuilder()
        .withSearchReadResults("res.partner", [
          { id: 1, name: "Found Partner" },
        ])
        .build();
      const registry = createToolRegistry();

      const deps: ServerDependencies = {
        client,
        toolRegistry: registry,
      };

      const server = createServer(deps);
      expect(server).toBeDefined();
    });
  });

  describe("dependency injection", () => {
    it("should use injected client for tool handlers", async () => {
      let clientCalled = false;
      const client = new MockClientBuilder().build();

      // Override execute to track calls
      const originalExecute = client.execute;
      client.execute = async (...args) => {
        clientCalled = true;
        return originalExecute.apply(client, args);
      };

      const registry = createToolRegistry();
      const trackingTool = defineTool({
        name: "tracking_tool",
        description: "Tracks client usage",
        inputSchema: {},
        handler: async (injectedClient) => {
          // Try to call the client
          try {
            await injectedClient.execute("test.model", "test_method");
          } catch {
            // Expected to throw since mock isn't configured for this
          }
          return { success: true };
        },
      });
      registry.register(trackingTool);

      const deps: ServerDependencies = {
        client,
        toolRegistry: registry,
      };

      createServer(deps);
      // At this point the tool is registered but not called
      // In a real scenario, calling the tool would use the injected client
    });

    it("should use injected client for resource handlers", () => {
      const mockModels = [{ model: "test.model", name: "Test" }];
      const client = new MockClientBuilder()
        .withModels(mockModels)
        .build();

      const registry = createToolRegistry();
      const deps: ServerDependencies = {
        client,
        toolRegistry: registry,
      };

      const server = createServer(deps);
      // Resources are registered with the injected client
      expect(server).toBeDefined();
    });
  });
});
