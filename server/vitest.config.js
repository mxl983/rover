import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    globals: false,
    setupFiles: ["./test/setup.js"],
    include: ["src/**/*.test.js", "test/**/*.test.js"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
