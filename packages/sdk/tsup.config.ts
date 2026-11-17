import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    user: "src/user.ts",
    webhooks: "src/webhooks.ts",
    server: "src/server.ts",
  },
  format: ["esm", "cjs"],
  dts: {
    resolve: [/^@linealabs\/protocol/],
    compilerOptions: {
      paths: { "@linealabs/protocol/*": ["../protocol/src/*.ts"] },
    },
  },
  clean: true,
  sourcemap: true,
  target: "es2022",
  platform: "neutral",
  // @linealabs/protocol stays private; bundling it keeps its native re2 dependency
  // off users' machines.
  noExternal: ["@linealabs/protocol"],
})
