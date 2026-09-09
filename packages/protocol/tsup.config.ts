import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    errors: "src/errors.ts",
    events: "src/events.ts",
    operations: "src/operations.ts",
    resources: "src/resources.ts",
    shared: "src/shared.ts",
    webhooks: "src/webhooks.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  platform: "browser",
  external: ["zod"],
})
