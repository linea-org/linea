import { describe, expect, it } from "vitest"
import { registry, resolveKeyName, resolveProvider } from "./registry.js"

describe("resolveProvider", () => {
  it("resolves every registered model to a provider", () => {
    for (const model of Object.keys(registry)) {
      expect(resolveProvider(model)).toBe(registry[model])
    }
  })

  it("throws on an unregistered model", () => {
    expect(() => resolveProvider("definitely-not-a-real-model")).toThrow(
      /Unknown model/
    )
  })
})

describe("resolveKeyName", () => {
  it("has a key name for every registered model", () => {
    for (const model of Object.keys(registry)) {
      expect(() => resolveKeyName(model)).not.toThrow()
    }
  })

  it("throws on an unregistered model", () => {
    expect(() => resolveKeyName("definitely-not-a-real-model")).toThrow(
      /No key name registered/
    )
  })
})
