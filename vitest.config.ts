import path from "node:path";
import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Agent worktrees hold stale checkouts of this same suite; never run those copies.
    // The standalone build copies the project (tests included) into .next; never run those copies either.
    exclude: [...defaultExclude, ".ai/**", ".next/**"],
  },
});
