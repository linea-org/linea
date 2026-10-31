import { describe, expect, it } from "vitest"
import { isNodeTypeId, stepTitle } from "./execution-step-presentation"

describe("Recorded step names", () => {
  it("keeps external span names that match Object prototype keys inspectable", () => {
    expect(isNodeTypeId("constructor")).toBe(false)
    expect(stepTitle("toString")).toBe("toString")
    expect(stepTitle("http")).toBe("HTTP request")
  })
})
