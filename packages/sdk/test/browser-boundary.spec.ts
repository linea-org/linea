import { build } from "esbuild"
import { describe, expect, it } from "vitest"

describe("end-user browser and React Native boundary", () => {
  it("bundles the user entry without Node built-ins", async () => {
    const result = await build({
      entryPoints: ["src/user.ts"],
      bundle: true,
      format: "esm",
      platform: "browser",
      write: false,
    })
    expect(result.errors).toEqual([])
    expect(result.outputFiles).toHaveLength(1)
  })

  it("bundles the user entry for a neutral React Native runtime", async () => {
    const result = await build({
      entryPoints: ["src/user.ts"],
      bundle: true,
      format: "esm",
      platform: "neutral",
      mainFields: ["module", "main"],
      write: false,
    })
    expect(result.errors).toEqual([])
    expect(result.outputFiles).toHaveLength(1)
  })
})
