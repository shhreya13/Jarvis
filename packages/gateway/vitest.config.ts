import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@jarvis/core": path.resolve(__dirname, "../core/src/index.ts"),
      "@jarvis/skills": path.resolve(__dirname, "../skills/src/index.ts"),
      "@jarvis/tools": path.resolve(__dirname, "../tools/src/index.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
