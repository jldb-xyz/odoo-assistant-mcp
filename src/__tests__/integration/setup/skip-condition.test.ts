import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { isOdooRunning } from "./skip-condition.js";

/**
 * Stand in for an Odoo instance, answering the two endpoints the detector
 * probes. Odoo only gained `/web/health` in 15, so 14 answers 404 there while
 * still serving XML-RPC perfectly well.
 */
function stubOdoo(routes: {
  health?: number;
  xmlrpc?: number;
}): Promise<{ port: number; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const status =
      req.url === "/web/health"
        ? routes.health
        : req.url === "/xmlrpc/2/common"
          ? routes.xmlrpc
          : 404;

    if (status === undefined) {
      // Endpoint not served at all — drop the connection.
      req.socket.destroy();
      return;
    }
    res.writeHead(status, { "content-type": "text/plain" });
    res.end("");
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("expected a TCP address");
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

describe("isOdooRunning", () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async () => {
    await cleanup?.();
    cleanup = null;
  });

  it("detects a modern Odoo via /web/health", async () => {
    const odoo = await stubOdoo({ health: 200, xmlrpc: 200 });
    cleanup = odoo.close;

    await expect(isOdooRunning("127.0.0.1", odoo.port)).resolves.toBe(true);
  });

  it("detects Odoo 14, which has no /web/health, via XML-RPC", async () => {
    // Regression: the detector returned `response.ok` from the 404 and never
    // reached the XML-RPC fallback, so Odoo 14 looked permanently down. With
    // the old vacuous skip that silently passed all 99 integration tests.
    const odoo = await stubOdoo({ health: 404, xmlrpc: 200 });
    cleanup = odoo.close;

    await expect(isOdooRunning("127.0.0.1", odoo.port)).resolves.toBe(true);
  });

  it("reports not running when neither endpoint answers", async () => {
    const odoo = await stubOdoo({ health: 404, xmlrpc: 500 });
    cleanup = odoo.close;

    await expect(isOdooRunning("127.0.0.1", odoo.port)).resolves.toBe(false);
  });

  it("reports not running when nothing is listening", async () => {
    // Port 1 is reserved and never bound.
    await expect(isOdooRunning("127.0.0.1", 1)).resolves.toBe(false);
  });
});
