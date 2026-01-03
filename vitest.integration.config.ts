import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/integration/**/*.integration.test.ts"],
    // Global setup/teardown for clean database per test run
    globalSetup: ["src/__tests__/integration/setup/globalSetup.ts"],
    // Longer timeouts for real Odoo operations
    testTimeout: 30000,
    hookTimeout: 120000,
    // Run tests sequentially to avoid conflicts
    sequence: {
      concurrent: false,
    },
    // Single retry for flaky network tests
    retry: 1,
    // Sequential execution - one test at a time
    fileParallelism: false,
  },
});
