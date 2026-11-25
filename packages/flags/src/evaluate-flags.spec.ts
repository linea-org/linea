import { afterEach, describe, expect, it, vi } from "vitest"

async function loadFresh() {
  vi.resetModules()
  return import("./evaluate-flags.js")
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("flags without a ConfigCat SDK key", () => {
  it("are all off", async () => {
    vi.stubEnv("CONFIGCAT_SDK_KEY", "")
    const { evaluateFlags, isFlagEnabled } = await loadFresh()
    expect(await isFlagEnabled("platformModelKey", "workspace-1")).toBe(false)
    expect(await evaluateFlags("workspace-1")).toEqual({
      platformModelKey: false,
      assistantMentions: false,
      parallelBranches: false,
      pauseConnectorWrites: false,
      pauseMcpTools: false,
      pauseInkyWeb: false,
      pauseWebhooks: false,
    })
  })

  it("refuse to load in production, before any flag is read", async () => {
    vi.stubEnv("CONFIGCAT_SDK_KEY", "")
    vi.stubEnv("NODE_ENV", "production")
    await expect(loadFresh()).rejects.toThrow(
      "CONFIGCAT_SDK_KEY is required in production"
    )
  })
})
