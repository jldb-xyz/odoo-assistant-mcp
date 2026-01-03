/** biome-ignore-all lint/style/noNonNullAssertion: Test file uses non-null assertions for known values */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteEntry,
  listEntries,
  type PathConfig,
  readEntry,
  saveEntry,
} from "./index.js";

describe("docs-system", () => {
  let tempDir: string;
  let config: PathConfig;

  beforeEach(() => {
    // Create temp directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "odoo-mcp-test-"));

    // Configure paths to use temp directories
    config = {
      bundledDir: path.join(tempDir, "bundled"),
      globalDir: path.join(tempDir, "global"),
      localDir: path.join(tempDir, "local"),
    };
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("listEntries", () => {
    it("returns empty array when no directories exist", () => {
      const result = listEntries("sops", config);
      expect(result).toEqual([]);
    });

    it("lists local entries", () => {
      fs.mkdirSync(config.localDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.localDir!, "test-sop.md"),
        "# Test SOP",
      );

      const result = listEntries("sops", config);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("test-sop");
      expect(result[0].source).toBe("local");
    });

    it("lists global entries", () => {
      fs.mkdirSync(config.globalDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.globalDir!, "global-sop.md"),
        "# Global SOP",
      );

      const result = listEntries("sops", config);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("global-sop");
      expect(result[0].source).toBe("global");
    });

    it("lists bundled entries for docs type", () => {
      fs.mkdirSync(config.bundledDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.bundledDir!, "bundled-doc.md"),
        "# Bundled Doc",
      );

      const result = listEntries("docs", config);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("bundled-doc");
      expect(result[0].source).toBe("bundled");
    });

    it("does not include bundled for sops type", () => {
      fs.mkdirSync(config.bundledDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.bundledDir!, "bundled.md"),
        "# Bundled",
      );

      const result = listEntries("sops", config);
      expect(result).toHaveLength(0);
    });

    it("local overrides global with same name", () => {
      // Create global entry
      fs.mkdirSync(config.globalDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.globalDir!, "shared.md"),
        "# Global version",
      );

      // Create local entry with same name
      fs.mkdirSync(config.localDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.localDir!, "shared.md"),
        "# Local version",
      );

      const result = listEntries("sops", config);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("shared");
      expect(result[0].source).toBe("local");
    });

    it("local overrides bundled for docs", () => {
      fs.mkdirSync(config.bundledDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.bundledDir!, "shared.md"),
        "# Bundled version",
      );

      fs.mkdirSync(config.localDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.localDir!, "shared.md"),
        "# Local version",
      );

      const result = listEntries("docs", config);
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe("local");
    });

    it("merges entries from all layers", () => {
      // Create global entry
      fs.mkdirSync(config.globalDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.globalDir!, "global-only.md"),
        "# Global",
      );

      // Create local entry
      fs.mkdirSync(config.localDir!, { recursive: true });
      fs.writeFileSync(path.join(config.localDir!, "local-only.md"), "# Local");

      const result = listEntries("sops", config);
      expect(result).toHaveLength(2);

      const names = result.map((e) => e.name).sort();
      expect(names).toEqual(["global-only", "local-only"]);
    });

    it("only lists .md files", () => {
      fs.mkdirSync(config.localDir!, { recursive: true });
      fs.writeFileSync(path.join(config.localDir!, "valid.md"), "# Valid");
      fs.writeFileSync(
        path.join(config.localDir!, "invalid.txt"),
        "Not markdown",
      );
      fs.writeFileSync(path.join(config.localDir!, "also-invalid.json"), "{}");

      const result = listEntries("sops", config);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("valid");
    });

    it("sorts entries alphabetically", () => {
      fs.mkdirSync(config.localDir!, { recursive: true });
      fs.writeFileSync(path.join(config.localDir!, "zebra.md"), "# Z");
      fs.writeFileSync(path.join(config.localDir!, "alpha.md"), "# A");
      fs.writeFileSync(path.join(config.localDir!, "middle.md"), "# M");

      const result = listEntries("sops", config);
      expect(result.map((e) => e.name)).toEqual(["alpha", "middle", "zebra"]);
    });
  });

  describe("readEntry", () => {
    it("returns null when entry does not exist", () => {
      const result = readEntry("sops", "nonexistent", config);
      expect(result).toBeNull();
    });

    it("reads local entry", () => {
      fs.mkdirSync(config.localDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.localDir!, "test.md"),
        "# Test Content",
      );

      const result = readEntry("sops", "test", config);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("test");
      expect(result!.source).toBe("local");
      expect(result!.content).toBe("# Test Content");
    });

    it("reads global entry when local not present", () => {
      fs.mkdirSync(config.globalDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.globalDir!, "global.md"),
        "# Global Content",
      );

      const result = readEntry("sops", "global", config);
      expect(result).not.toBeNull();
      expect(result!.source).toBe("global");
      expect(result!.content).toBe("# Global Content");
    });

    it("reads bundled entry for docs when others not present", () => {
      fs.mkdirSync(config.bundledDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.bundledDir!, "bundled.md"),
        "# Bundled Content",
      );

      const result = readEntry("docs", "bundled", config);
      expect(result).not.toBeNull();
      expect(result!.source).toBe("bundled");
      expect(result!.content).toBe("# Bundled Content");
    });

    it("prefers local over global", () => {
      // Create global entry
      fs.mkdirSync(config.globalDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.globalDir!, "shared.md"),
        "# Global Version",
      );

      // Create local entry
      fs.mkdirSync(config.localDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.localDir!, "shared.md"),
        "# Local Version",
      );

      const result = readEntry("sops", "shared", config);
      expect(result).not.toBeNull();
      expect(result!.source).toBe("local");
      expect(result!.content).toBe("# Local Version");
    });

    it("prefers local over bundled for docs", () => {
      fs.mkdirSync(config.bundledDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.bundledDir!, "shared.md"),
        "# Bundled Version",
      );

      fs.mkdirSync(config.localDir!, { recursive: true });
      fs.writeFileSync(
        path.join(config.localDir!, "shared.md"),
        "# Local Version",
      );

      const result = readEntry("docs", "shared", config);
      expect(result!.source).toBe("local");
      expect(result!.content).toBe("# Local Version");
    });
  });

  describe("saveEntry", () => {
    it("saves entry to local directory", () => {
      const result = saveEntry("sops", "new-sop", "# New SOP Content", config);

      expect(result.success).toBe(true);
      expect(result.path).toContain("new-sop.md");

      // Verify file was created
      const content = fs.readFileSync(result.path!, "utf-8");
      expect(content).toBe("# New SOP Content");
    });

    it("creates directory if it does not exist", () => {
      expect(fs.existsSync(config.localDir!)).toBe(false);

      saveEntry("sops", "new-sop", "# Content", config);

      expect(fs.existsSync(config.localDir!)).toBe(true);
    });

    it("overwrites existing entry", () => {
      saveEntry("sops", "test", "# Original", config);
      saveEntry("sops", "test", "# Updated", config);

      const result = readEntry("sops", "test", config);
      expect(result!.content).toBe("# Updated");
    });

    it("works for docs type", () => {
      const result = saveEntry("docs", "custom-doc", "# Custom Doc", config);

      expect(result.success).toBe(true);
      expect(result.path).toContain("custom-doc.md");
    });
  });

  describe("deleteEntry", () => {
    it("deletes existing local entry", () => {
      // Create entry first
      saveEntry("sops", "to-delete", "# Content", config);

      const result = deleteEntry("sops", "to-delete", config);

      expect(result.success).toBe(true);
      expect(readEntry("sops", "to-delete", config)).toBeNull();
    });

    it("returns error for non-existent entry", () => {
      const result = deleteEntry("sops", "nonexistent", config);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("cannot delete global entries (only checks local)", () => {
      // Create global entry
      fs.mkdirSync(config.globalDir!, { recursive: true });
      fs.writeFileSync(path.join(config.globalDir!, "global.md"), "# Global");

      const result = deleteEntry("sops", "global", config);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found in local");
    });
  });

  describe("docs vs sops separation", () => {
    it("keeps docs and sops in separate directories", () => {
      // Use separate configs for docs and sops
      const docsConfig: PathConfig = {
        bundledDir: path.join(tempDir, "bundled-docs"),
        globalDir: path.join(tempDir, "global-docs"),
        localDir: path.join(tempDir, "local-docs"),
      };
      const sopsConfig: PathConfig = {
        bundledDir: path.join(tempDir, "bundled-sops"),
        globalDir: path.join(tempDir, "global-sops"),
        localDir: path.join(tempDir, "local-sops"),
      };

      saveEntry("docs", "my-doc", "# Doc", docsConfig);
      saveEntry("sops", "my-sop", "# SOP", sopsConfig);

      const docs = listEntries("docs", docsConfig);
      const sops = listEntries("sops", sopsConfig);

      // Each should only see its own type
      expect(docs.map((d) => d.name)).toContain("my-doc");
      expect(docs.map((d) => d.name)).not.toContain("my-sop");

      expect(sops.map((s) => s.name)).toContain("my-sop");
      expect(sops.map((s) => s.name)).not.toContain("my-doc");
    });
  });
});
