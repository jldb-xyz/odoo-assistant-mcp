import * as net from "node:net";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { OdooClient } from "./connection/odoo-client.js";
import { createMcpHttpHandler, runHttpServer } from "./http-server.js";
import { _resetClient, createServer } from "./server.js";
import { MockClientBuilder } from "./test-utils/mock-client.js";
import { createToolRegistry, defineTool } from "./tools/registry.js";

/**
 * A minimal registry so these tests exercise transport wiring, not the real
 * Odoo tool surface.
 */
function testRegistry() {
  const registry = createToolRegistry();
  registry.register(
    defineTool({
      name: "echo",
      description: "Echo the supplied message back",
      inputSchema: { message: z.string().describe("Message to echo") },
      handler: async (_client, input) => ({
        success: true,
        result: { text: `echo: ${input.message}` },
      }),
    }),
  );
  return registry;
}

function handlerUnderTest() {
  const client = new MockClientBuilder().build();
  return createMcpHttpHandler(() =>
    createServer({ client, toolRegistry: testRegistry() }),
  );
}

/**
 * Connect a real MCP client to the handler in-process: the URL is never
 * dialed, `handler.fetch` serves the request directly.
 */
async function connectClient(
  handler: ReturnType<typeof handlerUnderTest>,
  options?: ConstructorParameters<typeof Client>[1],
): Promise<Client> {
  const client = new Client({ name: "test-client", version: "1.0.0" }, options);
  const transport = new StreamableHTTPClientTransport(
    new URL("http://127.0.0.1/mcp"),
    { fetch: (url, init) => handler.fetch(new Request(url, init)) },
  );
  await client.connect(transport);
  return client;
}

