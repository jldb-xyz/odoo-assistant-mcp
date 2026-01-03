import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClientOptions, loadConfig } from "./config.js";

// Mock fs module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    process.env = { ...originalEnv };
    // Clear ODOO_* env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("ODOO_")) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("loadConfig", () => {
    it("should load config from environment variables", () => {
      process.env.ODOO_URL = "https://example.odoo.com";
      process.env.ODOO_DB = "testdb";
      process.env.ODOO_USERNAME = "admin";
      process.env.ODOO_PASSWORD = "secret";

      const config = loadConfig();

      expect(config).toEqual({
        url: "https://example.odoo.com",
        db: "testdb",
        username: "admin",
        password: "secret",
      });
    });

    it("should load config from first available config file", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === "./odoo_config.json";
      });
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          url: "https://file.odoo.com",
          db: "filedb",
          username: "fileuser",
          password: "filepass",
        }),
      );

      const config = loadConfig();

      expect(config).toEqual({
        url: "https://file.odoo.com",
        db: "filedb",
        username: "fileuser",
        password: "filepass",
      });
      expect(fs.existsSync).toHaveBeenCalledWith("./odoo_config.json");
    });

    it("should check config files in priority order", () => {
      // First file doesn't exist, second does
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const expanded = String(p);
        return expanded.includes(".config/odoo/config.json");
      });
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          url: "https://global.odoo.com",
          db: "globaldb",
          username: "globaluser",
          password: "globalpass",
        }),
      );

      const config = loadConfig();

      expect(config.url).toBe("https://global.odoo.com");
      // Should have checked local first
      expect(fs.existsSync).toHaveBeenCalledWith("./odoo_config.json");
    });

    it("should prioritize environment variables over config files", () => {
      process.env.ODOO_URL = "https://env.odoo.com";
      process.env.ODOO_DB = "envdb";
      process.env.ODOO_USERNAME = "envuser";
      process.env.ODOO_PASSWORD = "envpass";

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          url: "https://file.odoo.com",
          db: "filedb",
          username: "fileuser",
          password: "filepass",
        }),
      );

      const config = loadConfig();

      expect(config.url).toBe("https://env.odoo.com");
      // Should not have tried to read files
      expect(fs.existsSync).not.toHaveBeenCalled();
    });

    it("should throw error when no config found", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => loadConfig()).toThrow("No Odoo configuration found");
    });

    it("should throw error for partial environment variables", () => {
      process.env.ODOO_URL = "https://partial.odoo.com";
      process.env.ODOO_DB = "partialdb";
      // Missing username and password

      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => loadConfig()).toThrow("No Odoo configuration found");
    });

    it("should throw error for invalid config file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          url: "https://invalid.odoo.com",
          // Missing required fields
        }),
      );

      expect(() => loadConfig()).toThrow();
    });

    it("should expand ~ in config paths", () => {
      const homedir = os.homedir();
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p) === path.join(homedir, ".odoo_config.json");
      });
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          url: "https://home.odoo.com",
          db: "homedb",
          username: "homeuser",
          password: "homepass",
        }),
      );

      const config = loadConfig();

      expect(config.url).toBe("https://home.odoo.com");
    });
  });

  describe("getClientOptions", () => {
    it("should return default timeout when not set", () => {
      const options = getClientOptions();

      expect(options.timeout).toBe(30000);
    });

    it("should parse timeout from environment variable (in seconds)", () => {
      process.env.ODOO_TIMEOUT = "60";

      const options = getClientOptions();

      expect(options.timeout).toBe(60000);
    });

    it("should return verifySsl true by default", () => {
      const options = getClientOptions();

      expect(options.verifySsl).toBe(true);
    });

    it("should parse verifySsl true for '1'", () => {
      process.env.ODOO_VERIFY_SSL = "1";

      const options = getClientOptions();

      expect(options.verifySsl).toBe(true);
    });

    it("should parse verifySsl true for 'true'", () => {
      process.env.ODOO_VERIFY_SSL = "true";

      const options = getClientOptions();

      expect(options.verifySsl).toBe(true);
    });

    it("should parse verifySsl true for 'yes'", () => {
      process.env.ODOO_VERIFY_SSL = "yes";

      const options = getClientOptions();

      expect(options.verifySsl).toBe(true);
    });

    it("should parse verifySsl true for 'YES' (case insensitive)", () => {
      process.env.ODOO_VERIFY_SSL = "YES";

      const options = getClientOptions();

      expect(options.verifySsl).toBe(true);
    });

    it("should parse verifySsl false for '0'", () => {
      process.env.ODOO_VERIFY_SSL = "0";

      const options = getClientOptions();

      expect(options.verifySsl).toBe(false);
    });

    it("should parse verifySsl false for 'false'", () => {
      process.env.ODOO_VERIFY_SSL = "false";

      const options = getClientOptions();

      expect(options.verifySsl).toBe(false);
    });

    it("should parse verifySsl false for 'no'", () => {
      process.env.ODOO_VERIFY_SSL = "no";

      const options = getClientOptions();

      expect(options.verifySsl).toBe(false);
    });
  });
});
