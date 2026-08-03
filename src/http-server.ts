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
  getClient,
  initializeClient,
  logEnvironment,
  SERVER_VERSION,
} from "./server.js";

export interface HttpServerOptions {
  port: number;
  host: string;
  /**
   * Extra hostnames accepted in the Host and Origin headers, on top of
   * loopback and the bind address.
   *
   * Behind an ingress, Service or reverse proxy the Host is the public name,
   * so without this the server answers 403 to everything. Set via
   * `ODOO_MCP_ALLOWED_HOSTS` (comma-separated).
   */
  allowedHosts?: string[];
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

/** Liveness: the process is up and serving. */
const HEALTH_PATH = "/health";

/** Readiness: this instance holds an authenticated Odoo session. */
const READY_PATH = "/ready";

/**
 * Hostnames accepted in the Host and Origin headers. Anything else is a
 * DNS-rebinding or cross-origin attempt against a locally bound server.
 */
function allowedHostnames(host: string, extra: string[] = []): string[] {
  const localhost = ["localhost", "127.0.0.1", "[::1]"];
  const names = new Set([...localhost, host, ...extra]);
  return [...names];
}

function json(
  res: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
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
  const hostnames = allowedHostnames(options.host, options.allowedHosts);
  const validateHost = hostHeaderValidation(hostnames);
  const validateOrigin = originValidation(hostnames);

  const server = createNodeHttpServer((req, res) => {
    const pathname = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    ).pathname;

    // Probes are answered before the Host allowlist: a kubelet or Docker
    // healthcheck addresses the container by IP, which is never in the
    // allowlist. They carry no data and touch no Odoo state.
    if (pathname === HEALTH_PATH) {
      json(res, 200, { status: "ok", version: SERVER_VERSION });
      return;
    }
    if (pathname === READY_PATH) {
      // Readiness means this instance completed startup and holds an
      // authenticated session. It deliberately does not call Odoo: probes run
      // every few seconds per replica, and turning them into Odoo traffic
      // would be a self-inflicted load problem. A broken Odoo surfaces as
      // failing tool calls, not as a failing probe.
      let ready = true;
      try {
        getClient();
      } catch {
        ready = false;
      }
      json(
        res,
        ready ? 200 : 503,
        ready ? { status: "ready" } : { status: "not-ready" },
      );
      return;
    }

    if (!validateHost(req, res)) return;
    if (!validateOrigin(req, res)) return;

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
