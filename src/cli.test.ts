import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "./cli.js";

describe("cli", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ODOO_MCP_PORT;
    delete process.env.ODOO_MCP_HOST;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("parseArgs", () => {
    it("defaults to stdio transport", () => {
      const options = parseArgs([]);
      expect(options.transport).toBe("stdio");
    });

    it("defaults port to 3000", () => {
      const options = parseArgs([]);
      expect(options.port).toBe(3000);
    });

    it("defaults host to 127.0.0.1", () => {
      const options = parseArgs([]);
      expect(options.host).toBe("127.0.0.1");
    });

    it("enables HTTP transport with --http flag", () => {
      const options = parseArgs(["--http"]);
      expect(options.transport).toBe("http");
    });

    it("sets port with --port flag", () => {
      const options = parseArgs(["--http", "--port", "8080"]);
      expect(options.port).toBe(8080);
    });

    it("sets host with --host flag", () => {
      const options = parseArgs(["--http", "--host", "0.0.0.0"]);
      expect(options.host).toBe("0.0.0.0");
    });

    it("handles all flags together", () => {
      const options = parseArgs([
        "--http",
        "--port",
        "9000",
        "--host",
        "0.0.0.0",
      ]);
      expect(options.transport).toBe("http");
      expect(options.port).toBe(9000);
      expect(options.host).toBe("0.0.0.0");
    });

    it("reads port from ODOO_MCP_PORT env var", () => {
      process.env.ODOO_MCP_PORT = "9000";
      const options = parseArgs([]);
      expect(options.port).toBe(9000);
    });

    it("reads host from ODOO_MCP_HOST env var", () => {
      process.env.ODOO_MCP_HOST = "0.0.0.0";
      const options = parseArgs([]);
      expect(options.host).toBe("0.0.0.0");
    });

    it("CLI flags override env vars for port", () => {
      process.env.ODOO_MCP_PORT = "9000";
      const options = parseArgs(["--port", "8080"]);
      expect(options.port).toBe(8080);
    });

    it("CLI flags override env vars for host", () => {
      process.env.ODOO_MCP_HOST = "192.168.1.1";
      const options = parseArgs(["--host", "0.0.0.0"]);
      expect(options.host).toBe("0.0.0.0");
    });

    it("ignores --port without value", () => {
      const options = parseArgs(["--port"]);
      expect(options.port).toBe(3000);
    });

    it("ignores --host without value", () => {
      const options = parseArgs(["--host"]);
      expect(options.host).toBe("127.0.0.1");
    });
  });
});
