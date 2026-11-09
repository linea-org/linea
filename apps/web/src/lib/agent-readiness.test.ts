import { describe, expect, it } from "vitest"
import type { AgentBinding, AgentVersion } from "./agent-schemas"
import { agentReadiness } from "./agent-readiness"

const binding = { enabled: true } as AgentBinding
const version = {
  definition: { tools: [{ name: "x", operation: "github.issues.create" }] },
} as AgentVersion
const operations = [{ id: "github.issues.create", provider: "github" }]

describe("agentReadiness", () => {
  it("flags a missing deployment and stops there without a version", () => {
    const items = agentReadiness({
      environmentEnabled: true,
      binding: undefined,
      version: undefined,
      operations,
      connections: [],
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.ready).toBe(false)
  })

  it("requires an active Connection for each tool provider", () => {
    const base = {
      environmentEnabled: true,
      binding,
      version,
      operations,
    }
    const missing = agentReadiness({
      ...base,
      connections: [{ provider: "github", status: "revoked" }],
    })
    expect(
      missing.find((item) => item.key === "connection:github")?.ready
    ).toBe(false)
    const ok = agentReadiness({
      ...base,
      connections: [{ provider: "github", status: "active" }],
    })
    expect(ok.every((item) => item.ready)).toBe(true)
  })

  it("reports tools whose operation is not registered", () => {
    const items = agentReadiness({
      environmentEnabled: true,
      binding,
      version,
      operations: [],
      connections: [],
    })
    expect(items.some((item) => item.key.startsWith("operation:"))).toBe(true)
  })
})
