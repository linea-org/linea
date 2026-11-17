import { defineConfig } from "tsup"

export default defineConfig({
  entry: { index: "src/index.ts", copilotkit: "src/copilotkit.ts" },
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
  external: [
    "react",
    "react/jsx-runtime",
    "@linealabs/sdk/user",
    "@copilotkit/react-core/v2",
    "zod",
  ],
})
