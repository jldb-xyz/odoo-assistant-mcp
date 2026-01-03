import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Odoo version configuration
 * Set ODOO_VERSION env var to select version (14, 15, 16, 17, 18, or 19)
 */
export const ODOO_VERSIONS = {
  14: { port: 8014, image: "odoo:14", template: "odoo_template_14" },
  15: { port: 8015, image: "odoo:15", template: "odoo_template_15" },
  16: { port: 8016, image: "odoo:16", template: "odoo_template_16" },
  17: { port: 8017, image: "odoo:17", template: "odoo_template_17" },
  18: { port: 8018, image: "odoo:18", template: "odoo_template_18" },
  19: { port: 8019, image: "odoo:19", template: "odoo_template_19" },
} as const;

export type OdooVersion = keyof typeof ODOO_VERSIONS;

/**
 * Get the current Odoo version from env var (default: 17)
 */
export function getOdooVersion(): OdooVersion {
  const version = parseInt(process.env.ODOO_VERSION || "17", 10);
  if (version in ODOO_VERSIONS) {
    return version as OdooVersion;
  }
  return 17;
}

/**
 * Get version-specific configuration
 */
export function getVersionConfig() {
  return ODOO_VERSIONS[getOdooVersion()];
}

const DB_NAME_FILE = join(process.cwd(), ".test-db-name");

// Mutable database name - set by globalSetup, read by tests
let testDatabaseName: string | null = null;

/**
 * Get the test database name
 * Reads from file if set by globalSetup, otherwise uses env var or default
 */
export function getTestDatabaseName(): string {
  // Return cached value if set
  if (testDatabaseName) {
    return testDatabaseName;
  }

  // Try to read from file (set by globalSetup)
  if (existsSync(DB_NAME_FILE)) {
    testDatabaseName = readFileSync(DB_NAME_FILE, "utf-8").trim();
    return testDatabaseName;
  }

  // Fall back to env var or default
  return process.env.ODOO_TEST_DB || "odoo_test";
}

/**
 * Set the test database name (called by globalSetup)
 */
export function setTestDatabaseName(name: string): void {
  testDatabaseName = name;
}

/**
 * Default test configuration
 * Port defaults to version-specific port (8016, 8017, 8018)
 */
export const TEST_CONFIG = {
  host: process.env.ODOO_TEST_HOST || "localhost",
  get port(): number {
    return parseInt(
      process.env.ODOO_TEST_PORT || String(getVersionConfig().port),
      10,
    );
  },
  // Database name is dynamic - use getter
  get database(): string {
    return getTestDatabaseName();
  },
  username: process.env.ODOO_TEST_USERNAME || "admin",
  password: process.env.ODOO_TEST_PASSWORD || "admin",
  timeout: parseInt(process.env.ODOO_TEST_TIMEOUT || "30000", 10),
};

/**
 * Check if Docker daemon is running
 */
export function isDockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a specific container is running
 */
export function isContainerRunning(containerName: string): boolean {
  try {
    const result = execSync(
      `docker ps --filter "name=${containerName}" --format "{{.Names}}"`,
      { encoding: "utf-8" },
    );
    return result.includes(containerName);
  } catch {
    return false;
  }
}

/**
 * Check if Odoo is responding at the given host/port
 */
export async function isOdooRunning(
  host: string = TEST_CONFIG.host,
  port: number = TEST_CONFIG.port,
): Promise<boolean> {
  try {
    const response = await fetch(`http://${host}:${port}/web/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    // Try XML-RPC endpoint as fallback
    try {
      const response = await fetch(`http://${host}:${port}/xmlrpc/2/common`, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: '<?xml version="1.0"?><methodCall><methodName>version</methodName></methodCall>',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Check if integration tests should run
 * Returns a reason string if tests should be skipped, otherwise null
 */
export async function shouldSkipIntegrationTests(): Promise<string | null> {
  // Check for explicit skip flag
  if (process.env.SKIP_INTEGRATION_TESTS === "true") {
    return "SKIP_INTEGRATION_TESTS is set";
  }

  // Check Docker availability
  if (!isDockerAvailable()) {
    return "Docker is not available";
  }

  // Check if Odoo is running
  const odooRunning = await isOdooRunning();
  if (!odooRunning) {
    return `Odoo is not running at ${TEST_CONFIG.host}:${TEST_CONFIG.port}`;
  }

  return null;
}

/**
 * Get the Odoo URL for testing
 */
export function getOdooUrl(
  host: string = TEST_CONFIG.host,
  port: number = TEST_CONFIG.port,
): string {
  return `http://${host}:${port}`;
}
