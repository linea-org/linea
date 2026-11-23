import { describe, expect, it, vi } from "vitest"

import { getRunEnvironment } from "./default-application"
import { listEnvironmentsFn } from "./environments-api"

vi.mock("./applications-api", () => ({}))
vi.mock("./environments-api", () => ({
  listEnvironmentsFn: vi.fn(() =>
    Promise.resolve([
      { id: "production-id", environment: "production" },
      { id: "dev-id", environment: "dev" },
    ])
  ),
}))

describe("getRunEnvironment", () => {
  it.each([
    ["draft", "dev-id"],
    ["dev", "dev-id"],
    ["production", "production-id"],
  ] as const)("finds where a %s run reads its secrets", async (ranIn, id) => {
    expect((await getRunEnvironment("app-1", ranIn)).id).toBe(id)
    expect(listEnvironmentsFn).toHaveBeenCalledWith({
      data: { applicationId: "app-1" },
    })
  })

  it("fails rather than saving a production key elsewhere", async () => {
    vi.mocked(listEnvironmentsFn).mockResolvedValueOnce([])
    await expect(getRunEnvironment("app-1", "production")).rejects.toThrow(
      "No production Environment found"
    )
  })
})
