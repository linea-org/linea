import { disposeAllClients } from "@configcat/sdk"
import { afterEach, describe, expect, it, vi } from "vitest"

async function loadFresh() {
  vi.resetModules()
  return import("./evaluate-flags.js")
}

afterEach(() => {
  vi.unstubAllEnvs()
  // The SDK keeps one client per SDK key for the whole process, across module reloads.
  disposeAllClients()
})

describe("flags without a ConfigCat SDK key", () => {
  it("resolves every flag to its declared default", async () => {
    vi.stubEnv("CONFIGCAT_SDK_KEY", "")
    vi.stubEnv("FEATURE_FLAGS", "")
    const { evaluateFlags, isFlagEnabled } = await loadFresh()
    expect(await isFlagEnabled("platformModelKey", "workspace-1")).toBe(false)
    expect(await evaluateFlags("workspace-1")).toEqual({
      platformModelKey: false,
    })
  })

  it("turns on the flags listed in FEATURE_FLAGS", async () => {
    vi.stubEnv("CONFIGCAT_SDK_KEY", "")
    vi.stubEnv("FEATURE_FLAGS", " platformModelKey ")
    const { isFlagEnabled } = await loadFresh()
    expect(await isFlagEnabled("platformModelKey", "workspace-1")).toBe(true)
  })

  it("refuses an unknown flag name in FEATURE_FLAGS", async () => {
    vi.stubEnv("CONFIGCAT_SDK_KEY", "")
    vi.stubEnv("FEATURE_FLAGS", "platformModelKey,notAFlag")
    const { isFlagEnabled } = await loadFresh()
    await expect(isFlagEnabled("platformModelKey", "w")).rejects.toThrow(
      "FEATURE_FLAGS names unknown flags: notAFlag"
    )
  })

  it("refuses to load in production, before any flag is read", async () => {
    vi.stubEnv("CONFIGCAT_SDK_KEY", "")
    vi.stubEnv("NODE_ENV", "production")
    await expect(loadFresh()).rejects.toThrow(
      "CONFIGCAT_SDK_KEY is required in production"
    )
  })
})
