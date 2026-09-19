import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    user: "src/user.ts",
    webhooks: "src/webhooks.ts",
    server: "src/server.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  platform: "neutral",
  external: ["@linea/protocol"],
})
