import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests need a live Odoo and have their own config; without
    // this they get swept in here and self-skip, which is just noise. Only the
    // *.integration.test.ts files are excluded, so unit tests covering the
    // integration harness itself still run here.
    exclude: ["src/__tests__/integration/**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/__tests__/**",
        "src/test-utils/**",
      ],
    },
  },
});
