import { describe, expect, it } from "vitest"

import { checkDrafts, type ServerDraft } from "./mcp-server-drafts"

function draft(overrides: Partial<ServerDraft> = {}): ServerDraft {
  return {
    name: "docs",
    url: "https://mcp.example.com/mcp",
    tools: "",
    headers: [],
    ...overrides,
  }
}

describe("checkDrafts", () => {
  it("saves nothing while two servers share a name", () => {
    const { errors, servers } = checkDrafts([draft(), draft()])

    expect(errors).toEqual([undefined, "Another server has this name"])
    expect(servers).toBeUndefined()
  })

  it("leaves tools out when the field is blank, so every tool is offered", () => {
    const { servers } = checkDrafts([draft({ tools: " , " })])

    expect(servers).toEqual([
      { name: "docs", url: "https://mcp.example.com/mcp", headers: {} },
    ])
  })

  it("keeps listed tools and complete header rows", () => {
    const { servers } = checkDrafts([
      draft({
        tools: "a, b",
        headers: [
          { header: "Authorization", secret: "DOCS_TOKEN" },
          { header: "X-Empty", secret: "" },
        ],
      }),
    ])

    expect(servers?.[0]).toMatchObject({
      tools: ["a", "b"],
      headers: { Authorization: "DOCS_TOKEN" },
    })
  })
})
