import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.integration.test.ts"],
    setupFiles: [resolve(__dirname, "test/setup.ts")],
    globalSetup: [resolve(__dirname, "test/globalSetup.ts")],
    environment: "node",
    // Emulator is shared; avoid cross-file interference by running one file at a time.
    fileParallelism: !process.env.FIRESTORE_EMULATOR_HOST,
  },
});
