import { disposeAllClients, FetchResponse } from "@configcat/sdk"
import { afterEach, describe, expect, it, vi } from "vitest"

const SDK_KEY = `configcat-sdk-1/${"a".repeat(22)}/${"b".repeat(22)}`

// The config ConfigCat would serve: platformModelKey is off, except for workspace "ws-on".
const CONFIG_JSON = JSON.stringify({
  p: { u: "https://cdn-global.configcat.com", r: 0, s: "salt" },
  f: {
    platformModelKey: {
      t: 0,
      v: { b: false },
      r: [
        {
          c: [{ u: { a: "Identifier", c: 0, l: ["ws-on"] } }],
          s: { v: { b: true } },
        },
      ],
    },
  },
})

vi.mock("@configcat/sdk", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@configcat/sdk")>()
  return {
    ...sdk,
    getClient: (...[key, mode, options]: Parameters<typeof sdk.getClient>) =>
      sdk.getClient(key, mode, {
        ...options,
        configFetcher: {
          fetchAsync: async () =>
            new FetchResponse(200, "OK", [["ETag", "fixed"]], CONFIG_JSON),
        },
      }),
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
  disposeAllClients()
})

describe("flags with a ConfigCat SDK key", () => {
  it("evaluates each workspace against ConfigCat's targeting rules", async () => {
    vi.stubEnv("CONFIGCAT_SDK_KEY", SDK_KEY)
    vi.stubEnv("FEATURE_FLAGS", "")
    const { evaluateFlags, isFlagEnabled } = await import("./evaluate-flags.js")

    expect(await isFlagEnabled("platformModelKey", "ws-on")).toBe(true)
    expect(await isFlagEnabled("platformModelKey", "ws-off")).toBe(false)
    expect(await evaluateFlags("ws-on")).toEqual({ platformModelKey: true })
    expect(await evaluateFlags("ws-off")).toEqual({ platformModelKey: false })
  })
})
