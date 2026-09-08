import { build } from "esbuild"
import { describe, expect, it } from "vitest"

describe("browser boundary", () => {
  it("bundles every public export without Node built-ins", async () => {
    const result = await build({
      entryPoints: [
        "src/index.ts",
        "src/errors.ts",
        "src/events.ts",
        "src/operations.ts",
        "src/resources.ts",
        "src/shared.ts",
        "src/webhooks.ts",
      ],
      bundle: true,
      format: "esm",
      outdir: "browser-test",
      platform: "browser",
      write: false,
    })
    expect(result.errors).toEqual([])
    expect(result.outputFiles).toHaveLength(7)
  })
})
