/**
 * Odoo MCP server on Cloudflare Workers.
 *
 * `createMcpHandler` is fetch-shaped, so the MCP layer maps onto a Worker
 * directly — no Node HTTP server involved.
 *
 * Verified working: the Odoo tools reach Odoo over XML-RPC through
 * `nodejs_compat`, on both the 2026-07-28 and 2025-era protocols.
 *
 * Not available on Workers (each fails cleanly as a tool error rather than
 * taking the Worker down):
 *
 *   - list_excel_sheets / convert_excel — Workers has a virtual in-memory
 *     filesystem, so there is no local spreadsheet to read.
 *   - read_doc / save_doc / list_sops / save_sop — the bundled docs are not in
 *     the Worker bundle, and ~/.odoo-mcp and ./.odoo-mcp do not exist. Writes
 *     fail with "operation not permitted".
 *
 * See docs/DEPLOYMENT.md.
 */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer, OdooClient } from "odoo-mcp";

interface Env {
  ODOO_URL: string;
  ODOO_DB: string;
  ODOO_USERNAME: string;
  /** Store with `wrangler secret put ODOO_PASSWORD`, never in wrangler.jsonc. */
  ODOO_PASSWORD: string;
  /** Optional shared secret; see the auth note below. */
  MCP_BEARER_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    // Workers has no reverse proxy in front by default, so unlike the Node
    // deployments there is nowhere else to put authentication. A static token
    // is the minimum; prefer Cloudflare Access in front of the route for real
    // identity, per-user attribution and revocation.
    if (env.MCP_BEARER_TOKEN) {
      const supplied = request.headers.get("authorization");
      if (supplied !== `Bearer ${env.MCP_BEARER_TOKEN}`) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404 });
    }

    // Built per request on purpose: Workers only permits node:http outside a
    // fetch handler to fail, and there is no long-lived process to hold a
    // connection anyway. Odoo authenticates on each request.
    const client = new OdooClient({
      url: env.ODOO_URL,
      db: env.ODOO_DB,
      username: env.ODOO_USERNAME,
      password: env.ODOO_PASSWORD,
    });
    await client.connect();

    const handler = createMcpHandler(() => createServer({ client }));
    return handler.fetch(request);
  },
};
