import { createServer as createNodeHttpServer, type Server } from "node:http";
import {
  hostHeaderValidation,
  type NodeIncomingMessageLike,
  originValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import {
  createMcpHandler,
  type McpHttpHandler,
  type McpServer,
} from "@modelcontextprotocol/server";
import type { OdooClient } from "./connection/odoo-client.js";
import {
  _setClient,
  createServer,
  initializeClient,
  logEnvironment,
} from "./server.js";

export interface HttpServerOptions {
  port: number;
  host: string;
}

export interface HttpServerDependencies {
  initClient?: () => Promise<OdooClient>;
  createMcpServer?: () => McpServer;
  /**
   * Install SIGINT/SIGTERM handlers that shut the server down and exit the
   * process. Defaults to true for the CLI; tests turn it off so they can own
   * the lifecycle.
   */
  handleSignals?: boolean;
}

/** Endpoint the MCP handler is mounted on. */
const MCP_PATH = "/mcp";

/**
 * Hostnames accepted in the Host and Origin headers. Anything else is a
 * DNS-rebinding or cross-origin attempt against a locally bound server.
 */
function allowedHostnames(host: string): string[] {
  const localhost = ["localhost", "127.0.0.1", "[::1]"];
  return localhost.includes(host) ? localhost : [...localhost, host];
}

/**
 * Build the MCP HTTP handler.
 *
 * `createMcpHandler` serves the 2026-07-28 revision per request and — with the
 * default `legacy: 'stateless'` — also answers 2025-era traffic from the same
 * factory, so existing clients keep working without a second code path. There
 * is no session map to maintain: the modern revision is stateless by design.
 */
export function createMcpHttpHandler(
  factory: () => McpServer,
  onerror: (error: Error) => void = (error) =>
    console.error("MCP handler error:", error),
): McpHttpHandler {
  return createMcpHandler(factory, { onerror });
}

/**
 * Run the MCP server over Streamable HTTP.
 */
export async function runHttpServer(
  options: HttpServerOptions,
  deps?: HttpServerDependencies,
): Promise<Server> {
  console.error("=== ODOO MCP HTTP SERVER STARTING ===");
  console.error(`Node.js version: ${process.version}`);

  logEnvironment();

  // Initialize Odoo client and set it globally
  const initClient = deps?.initClient ?? initializeClient;
  const odooClient = await initClient();
  _setClient(odooClient);

  const factory = deps?.createMcpServer ?? (() => createServer());
  const handler = createMcpHttpHandler(factory);
  const nodeHandler = toNodeHandler(handler, {
    onerror: (error) => console.error("Error handling MCP request:", error),
  });

  // DNS-rebinding and cross-origin protection for a locally bound server
  const hostnames = allowedHostnames(options.host);
  const validateHost = hostHeaderValidation(hostnames);
  const validateOrigin = originValidation(hostnames);

  const server = createNodeHttpServer((req, res) => {
    if (!validateHost(req, res)) return;
    if (!validateOrigin(req, res)) return;

    const pathname = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    ).pathname;
    if (pathname !== MCP_PATH) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not Found");
      return;
    }

    // Node types `method`/`url` as `string | undefined`, which
    // `exactOptionalPropertyTypes` will not match against the SDK's
    // `method?: string` duck type. Both are always set on a server request.
    void nodeHandler(req as NodeIncomingMessageLike, res);
  });

  await new Promise<void>((resolve, reject) => {
    // Bind failures (EADDRINUSE, EACCES) arrive as an 'error' event, not a
    // throw — without this the caller would hang instead of failing.
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(options.port, options.host, () => {
      server.removeListener("error", onError);
      console.error(
        `MCP HTTP server listening on http://${options.host}:${options.port}${MCP_PATH}`,
      );
      resolve();
    });
  });

  // Graceful shutdown. `once` so repeated calls in one process don't stack
  // duplicate listeners.
  const shutdown = async () => {
    console.error("Shutting down HTTP server...");
    await handler.close();
    server.close(() => {
      console.error("HTTP server shutdown complete");
      process.exit(0);
    });
  };

  if (deps?.handleSignals ?? true) {
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }

  return server;
}
