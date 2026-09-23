import { defineConfig } from "tsup"

export default defineConfig({
  entry: { index: "src/index.ts", copilotkit: "src/copilotkit.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  platform: "neutral",
  external: [
    "react",
    "react/jsx-runtime",
    "@linea/protocol",
    "@linea/sdk/user",
    "@copilotkit/react-core/v2",
    "zod",
  ],
})
