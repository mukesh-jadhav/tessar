/**
 * Vitest config for apps/web.
 *
 * Node environment — these tests cover server-only modules (route
 * handlers, lib/runs/*, Stripe webhook). UI/component tests are
 * handled by Storybook + interaction tests separately.
 *
 * The ``server-only`` package is aliased to a no-op so test imports
 * don't blow up.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": here,
      "server-only": path.resolve(here, "vitest.server-only-shim.ts"),
    },
  },
});
