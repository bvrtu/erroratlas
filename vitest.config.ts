import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["work/**", "dist/**", "node_modules/**"],
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/cli.ts", "src/index.ts", "src/types.ts"],
      thresholds: {
        branches: 70,
        lines: 80,
        functions: 80,
        statements: 75,
      },
    },
  },
});
