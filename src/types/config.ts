import { z } from "zod";

/**
 * Configuration schema for Odoo connection
 */
export const OdooConfigSchema = z.object({
  url: z.string().min(1),
  db: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

export type OdooConfig = z.infer<typeof OdooConfigSchema>;

/**
 * Environment variable names for configuration
 */
export const ENV_VARS = {
  URL: "ODOO_URL",
  DB: "ODOO_DB",
  USERNAME: "ODOO_USERNAME",
  PASSWORD: "ODOO_PASSWORD",
  TIMEOUT: "ODOO_TIMEOUT",
  VERIFY_SSL: "ODOO_VERIFY_SSL",
  // HTTP transport config
  MCP_PORT: "ODOO_MCP_PORT",
  MCP_HOST: "ODOO_MCP_HOST",
} as const;

/**
 * Config file paths to check (in order of priority)
 */
export const CONFIG_PATHS = [
  "./odoo_config.json",
  "~/.config/odoo/config.json",
  "~/.odoo_config.json",
] as const;
