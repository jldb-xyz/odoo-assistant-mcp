import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as docsSystem from "../docs-system/index.js";
import { listDocsTool, readDocTool, saveDocTool } from "./docs.js";

// Mock the docs-system module
vi.mock("../docs-system/index.js", async () => {
  const actual = await vi.importActual("../docs-system/index.js");
  return {
    ...actual,
    listEntries: vi.fn(),
    readEntry: vi.fn(),
    saveEntry: vi.fn(),
  };
});

describe("docs tools", () => {
  const mockClient = {} as Parameters<typeof listDocsTool.handler>[0];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listDocsTool", () => {
    it("should have correct metadata", () => {
      expect(listDocsTool.name).toBe("list_docs");
      expect(listDocsTool.description).toContain("documentation");
    });

    it("should list available docs", async () => {
      vi.mocked(docsSystem.listEntries).mockReturnValue([
        { name: "getting-started", source: "bundled", path: "/path/to/doc.md" },
        { name: "api-reference", source: "local", path: "/path/to/api.md" },
      ]);

      const result = await listDocsTool.handler(mockClient, {});

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty("text");
      expect((result.result as { text: string }).text).toContain(
        "# Available Documentation",
      );
      expect((result.result as { text: string }).text).toContain(
        "getting-started (bundled)",
      );
      expect((result.result as { text: string }).text).toContain(
        "api-reference (local)",
      );
    });

    it("should show message when no docs found", async () => {
      vi.mocked(docsSystem.listEntries).mockReturnValue([]);

      const result = await listDocsTool.handler(mockClient, {});

      expect(result.success).toBe(true);
      expect((result.result as { text: string }).text).toContain(
        "No docs found",
      );
    });
  });

  describe("readDocTool", () => {
    it("should have correct metadata", () => {
      expect(readDocTool.name).toBe("read_doc");
      expect(readDocTool.description).toContain("Read");
      expect(readDocTool.inputSchema).toHaveProperty("name");
    });

    it("should read existing doc", async () => {
      vi.mocked(docsSystem.readEntry).mockReturnValue({
        name: "test-doc",
        source: "local",
        content: "# Test Document\n\nThis is test content.",
      });

      const result = await readDocTool.handler(mockClient, { name: "test-doc" });

      expect(result.success).toBe(true);
      expect((result.result as { text: string }).text).toContain("# test-doc");
      expect((result.result as { text: string }).text).toContain(
        "_Source: local_",
      );
      expect((result.result as { text: string }).text).toContain(
        "This is test content",
      );
    });

    it("should return error for non-existent doc", async () => {
      vi.mocked(docsSystem.readEntry).mockReturnValue(null);

      const result = await readDocTool.handler(mockClient, {
        name: "non-existent",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Doc "non-existent" not found');
      expect(result.error).toContain("list_docs");
    });
  });

  describe("saveDocTool", () => {
    it("should have correct metadata", () => {
      expect(saveDocTool.name).toBe("save_doc");
      expect(saveDocTool.description).toContain("Save");
      expect(saveDocTool.inputSchema).toHaveProperty("name");
      expect(saveDocTool.inputSchema).toHaveProperty("content");
    });

    it("should save doc successfully", async () => {
      vi.mocked(docsSystem.saveEntry).mockReturnValue({
        success: true,
        path: "/path/to/.odoo-mcp/docs/new-doc.md",
      });

      const result = await saveDocTool.handler(mockClient, {
        name: "new-doc",
        content: "# New Documentation",
      });

      expect(result.success).toBe(true);
      expect((result.result as { text: string }).text).toContain(
        'Saved doc "new-doc"',
      );
      expect((result.result as { text: string }).text).toContain(
        "/path/to/.odoo-mcp/docs/new-doc.md",
      );
    });

    it("should return error on save failure", async () => {
      vi.mocked(docsSystem.saveEntry).mockReturnValue({
        success: false,
        error: "Permission denied",
      });

      const result = await saveDocTool.handler(mockClient, {
        name: "fail-doc",
        content: "Content",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to save doc");
      expect(result.error).toContain("Permission denied");
    });
  });
});

describe("docs tools integration", () => {
  let tempDir: string;
  let originalListEntries: typeof docsSystem.listEntries;
  let originalReadEntry: typeof docsSystem.readEntry;
  let originalSaveEntry: typeof docsSystem.saveEntry;

  beforeEach(() => {
    // Restore real implementations for integration tests
    vi.restoreAllMocks();

    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "odoo-mcp-docs-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should work with real docs-system (save and read)", async () => {
    // Re-import to get real implementations
    const realDocsSystem = await vi.importActual<typeof docsSystem>(
      "../docs-system/index.js",
    );

    const config = {
      bundledDir: path.join(tempDir, "bundled"),
      globalDir: path.join(tempDir, "global"),
      localDir: path.join(tempDir, "local"),
    };

    // Save a doc using real saveEntry
    const saveResult = realDocsSystem.saveEntry(
      "docs",
      "integration-test",
      "# Integration Test\n\nThis works!",
      config,
    );
    expect(saveResult.success).toBe(true);

    // Read it back
    const readResult = realDocsSystem.readEntry(
      "docs",
      "integration-test",
      config,
    );
    expect(readResult).not.toBeNull();
    expect(readResult?.content).toContain("Integration Test");

    // List should include it
    const listResult = realDocsSystem.listEntries("docs", config);
    expect(listResult.map((d) => d.name)).toContain("integration-test");
  });
});
