import { describe, expect, it } from "vitest"
import type { AgentBinding, AgentVersion } from "./agent-schemas"
import { agentReadiness } from "./agent-readiness"

const id = "00000000-0000-4000-8000-000000000001"
const binding: AgentBinding = {
  id,
  environmentId: id,
  agentId: id,
  agentVersionId: id,
  agentContractRevisionId: id,
  enabled: true,
}
const version: AgentVersion = {
  id,
  agentId: id,
  version: 1,
  definition: {
    version: 1,
    instructions: "Create issues",
    model: "gpt-5",
    tools: [{ name: "x", operation: "github.issues.create" }],
    maxIterations: 4,
  },
  agentContractRevisionId: id,
  publishedAt: null,
}
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

  it("explains a disabled Environment without pointing at read-only settings", () => {
    const [deployment] = agentReadiness({
      environmentEnabled: false,
      binding,
      version,
      operations,
      connections: [],
    })
    expect(deployment?.action).toMatch(/Environment is disabled/)
  })

  it("reports a shared missing operation once", () => {
    const shared: AgentVersion = {
      ...version,
      definition: {
        ...version.definition,
        tools: [
          { name: "a", operation: "gone.op" },
          { name: "b", operation: "gone.op" },
        ],
      },
    }
    const items = agentReadiness({
      environmentEnabled: true,
      binding,
      version: shared,
      operations: [],
      connections: [],
    })
    expect(
      items.filter((item) => item.key === "operation:gone.op")
    ).toHaveLength(1)
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
