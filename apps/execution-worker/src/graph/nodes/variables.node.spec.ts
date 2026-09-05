import { VariablesNode } from "./variables.node"

describe("VariablesNode", () => {
  it("set merges into existing variables without clobbering untouched keys", async () => {
    const node = new VariablesNode()

    const output = await node.execute(
      { operation: "set", entries: { b: 2 } },
      undefined,
      { workspaceId: "ws-1", variables: { a: 1 } }
    )

    expect(output).toEqual({ variables: { a: 1, b: 2 } })
  })

  it("set overwrites a key that's already present", async () => {
    const node = new VariablesNode()

    const output = await node.execute(
      { operation: "set", entries: { a: 99 } },
      undefined,
      { workspaceId: "ws-1", variables: { a: 1 } }
    )

    expect(output).toEqual({ variables: { a: 99 } })
  })

  it("set with no prior state starts from an empty object", async () => {
    const node = new VariablesNode()

    const output = await node.execute(
      { operation: "set", entries: { a: 1 } },
      undefined,
      { workspaceId: "ws-1" }
    )

    expect(output).toEqual({ variables: { a: 1 } })
  })

  it("get returns found + value for an existing key", async () => {
    const node = new VariablesNode()

    const output = await node.execute(
      { operation: "get", key: "a" },
      undefined,
      {
        workspaceId: "ws-1",
        variables: { a: 1 },
      }
    )

    expect(output).toEqual({ found: true, value: 1 })
  })

  it("get returns found: false and value: null for a missing key", async () => {
    const node = new VariablesNode()

    const output = await node.execute(
      { operation: "get", key: "missing" },
      undefined,
      { workspaceId: "ws-1", variables: { a: 1 } }
    )

    expect(output).toEqual({ found: false, value: null })
  })

  it("get with an empty key returns the whole variables object", async () => {
    const node = new VariablesNode()

    const output = await node.execute(
      { operation: "get", key: "" },
      undefined,
      {
        workspaceId: "ws-1",
        variables: { a: 1, b: 2 },
      }
    )

    expect(output).toEqual({ found: true, value: { a: 1, b: 2 } })
  })
})
