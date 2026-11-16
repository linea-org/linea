import { describe, expect, it } from "vitest"

import {
  PERSONAL_WORKSPACE_METADATA,
  isPersonalWorkspace,
} from "./personal-workspace"

describe("isPersonalWorkspace", () => {
  it("recognises the flag as an object or as the stored JSON string", () => {
    expect(isPersonalWorkspace(PERSONAL_WORKSPACE_METADATA)).toBe(true)
    expect(isPersonalWorkspace(JSON.stringify({ personal: true }))).toBe(true)
  })

  it("treats a missing or false flag as a team workspace", () => {
    expect(isPersonalWorkspace(null)).toBe(false)
    expect(isPersonalWorkspace(undefined)).toBe(false)
    expect(isPersonalWorkspace({ personal: false })).toBe(false)
    expect(isPersonalWorkspace(JSON.stringify({ other: 1 }))).toBe(false)
  })

  it("fails loudly on metadata that is not valid JSON", () => {
    expect(() => isPersonalWorkspace("not json")).toThrow()
  })
})
