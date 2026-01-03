import { OdooClient } from "../../../connection/odoo-client.js";
import type { IOdooClient } from "../../../types/index.js";
import { getOdooUrl, TEST_CONFIG } from "./skip-condition.js";

export interface TestClientOptions {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  timeout?: number;
}

export interface TestClientResult {
  client: IOdooClient;
  config: {
    url: string;
    database: string;
    username: string;
  };
  cleanup: () => Promise<void>;
}

/**
 * Create a real OdooClient for integration testing
 */
export async function createTestClient(
  options: TestClientOptions = {},
): Promise<TestClientResult> {
  const host = options.host ?? TEST_CONFIG.host;
  const port = options.port ?? TEST_CONFIG.port;
  const database = options.database ?? TEST_CONFIG.database;
  const username = options.username ?? TEST_CONFIG.username;
  const password = options.password ?? TEST_CONFIG.password;
  const timeout = options.timeout ?? TEST_CONFIG.timeout;

  const url = getOdooUrl(host, port);

  const client = new OdooClient(
    {
      url,
      db: database,
      username,
      password,
    },
    { timeout },
  );

  // Connect to Odoo
  await client.connect();

  return {
    client,
    config: {
      url,
      database,
      username,
    },
    cleanup: async () => {
      // OdooClient doesn't have explicit cleanup,
      // but we could add connection pooling cleanup here later
    },
  };
}

/**
 * Generate a unique database name for test isolation
 */
export function generateTestDatabaseName(prefix: string = "test"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  options: { timeout?: number; interval?: number; message?: string } = {},
): Promise<void> {
  const {
    timeout = 30000,
    interval = 1000,
    message = "Condition not met",
  } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`${message} (timeout after ${timeout}ms)`);
}
