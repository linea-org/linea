import { disposeAllClients, FetchResponse } from "@configcat/sdk"
import { afterEach, describe, expect, it, vi } from "vitest"

const SDK_KEY = `configcat-sdk-1/${"a".repeat(22)}/${"b".repeat(22)}`
const off = { t: 0, v: { b: false } }

// The config ConfigCat would serve: platformModelKey is off, except for workspace "ws-on".
const CONFIG = {
  p: { u: "https://cdn-global.configcat.com", r: 0, s: "salt" },
  f: {
    platformModelKey: {
      ...off,
      r: [
        {
          c: [{ u: { a: "Identifier", c: 0, l: ["ws-on"] } }],
          s: { v: { b: true } },
        },
      ],
    },
    assistantMentions: off,
    parallelBranches: off,
    pauseConnectorWrites: off,
    pauseMcpTools: off,
    pauseInkyWeb: off,
    pauseWebhooks: off,
  },
}

const served = vi.hoisted((): { config: unknown } => ({ config: undefined }))

vi.mock("@configcat/sdk", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@configcat/sdk")>()
  return {
    ...sdk,
    getClient: (...[key, mode, options]: Parameters<typeof sdk.getClient>) =>
      sdk.getClient(key, mode, {
        ...options,
        logger: sdk.createConsoleLogger(sdk.LogLevel.Off),
        maxInitWaitTimeSeconds: 0.1,
        configFetcher: {
          fetchAsync: async () =>
            served.config === undefined
              ? new FetchResponse(503, "Unavailable", [])
              : new FetchResponse(
                  200,
                  "OK",
                  [["ETag", "fixed"]],
                  JSON.stringify(served.config)
                ),
        },
      }),
  }
})

async function loadWith(config: unknown, nodeEnv = "test") {
  served.config = config
  vi.stubEnv("CONFIGCAT_SDK_KEY", SDK_KEY)
  vi.stubEnv("NODE_ENV", nodeEnv)
  vi.resetModules()
  return import("./evaluate-flags.js")
}

afterEach(() => {
  vi.unstubAllEnvs()
  // The SDK keeps one client per SDK key for the whole process, across module reloads.
  disposeAllClients()
})

describe("flags with a ConfigCat SDK key", () => {
  it("evaluates each workspace against ConfigCat's targeting rules", async () => {
    const { evaluateFlags, isFlagEnabled } = await loadWith(CONFIG)

    expect(await isFlagEnabled("platformModelKey", "ws-on")).toBe(true)
    expect(await isFlagEnabled("platformModelKey", "ws-off")).toBe(false)
    expect(await evaluateFlags("ws-on")).toEqual({
      platformModelKey: true,
      assistantMentions: false,
      parallelBranches: false,
      pauseConnectorWrites: false,
      pauseMcpTools: false,
      pauseInkyWeb: false,
      pauseWebhooks: false,
    })
  })

  it("is off while ConfigCat has never been reached", async () => {
    const { isFlagEnabled } = await loadWith(undefined)
    expect(await isFlagEnabled("platformModelKey", "ws-on")).toBe(false)
  })
})

describe("assertFlagsExist", () => {
  const others = Object.fromEntries(
    Object.entries(CONFIG.f).filter(([key]) => key !== "assistantMentions")
  )
  const without = { ...CONFIG, f: others }

  it("passes when every flag is there", async () => {
    const { assertFlagsExist } = await loadWith(CONFIG, "production")
    await expect(assertFlagsExist()).resolves.toBeUndefined()
  })

  it("names a flag that is missing or is not on/off", async () => {
    const text = { t: 1, v: { s: "yes" } }
    const { assertFlagsExist } = await loadWith(
      { ...without, f: { ...others, parallelBranches: text } },
      "production"
    )
    await expect(assertFlagsExist()).rejects.toThrow(
      "ConfigCat has no on/off flag named: assistantMentions, parallelBranches"
    )
  })

  it("lets a process start while ConfigCat is down", async () => {
    const { assertFlagsExist } = await loadWith(undefined, "production")
    await expect(assertFlagsExist()).resolves.toBeUndefined()
  })

  it("only checks production", async () => {
    const { assertFlagsExist } = await loadWith(without)
    await expect(assertFlagsExist()).resolves.toBeUndefined()
  })
})
