import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/user.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  platform: "neutral",
  external: ["@linea/protocol"],
})
