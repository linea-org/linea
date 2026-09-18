import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/registry.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  external: ["@anthropic-ai/sdk", "openai", "@linea/db"],
})