describe("http-server", () => {
  describe("2026-07-28 protocol revision", () => {
    it("serves tools/list to a client pinned to 2026-07-28", async () => {
      const handler = handlerUnderTest();
      const client = await connectClient(handler, {
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      });

      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("echo");

      await client.close();
      await handler.close();
    });

    it("serves tools/call to a client pinned to 2026-07-28", async () => {
      const handler = handlerUnderTest();
      const client = await connectClient(handler, {
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      });

      const result = await client.callTool({
        name: "echo",
        arguments: { message: "hello" },
      });

      expect(result.content).toEqual([{ type: "text", text: "echo: hello" }]);

      await client.close();
      await handler.close();
    });
  });

  describe("2025-era backward compatibility", () => {
    it("still serves a legacy client that uses the initialize handshake", async () => {
      const handler = handlerUnderTest();
      // 'legacy' is the client default: the plain 2025 connect sequence.
      const client = await connectClient(handler, {
        versionNegotiation: { mode: "legacy" },
      });

      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("echo");

      const result = await client.callTool({
        name: "echo",
        arguments: { message: "legacy" },
      });
      expect(result.content).toEqual([{ type: "text", text: "echo: legacy" }]);

      await client.close();
      await handler.close();
    });
  });

  describe("server identity", () => {
    it("advertises the real package version over the protocol", async () => {
      // Asserting the exported constant alone would not catch createServer
      // being wired to a different value.
      const pkg = (await import("../package.json", {
        with: { type: "json" },
      })) as { default: { name: string; version: string } };

      const odooClient = new MockClientBuilder().build();
      const handler = createMcpHttpHandler(() =>
        createServer({ client: odooClient }),
      );
      const client = await connectClient(handler, {
        versionNegotiation: { mode: "legacy" },
      });

      const info = client.getServerVersion();
      expect(info?.version).toBe(pkg.default.version);
      expect(info?.name).toBe(pkg.default.name);

      await client.close();
      await handler.close();
    });
  });

  describe("tool metadata", () => {
    it("advertises titles and annotations for every real tool", async () => {
      const odooClient = new MockClientBuilder().build();
      const handler = createMcpHttpHandler(() =>
        createServer({ client: odooClient }),
      );
      const client = await connectClient(handler, {
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      });

      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);

      for (const tool of tools) {
        expect(tool.title, `${tool.name} is missing a title`).toBeTruthy();
        expect(
          tool.annotations,
          `${tool.name} is missing annotations`,
        ).toBeDefined();
        expect(typeof tool.annotations?.readOnlyHint).toBe("boolean");
        expect(typeof tool.annotations?.openWorldHint).toBe("boolean");
      }

      const byName = new Map(tools.map((t) => [t.name, t]));

      // Anything that can destroy Odoo data must say so.
      for (const name of [
        "bulk_operation",
        "execute_method",
        "execute_action",
      ]) {
        expect(byName.get(name)?.annotations?.readOnlyHint, name).toBe(false);
        expect(byName.get(name)?.annotations?.destructiveHint, name).toBe(true);
      }

      // Pure lookups must not be flagged destructive.
      for (const name of ["search_records", "list_models", "read_doc"]) {
        expect(byName.get(name)?.annotations?.readOnlyHint, name).toBe(true);
      }

      await client.close();
      await handler.close();
    });

    it("publishes schema constraints declared on the tool's Zod object", async () => {
      // The registered schema used to be re-declared by hand, which silently
      // dropped bulk_operation's batch_size bounds from the published schema.
      const odooClient = new MockClientBuilder().build();
      const handler = createMcpHttpHandler(() =>
        createServer({ client: odooClient }),
      );
      const client = await connectClient(handler, {
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      });

      const { tools } = await client.listTools();
      const bulk = tools.find((t) => t.name === "bulk_operation");
      const batchSize = (
        bulk?.inputSchema as {
          properties?: Record<string, { minimum?: number; maximum?: number }>;
        }
      )?.properties?.batch_size;

      expect(batchSize?.minimum).toBe(1);
      expect(batchSize?.maximum).toBe(1000);

      await client.close();
      await handler.close();
    });
  });

  describe("tool errors", () => {
    it("reports a failing tool as an error rather than a success", async () => {
      const registry = createToolRegistry();
      registry.register(
        defineTool({
          name: "always_fails",
          description: "Always fails",
          inputSchema: {},
          handler: async () => ({
            success: false,
            error: "Odoo said no",
          }),
        }),
      );
      const odooClient = new MockClientBuilder().build();
      const handler = createMcpHttpHandler(() =>
        createServer({ client: odooClient, toolRegistry: registry }),
      );
      const client = await connectClient(handler, {
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      });

      const result = await client.callTool({
        name: "always_fails",
        arguments: {},
      });

      expect(result.isError).toBe(true);

      await client.close();
      await handler.close();
    });
  });

  describe("runHttpServer", () => {
    const running: Array<import("node:http").Server> = [];

    afterEach(async () => {
      await Promise.all(
        running.splice(0).map(
          (server) =>
            new Promise<void>((resolve) => {
              server.close(() => resolve());
              server.closeAllConnections?.();
            }),
        ),
      );
      _resetClient();
    });

    /** Start the real HTTP server on an ephemeral port. */
    async function start() {
      const odooClient = new MockClientBuilder().build();
      const server = await runHttpServer(
        { port: 0, host: "127.0.0.1" },
        {
          initClient: async () => odooClient as unknown as OdooClient,
          handleSignals: false,
        },
      );
      running.push(server);
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("expected a TCP address");
      }
      return { server, port: address.port };
    }

    /**
     * Issue a raw HTTP request so headers like `Host` — which fetch() refuses
     * to set — can be controlled exactly.
     */
    /** Raw GET against an arbitrary path, with full control of the headers. */
    function rawRequestPath(
      port: number,
      path: string,
      headers: string,
    ): Promise<string> {
      return new Promise((resolve, reject) => {
        const socket = net.connect(port, "127.0.0.1", () => {
          socket.write(
            `GET ${path} HTTP/1.1\r\n${headers}\r\nConnection: close\r\n\r\n`,
          );
        });
        let data = "";
        const finish = () => {
          socket.destroy();
          resolve(data.split("\r\n")[0] ?? "");
        };
        socket.on("data", (chunk) => {
          data += chunk;
          if (data.includes("\r\n")) finish();
        });
        socket.on("error", reject);
        socket.on("close", finish);
      });
    }

    function rawRequest(port: number, headers: string): Promise<string> {
      return new Promise((resolve, reject) => {
        const body = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}';
        const socket = net.connect(port, "127.0.0.1", () => {
          socket.write(
            `POST /mcp HTTP/1.1\r\n${headers}\r\n` +
              "Content-Type: application/json\r\n" +
              "Accept: application/json, text/event-stream\r\n" +
              `Content-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`,
          );
        });
        let data = "";
        const finish = () => {
          socket.destroy();
          resolve(data.split("\r\n")[0] ?? "");
        };
        socket.on("data", (chunk) => {
          data += chunk;
          // A success may upgrade to a long-lived SSE stream, so settle as soon
          // as the status line has arrived rather than waiting for close.
          if (data.includes("\r\n")) finish();
        });
        socket.on("error", reject);
        socket.on("close", finish);
      });
    }

    it("serves MCP over a real socket", async () => {
      const { port } = await start();

      const client = new Client({ name: "e2e", version: "1.0.0" });
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${port}/mcp`),
        ),
      );

      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);

      await client.close();
    });

    it("rejects a spoofed Host header (DNS rebinding)", async () => {
      const { port } = await start();
      const status = await rawRequest(port, "Host: evil.example.com");
      expect(status).toContain("403");
    });

    it("rejects a foreign Origin header", async () => {
      const { port } = await start();
      const status = await rawRequest(
        port,
        `Host: 127.0.0.1:${port}\r\nOrigin: http://evil.example.com`,
      );
      expect(status).toContain("403");
    });

    it("accepts a loopback Host", async () => {
      const { port } = await start();
      const status = await rawRequest(port, `Host: 127.0.0.1:${port}`);
      expect(status).not.toContain("403");
    });

    it("returns 404 for paths other than /mcp", async () => {
      const { port } = await start();
      const response = await fetch(`http://127.0.0.1:${port}/not-mcp`);
      expect(response.status).toBe(404);
    });

    describe("health probes", () => {
      // Container orchestrators need a probe target. Without these the only
      // reachable path is /mcp, which answers 405 to GET.
      it("answers /health with 200 for liveness", async () => {
        const { port } = await start();
        const response = await fetch(`http://127.0.0.1:${port}/health`);

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain(
          "application/json",
        );
        await expect(response.json()).resolves.toMatchObject({ status: "ok" });
      });

      it("answers /ready with 200 once the Odoo client is initialised", async () => {
        const { port } = await start();
        const response = await fetch(`http://127.0.0.1:${port}/ready`);

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
          status: "ready",
        });
      });

      it("answers /ready with 503 when no Odoo client is initialised", async () => {
        const { port } = await start();
        // Simulate losing the connection this instance started with.
        _resetClient();

        const response = await fetch(`http://127.0.0.1:${port}/ready`);
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({
          status: "not-ready",
        });
      });

      it("reports the server version on /health", async () => {
        const pkg = (await import("../package.json", {
          with: { type: "json" },
        })) as { default: { version: string } };
        const { port } = await start();

        const body = (await (
          await fetch(`http://127.0.0.1:${port}/health`)
        ).json()) as { version: string };
        expect(body.version).toBe(pkg.default.version);
      });

      it("does not require a Host header allowlist bypass", async () => {
        // Probes come from the kubelet/Docker with an arbitrary Host, so the
        // DNS-rebinding guard must not reject them before they are answered.
        const { port } = await start();
        const status = await rawRequestPath(
          port,
          "/health",
          "Host: 10.1.2.3:8080",
        );
        expect(status).toContain("200");
      });
    });

    it("accepts a Host named in allowedHosts", async () => {
      // Behind an ingress or Service the Host is the public name, not
      // localhost, so a deployment needs a way to allow it. Without this the
      // server is unreachable anywhere except a loopback bind.
      const odooClient = new MockClientBuilder().build();
      const server = await runHttpServer(
        { port: 0, host: "127.0.0.1", allowedHosts: ["odoo-mcp.internal"] },
        {
          initClient: async () => odooClient as unknown as OdooClient,
          handleSignals: false,
        },
      );
      running.push(server);
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("expected a TCP address");
      }

      const allowed = await rawRequest(address.port, "Host: odoo-mcp.internal");
      expect(allowed).not.toContain("403");

      const denied = await rawRequest(address.port, "Host: evil.example.com");
      expect(denied).toContain("403");
    });

    it("rejects rather than hangs when the port is already bound", async () => {
      const blocker = net.createServer();
      await new Promise<void>((resolve) =>
        blocker.listen(0, "127.0.0.1", resolve),
      );
      const address = blocker.address();
      if (address === null || typeof address === "string") {
        throw new Error("expected a TCP address");
      }

      const odooClient = new MockClientBuilder().build();
      await expect(
        runHttpServer(
          { port: address.port, host: "127.0.0.1" },
          {
            initClient: async () => odooClient as unknown as OdooClient,
            handleSignals: false,
          },
        ),
      ).rejects.toMatchObject({ code: "EADDRINUSE" });

      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    });
  });
});
