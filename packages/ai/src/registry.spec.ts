import { describe, expect, it } from "vitest"
import { registry, resolveProvider } from "./registry.js"

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
