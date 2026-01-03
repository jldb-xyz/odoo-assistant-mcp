import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Express, Request, Response } from "express";
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
  createExpressApp?: (options: { host: string }) => Express;
}

// Store transports by session ID
const transports: Map<string, StreamableHTTPServerTransport> = new Map();

/**
 * Run the MCP server with HTTP/SSE transport
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

  // Create Express app with DNS rebinding protection
  const createExpressApp = deps?.createExpressApp ?? createMcpExpressApp;
  const app = createExpressApp({ host: options.host });

  // Factory for creating new McpServer instances (one per session)
  const getMcpServer = deps?.createMcpServer ?? (() => createServer());

  // POST handler - handle JSON-RPC requests
  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      const existingTransport = sessionId
        ? transports.get(sessionId)
        : undefined;
      if (existingTransport) {
        // Reuse existing transport
        transport = existingTransport;
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            console.error(`Session initialized: ${sid}`);
            transports.set(sid, transport);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports.has(sid)) {
            console.error(`Session closed: ${sid}`);
            transports.delete(sid);
          }
        };

        // Connect transport to a new MCP server instance
        const server = getMcpServer();
        await server.connect(transport as Parameters<typeof server.connect>[0]);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        // Invalid request - no session ID or not initialization request
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  // GET handler - SSE streams
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    await transport.handleRequest(req, res);
  });

  // DELETE handler - session termination
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling session termination:", error);
      if (!res.headersSent) {
        res.status(500).send("Error processing session termination");
      }
    }
  });

  // Start listening
  const server = app.listen(options.port, options.host, () => {
    console.error(
      `MCP HTTP server listening on http://${options.host}:${options.port}/mcp`,
    );
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.error("Shutting down HTTP server...");

    // Close all active transports
    for (const [sessionId, transport] of transports) {
      try {
        console.error(`Closing session: ${sessionId}`);
        await transport.close();
      } catch (error) {
        console.error(`Error closing session ${sessionId}:`, error);
      }
    }
    transports.clear();

    server.close(() => {
      console.error("HTTP server shutdown complete");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}

/**
 * Get the transports map (for testing)
 * @internal
 */
export function _getTransports(): Map<string, StreamableHTTPServerTransport> {
  return transports;
}

/**
 * Clear all transports (for testing)
 * @internal
 */
export function _clearTransports(): void {
  transports.clear();
}
