/**
 * Library entry point.
 *
 * Kept separate from `index.ts`, which is the CLI and starts a server on
 * import. Embedders — a Cloudflare Worker, a custom host, a test harness —
 * import from here and decide their own lifecycle.
 */

export { type CliOptions, parseArgs } from "./cli.js";
export { getClientOptions, loadConfig } from "./connection/config.js";
export {
  OdooClient,
  type OdooClientOptions,
} from "./connection/odoo-client.js";
export {
  createMcpHttpHandler,
  type HttpServerDependencies,
  type HttpServerOptions,
  runHttpServer,
} from "./http-server.js";
export {
  createServer,
  formatToolResult,
  runServer,
  SERVER_NAME,
  SERVER_VERSION,
  type ServerDependencies,
} from "./server.js";
export {
  allToolDefinitions,
  createOdooToolRegistry,
  createToolRegistry,
  defineTool,
  type ToolDefinition,
  ToolRegistry,
  type ToolResult,
} from "./tools/index.js";
export type {
  Domain,
  IOdooClient,
  OdooConfig,
  OdooFieldDef,
  OdooModelInfo,
} from "./types/index.js";
