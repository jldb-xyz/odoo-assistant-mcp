import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  OdooConfigSchema,
  type OdooConfig,
  ENV_VARS,
  CONFIG_PATHS,
} from "../types/index.js";

/**
 * Expand ~ to home directory
 */
function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Load config from environment variables
 */
function loadFromEnv(): OdooConfig | null {
  const url = process.env[ENV_VARS.URL];
  const db = process.env[ENV_VARS.DB];
  const username = process.env[ENV_VARS.USERNAME];
  const password = process.env[ENV_VARS.PASSWORD];

  if (url && db && username && password) {
    return OdooConfigSchema.parse({ url, db, username, password });
  }

  return null;
}

/**
 * Load Odoo configuration from environment variables or config files
 *
 * Priority:
 * 1. Environment variables (ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD)
 * 2. Config files in order: ./odoo_config.json, ~/.config/odoo/config.json, ~/.odoo_config.json
 */
export function loadConfig(): OdooConfig {
  // Try environment variables first
  const envConfig = loadFromEnv();
  if (envConfig) {
    return envConfig;
  }

  // Try config files
  for (const configPath of CONFIG_PATHS) {
    const expandedPath = expandPath(configPath);
    if (fs.existsSync(expandedPath)) {
      const content = fs.readFileSync(expandedPath, "utf-8");
      const parsed: unknown = JSON.parse(content);
      return OdooConfigSchema.parse(parsed);
    }
  }

  throw new Error(
    "No Odoo configuration found. Please set environment variables (ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD) or create an odoo_config.json file."
  );
}

/**
 * Get client options from environment variables
 */
export function getClientOptions(): { timeout: number; verifySsl: boolean } {
  const timeoutStr = process.env[ENV_VARS.TIMEOUT];
  const timeout = timeoutStr ? parseInt(timeoutStr, 10) * 1000 : 30000;

  const verifySslStr = process.env[ENV_VARS.VERIFY_SSL] ?? "1";
  const verifySsl = ["1", "true", "yes"].includes(verifySslStr.toLowerCase());

  return { timeout, verifySsl };
}
