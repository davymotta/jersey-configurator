import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: {
    alias: { "@shared": path.resolve(import.meta.dirname, "shared") },
  },
  test: { include: ["server/**/*.test.ts"], testTimeout: 15000 },
});
