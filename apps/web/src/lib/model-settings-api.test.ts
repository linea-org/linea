import { describe, expect, it } from "vitest"

import { isModelReady, type ModelSetup } from "./model-settings-api"

const models = [
  {
    value: "gpt-5",
    label: "GPT-5",
    providerId: "openai",
    providerLabel: "OpenAI",
    keyName: "OPENAI_API_KEY",
  },
]

function setup(defaultModel: string | null, configured: boolean): ModelSetup {
  return {
    settings: { defaultModel, models },
    providers: [
      {
        id: "openai",
        label: "OpenAI",
        keyName: "OPENAI_API_KEY",
        configured,
        platformFallback: false,
      },
    ],
  }
}

describe("isModelReady", () => {
  it("is not ready until a model is chosen", () => {
    expect(isModelReady(setup(null, true))).toBe(false)
  })

  it("is not ready when the chosen model has no key", () => {
    expect(isModelReady(setup("gpt-5", false))).toBe(false)
  })

  it("is ready with a chosen model and its key", () => {
    expect(isModelReady(setup("gpt-5", true))).toBe(true)
  })

  it("is not ready when the chosen model is gone from the catalog", () => {
    expect(isModelReady(setup("retired", true))).toBe(false)
  })
})
