import { defineConfig } from "vitest/config";

// An explicit config matters here: without one, Vitest searches upward from the
// project for a Vite config and will pick up an unrelated file from a parent
// directory. Pinning root and include keeps `npm test` reproducible wherever the
// repository is checked out.
export default defineConfig({
  root: __dirname,
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    reporters: "default",
  },
});
