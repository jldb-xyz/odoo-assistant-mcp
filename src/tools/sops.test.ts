import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as docsSystem from "../docs-system/index.js";
import { listSopsTool, readSopTool, saveSopTool } from "./sops.js";

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

describe("sops tools", () => {
  const mockClient = {} as Parameters<typeof listSopsTool.handler>[0];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listSopsTool", () => {
    it("should have correct metadata", () => {
      expect(listSopsTool.name).toBe("list_sops");
      expect(listSopsTool.description).toContain("Standard Operating Procedures");
    });

    it("should list available SOPs", async () => {
      vi.mocked(docsSystem.listEntries).mockReturnValue([
        { name: "deployment", source: "global", path: "/path/to/sop.md" },
        { name: "incident-response", source: "local", path: "/path/to/ir.md" },
      ]);

      const result = await listSopsTool.handler(mockClient, {});

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty("text");
      expect((result.result as { text: string }).text).toContain(
        "# Available SOPs",
      );
      expect((result.result as { text: string }).text).toContain(
        "deployment (global)",
      );
      expect((result.result as { text: string }).text).toContain(
        "incident-response (local)",
      );
    });

    it("should show message when no SOPs found", async () => {
      vi.mocked(docsSystem.listEntries).mockReturnValue([]);

      const result = await listSopsTool.handler(mockClient, {});

      expect(result.success).toBe(true);
      expect((result.result as { text: string }).text).toContain(
        "No SOPs found",
      );
      expect((result.result as { text: string }).text).toContain("save_sop");
    });
  });

  describe("readSopTool", () => {
    it("should have correct metadata", () => {
      expect(readSopTool.name).toBe("read_sop");
      expect(readSopTool.description).toContain("Read");
      expect(readSopTool.inputSchema).toHaveProperty("name");
    });

    it("should read existing SOP", async () => {
      vi.mocked(docsSystem.readEntry).mockReturnValue({
        name: "test-sop",
        source: "global",
        content: "## Steps\n\n1. Do this\n2. Do that",
      });

      const result = await readSopTool.handler(mockClient, { name: "test-sop" });

      expect(result.success).toBe(true);
      expect((result.result as { text: string }).text).toContain(
        "# SOP: test-sop",
      );
      expect((result.result as { text: string }).text).toContain(
        "_Source: global_",
      );
      expect((result.result as { text: string }).text).toContain("Do this");
    });

    it("should return error for non-existent SOP", async () => {
      vi.mocked(docsSystem.readEntry).mockReturnValue(null);

      const result = await readSopTool.handler(mockClient, {
        name: "non-existent",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('SOP "non-existent" not found');
      expect(result.error).toContain("list_sops");
    });
  });

  describe("saveSopTool", () => {
    it("should have correct metadata", () => {
      expect(saveSopTool.name).toBe("save_sop");
      expect(saveSopTool.description).toContain("Save");
      expect(saveSopTool.inputSchema).toHaveProperty("name");
      expect(saveSopTool.inputSchema).toHaveProperty("content");
    });

    it("should save SOP successfully", async () => {
      vi.mocked(docsSystem.saveEntry).mockReturnValue({
        success: true,
        path: "/path/to/.odoo-mcp/sops/new-sop.md",
      });

      const result = await saveSopTool.handler(mockClient, {
        name: "new-sop",
        content: "# New SOP\n\nSteps here",
      });

      expect(result.success).toBe(true);
      expect((result.result as { text: string }).text).toContain(
        'Saved SOP "new-sop"',
      );
      expect((result.result as { text: string }).text).toContain(
        "/path/to/.odoo-mcp/sops/new-sop.md",
      );
    });

    it("should return error on save failure", async () => {
      vi.mocked(docsSystem.saveEntry).mockReturnValue({
        success: false,
        error: "Disk full",
      });

      const result = await saveSopTool.handler(mockClient, {
        name: "fail-sop",
        content: "Content",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to save SOP");
      expect(result.error).toContain("Disk full");
    });
  });
});

describe("sops tools integration", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "odoo-mcp-sops-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should work with real docs-system (save and read)", async () => {
    const realDocsSystem = await vi.importActual<typeof docsSystem>(
      "../docs-system/index.js",
    );

    const config = {
      bundledDir: path.join(tempDir, "bundled"),
      globalDir: path.join(tempDir, "global"),
      localDir: path.join(tempDir, "local"),
    };

    // Save an SOP
    const saveResult = realDocsSystem.saveEntry(
      "sops",
      "test-procedure",
      "# Test Procedure\n\n1. Step one\n2. Step two",
      config,
    );
    expect(saveResult.success).toBe(true);

    // Read it back
    const readResult = realDocsSystem.readEntry("sops", "test-procedure", config);
    expect(readResult).not.toBeNull();
    expect(readResult?.content).toContain("Test Procedure");

    // List should include it
    const listResult = realDocsSystem.listEntries("sops", config);
    expect(listResult.map((s) => s.name)).toContain("test-procedure");
  });
});
