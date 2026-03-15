import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.integration.test.ts"],
    setupFiles: [resolve(__dirname, "test/setup.ts")],
    globalSetup: [resolve(__dirname, "test/globalSetup.ts")],
    environment: "node",
  },
});
