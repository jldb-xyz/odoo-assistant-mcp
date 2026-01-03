/**
 * Global setup for integration tests
 * Creates a unique test database from template for each test run
 */

import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseManager } from "./db-manager.js";
import {
  getOdooVersion,
  getTestDatabaseName,
  getVersionConfig,
  isDockerAvailable,
  isOdooRunning,
  setTestDatabaseName,
  TEST_CONFIG,
} from "./skip-condition.js";

const DB_NAME_FILE = join(process.cwd(), ".test-db-name");

/**
 * Generate a unique database name for this test run
 */
function generateTestDatabaseName(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `odoo_test_${timestamp}_${random}`;
}

export async function setup(): Promise<void> {
  // Check if we should skip integration tests
  if (process.env.SKIP_INTEGRATION_TESTS === "true") {
    console.log(
      "Integration tests will be skipped (SKIP_INTEGRATION_TESTS=true)",
    );
    return;
  }

  if (!isDockerAvailable()) {
    console.log("Integration tests will be skipped (Docker not available)");
    return;
  }

  const odooRunning = await isOdooRunning();
  if (!odooRunning) {
    console.log(
      `Integration tests will be skipped (Odoo not running at ${TEST_CONFIG.host}:${TEST_CONFIG.port})`,
    );
    return;
  }

  const version = getOdooVersion();
  const versionConfig = getVersionConfig();
  const templateDatabase = versionConfig.template;

  console.log(`Setting up integration test environment for Odoo ${version}...`);

  // Generate unique database name and write to file for tests to read
  const testDbName = process.env.ODOO_TEST_DB || generateTestDatabaseName();
  writeFileSync(DB_NAME_FILE, testDbName, "utf-8");
  setTestDatabaseName(testDbName);

  console.log(`Test database: ${testDbName}`);

  const dbManager = new DatabaseManager({
    masterPassword: process.env.ODOO_MASTER_PASSWORD ?? "admin",
  });

  // Check if template database exists
  const templateExists = await dbManager.databaseExists(templateDatabase);
  if (!templateExists) {
    console.log(
      `Template database '${templateDatabase}' not found. Please ensure Odoo ${version} has been initialized with the template database.`,
    );
    console.log("Run: yarn docker:up && yarn docker:wait");
    throw new Error(`Template database '${templateDatabase}' not found`);
  }

  // Clone unique test database from template
  console.log(
    `Creating test database from template: ${templateDatabase} -> ${testDbName}`,
  );
  await dbManager.duplicateDatabase(templateDatabase, testDbName);

  console.log("Integration test environment ready");
}

export async function teardown(): Promise<void> {
  // Check if we should skip cleanup
  if (process.env.SKIP_INTEGRATION_TESTS === "true") {
    return;
  }

  if (!isDockerAvailable()) {
    return;
  }

  const odooRunning = await isOdooRunning();
  if (!odooRunning) {
    return;
  }

  const testDbName = getTestDatabaseName();

  // Clean up the db name file
  try {
    unlinkSync(DB_NAME_FILE);
  } catch {
    // Ignore if file doesn't exist
  }

  // Optionally keep the database for debugging
  if (process.env.KEEP_TEST_DATABASE === "true") {
    console.log(`Keeping test database for debugging: ${testDbName}`);
    return;
  }

  console.log("Cleaning up integration test environment...");

  const dbManager = new DatabaseManager({
    masterPassword: process.env.ODOO_MASTER_PASSWORD ?? "admin",
  });

  // Drop the unique test database
  console.log(`Dropping test database: ${testDbName}`);
  await dbManager.dropDatabase(testDbName);

  console.log("Integration test environment cleaned up");
}
