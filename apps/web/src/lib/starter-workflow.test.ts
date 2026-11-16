import { describe, expect, it } from "vitest"

import { uniqueSlug } from "./starter-workflow"

describe("uniqueSlug", () => {
  it("keeps the base slug when it is free", () => {
    expect(uniqueSlug("starter-workflow", ["other"])).toBe("starter-workflow")
  })

  it("skips taken suffixes", () => {
    expect(
      uniqueSlug("starter-workflow", ["starter-workflow", "starter-workflow-2"])
    ).toBe("starter-workflow-3")
  })
})
