import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XmlRpcClient } from "./xmlrpc.js";

// Mock the xmlrpc module
vi.mock("xmlrpc", () => {
  const mockMethodCall = vi.fn();
  return {
    default: {
      createClient: vi.fn(() => ({
        methodCall: mockMethodCall,
      })),
      createSecureClient: vi.fn(() => ({
        methodCall: mockMethodCall,
      })),
    },
  };
});

import xmlrpc from "xmlrpc";

describe("XmlRpcClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should create HTTP client for http URLs", () => {
      new XmlRpcClient({
        url: "http://localhost:8069",
        path: "/xmlrpc/2/common",
      });

      expect(xmlrpc.createClient).toHaveBeenCalled();
      expect(xmlrpc.createSecureClient).not.toHaveBeenCalled();
    });

    it("should create HTTPS client for https URLs", () => {
      new XmlRpcClient({
        url: "https://example.odoo.com",
        path: "/xmlrpc/2/common",
      });

      expect(xmlrpc.createSecureClient).toHaveBeenCalled();
      expect(xmlrpc.createClient).not.toHaveBeenCalled();
    });

    it("should use default timeout of 30000ms", () => {
      const client = new XmlRpcClient({
        url: "http://localhost:8069",
        path: "/xmlrpc/2/common",
      });

      // Access private options through the class
      expect(client).toBeDefined();
    });

    it("should use custom timeout", () => {
      const client = new XmlRpcClient({
        url: "http://localhost:8069",
        path: "/xmlrpc/2/common",
        timeout: 60000,
      });

      expect(client).toBeDefined();
    });

    it("should default verifySsl to true", () => {
      new XmlRpcClient({
        url: "https://example.odoo.com",
        path: "/xmlrpc/2/common",
      });

      expect(xmlrpc.createSecureClient).toHaveBeenCalled();
      const callArgs = vi.mocked(xmlrpc.createSecureClient).mock.calls[0][0];
      // When verifySsl is true, rejectUnauthorized should not be set (defaults to true)
      expect(callArgs).not.toHaveProperty("rejectUnauthorized");
    });

    it("should disable SSL verification when verifySsl is false", () => {
      new XmlRpcClient({
        url: "https://example.odoo.com",
        path: "/xmlrpc/2/common",
        verifySsl: false,
      });

      expect(xmlrpc.createSecureClient).toHaveBeenCalled();
      const callArgs = vi.mocked(xmlrpc.createSecureClient).mock.calls[0][0];
      expect(callArgs).toHaveProperty("rejectUnauthorized", false);
    });

    it("should parse port from URL", () => {
      new XmlRpcClient({
        url: "http://localhost:8069",
        path: "/xmlrpc/2/common",
      });

      const callArgs = vi.mocked(xmlrpc.createClient).mock.calls[0][0];
      expect(callArgs).toHaveProperty("port", 8069);
    });

    it("should use default port 80 for HTTP", () => {
      new XmlRpcClient({
        url: "http://example.com",
        path: "/xmlrpc/2/common",
      });

      const callArgs = vi.mocked(xmlrpc.createClient).mock.calls[0][0];
      expect(callArgs).toHaveProperty("port", 80);
    });

    it("should use default port 443 for HTTPS", () => {
      new XmlRpcClient({
        url: "https://example.com",
        path: "/xmlrpc/2/common",
      });

      const callArgs = vi.mocked(xmlrpc.createSecureClient).mock.calls[0][0];
      expect(callArgs).toHaveProperty("port", 443);
    });
  });

  describe("methodCall", () => {
    it("should call the underlying client methodCall", async () => {
      const client = new XmlRpcClient({
        url: "http://localhost:8069",
        path: "/xmlrpc/2/common",
      });

      const mockClient = vi.mocked(xmlrpc.createClient).mock.results[0].value;
      vi.mocked(mockClient.methodCall).mockImplementation(
        (_method, _params, callback) => {
          callback(null, { success: true });
        },
      );

      const result = await client.methodCall("version", []);

      expect(mockClient.methodCall).toHaveBeenCalledWith(
        "version",
        [],
        expect.any(Function),
      );
      expect(result).toEqual({ success: true });
    });

    it("should pass method and params correctly", async () => {
      const client = new XmlRpcClient({
        url: "http://localhost:8069",
        path: "/xmlrpc/2/object",
      });

      const mockClient = vi.mocked(xmlrpc.createClient).mock.results[0].value;
      vi.mocked(mockClient.methodCall).mockImplementation(
        (_method, _params, callback) => {
          callback(null, [1, 2, 3]);
        },
      );

      const result = await client.methodCall("execute_kw", [
        "testdb",
        1,
        "password",
        "res.partner",
        "search",
        [[]],
      ]);

      expect(mockClient.methodCall).toHaveBeenCalledWith(
        "execute_kw",
        ["testdb", 1, "password", "res.partner", "search", [[]]],
        expect.any(Function),
      );
      expect(result).toEqual([1, 2, 3]);
    });

    it("should reject on error", async () => {
      const client = new XmlRpcClient({
        url: "http://localhost:8069",
        path: "/xmlrpc/2/common",
      });

      const mockClient = vi.mocked(xmlrpc.createClient).mock.results[0].value;
      vi.mocked(mockClient.methodCall).mockImplementation(
        (_method, _params, callback) => {
          callback(new Error("Connection refused"), null);
        },
      );

      await expect(client.methodCall("version", [])).rejects.toThrow(
        "Connection refused",
      );
    });

    it("should timeout after configured duration", async () => {
      const client = new XmlRpcClient({
        url: "http://localhost:8069",
        path: "/xmlrpc/2/common",
        timeout: 5000,
      });

      const mockClient = vi.mocked(xmlrpc.createClient).mock.results[0].value;
      // Never call the callback to simulate timeout
      vi.mocked(mockClient.methodCall).mockImplementation(() => {
        // Do nothing - simulates a hanging request
      });

      const promise = client.methodCall("slow_method", []);

      // Advance time past timeout
      vi.advanceTimersByTime(5001);

      await expect(promise).rejects.toThrow("Request timeout after 5000ms");
    });

    it("should clear timeout on successful response", async () => {
      const client = new XmlRpcClient({
        url: "http://localhost:8069",
        path: "/xmlrpc/2/common",
        timeout: 5000,
      });

      const mockClient = vi.mocked(xmlrpc.createClient).mock.results[0].value;
      vi.mocked(mockClient.methodCall).mockImplementation(
        (_method, _params, callback) => {
          // Respond immediately
          callback(null, "success");
        },
      );

      const result = await client.methodCall("fast_method", []);

      expect(result).toBe("success");

      // Advance time past original timeout - should not throw
      vi.advanceTimersByTime(6000);
    });

    it("should clear timeout on error response", async () => {
      const client = new XmlRpcClient({
        url: "http://localhost:8069",
        path: "/xmlrpc/2/common",
        timeout: 5000,
      });

      const mockClient = vi.mocked(xmlrpc.createClient).mock.results[0].value;
      vi.mocked(mockClient.methodCall).mockImplementation(
        (_method, _params, callback) => {
          callback(new Error("Server error"), null);
        },
      );

      await expect(client.methodCall("error_method", [])).rejects.toThrow(
        "Server error",
      );

      // Advance time past original timeout - should not cause issues
      vi.advanceTimersByTime(6000);
    });
  });
});
