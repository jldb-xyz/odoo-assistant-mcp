import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createToolRegistry,
  defineTool,
  type ToolDefinition,
  ToolRegistry,
} from "./registry.js";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  // Helper to create a mock tool definition
  function createMockTool(name: string): ToolDefinition {
    return {
      name,
      description: `Description for ${name}`,
      inputSchema: { input: z.string() },
      handler: async () => ({ success: true }),
    };
  }

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe("register", () => {
    it("should register a new tool", () => {
      const tool = createMockTool("test-tool");
      registry.register(tool);

      expect(registry.has("test-tool")).toBe(true);
      expect(registry.size).toBe(1);
    });

    it("should throw error when registering duplicate tool", () => {
      const tool = createMockTool("duplicate-tool");
      registry.register(tool);

      expect(() => registry.register(tool)).toThrow(
        'Tool "duplicate-tool" is already registered',
      );
    });

    it("should allow registering multiple different tools", () => {
      registry.register(createMockTool("tool-1"));
      registry.register(createMockTool("tool-2"));
      registry.register(createMockTool("tool-3"));

      expect(registry.size).toBe(3);
    });
  });

  describe("get", () => {
    it("should return registered tool by name", () => {
      const tool = createMockTool("my-tool");
      registry.register(tool);

      const retrieved = registry.get("my-tool");

      expect(retrieved).toBe(tool);
      expect(retrieved?.name).toBe("my-tool");
    });

    it("should return undefined for non-existent tool", () => {
      const result = registry.get("non-existent");

      expect(result).toBeUndefined();
    });
  });

  describe("has", () => {
    it("should return true for registered tool", () => {
      registry.register(createMockTool("exists"));

      expect(registry.has("exists")).toBe(true);
    });

    it("should return false for non-existent tool", () => {
      expect(registry.has("does-not-exist")).toBe(false);
    });
  });

  describe("getAll", () => {
    it("should return empty array when no tools registered", () => {
      expect(registry.getAll()).toEqual([]);
    });

    it("should return all registered tools", () => {
      const tool1 = createMockTool("tool-a");
      const tool2 = createMockTool("tool-b");
      registry.register(tool1);
      registry.register(tool2);

      const all = registry.getAll();

      expect(all).toHaveLength(2);
      expect(all).toContain(tool1);
      expect(all).toContain(tool2);
    });

    it("should return a new array each time", () => {
      registry.register(createMockTool("tool"));

      const first = registry.getAll();
      const second = registry.getAll();

      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });
  });

  describe("unregister", () => {
    it("should remove and return true for existing tool", () => {
      registry.register(createMockTool("to-remove"));

      const result = registry.unregister("to-remove");

      expect(result).toBe(true);
      expect(registry.has("to-remove")).toBe(false);
      expect(registry.size).toBe(0);
    });

    it("should return false for non-existent tool", () => {
      const result = registry.unregister("never-existed");

      expect(result).toBe(false);
    });
  });

  describe("size", () => {
    it("should return 0 for empty registry", () => {
      expect(registry.size).toBe(0);
    });

    it("should return correct count after operations", () => {
      expect(registry.size).toBe(0);

      registry.register(createMockTool("a"));
      expect(registry.size).toBe(1);

      registry.register(createMockTool("b"));
      expect(registry.size).toBe(2);

      registry.unregister("a");
      expect(registry.size).toBe(1);
    });
  });

  describe("clear", () => {
    it("should remove all tools", () => {
      registry.register(createMockTool("tool-1"));
      registry.register(createMockTool("tool-2"));
      registry.register(createMockTool("tool-3"));
      expect(registry.size).toBe(3);

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.getAll()).toEqual([]);
    });

    it("should work on empty registry", () => {
      registry.clear();

      expect(registry.size).toBe(0);
    });
  });
});

describe("createToolRegistry", () => {
  it("should create a new empty registry", () => {
    const registry = createToolRegistry();

    expect(registry).toBeInstanceOf(ToolRegistry);
    expect(registry.size).toBe(0);
  });

  it("should create independent registries", () => {
    const registry1 = createToolRegistry();
    const registry2 = createToolRegistry();

    registry1.register({
      name: "only-in-first",
      description: "Test",
      inputSchema: {},
      handler: async () => ({ success: true }),
    });

    expect(registry1.has("only-in-first")).toBe(true);
    expect(registry2.has("only-in-first")).toBe(false);
  });
});

describe("defineTool", () => {
  it("should return a ToolDefinition with the provided properties", () => {
    const tool = defineTool({
      name: "my-defined-tool",
      description: "A tool defined with defineTool",
      inputSchema: {
        query: z.string().describe("Search query"),
        limit: z.number().optional(),
      },
      handler: async (_client, input) => {
        return { success: true, result: input.query };
      },
    });

    expect(tool.name).toBe("my-defined-tool");
    expect(tool.description).toBe("A tool defined with defineTool");
    expect(tool.inputSchema).toHaveProperty("query");
    expect(tool.inputSchema).toHaveProperty("limit");
    expect(typeof tool.handler).toBe("function");
  });

  it("should create tool that can be registered", () => {
    const tool = defineTool({
      name: "registerable-tool",
      description: "Can be registered",
      inputSchema: {},
      handler: async () => ({ success: true }),
    });

    const registry = createToolRegistry();
    registry.register(tool);

    expect(registry.has("registerable-tool")).toBe(true);
  });

  it("should preserve handler functionality", async () => {
    const tool = defineTool({
      name: "functional-tool",
      description: "Has working handler",
      inputSchema: {
        value: z.number(),
      },
      handler: async (_client, input) => {
        return { success: true, result: input.value * 2 };
      },
    });

    // Create a minimal mock client
    const mockClient = {} as Parameters<typeof tool.handler>[0];
    const result = await tool.handler(mockClient, { value: 21 });

    expect(result.success).toBe(true);
    expect(result.result).toBe(42);
  });
});
