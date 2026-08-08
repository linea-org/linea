import { BranchNode } from "./branch.node"

describe("BranchNode", () => {
  it("matches a case whose expected value is structurally equal but a distinct object", async () => {
    const node = new BranchNode()

    const output = await node.execute(
      { cases: { pending: { output: false }, done: { output: true } } },
      { output: false }
    )

    expect(output).toEqual({ branch: "pending" })
  })

  it("matches regardless of object key insertion order", async () => {
    const node = new BranchNode()

    const output = await node.execute(
      { cases: { multi: { a: 1, b: 2 } } },
      { b: 2, a: 1 }
    )

    expect(output).toEqual({ branch: "multi" })
  })

  it("does not match objects with the same keys but different values, or a different key count", () => {
    const node = new BranchNode()

    expect(() =>
      node.execute({ cases: { a: { x: 1, y: 2 } } }, { x: 1, y: 2, z: 3 })
    ).toThrow()
  })

  it("falls back to defaultBranch when no case matches", async () => {
    const node = new BranchNode()

    const output = await node.execute(
      { cases: { done: { output: true } }, defaultBranch: "pending" },
      { output: false }
    )

    expect(output).toEqual({ branch: "pending" })
  })

  it("throws when nothing matches and there is no defaultBranch", () => {
    const node = new BranchNode()

    expect(() =>
      node.execute({ cases: { done: { output: true } } }, { output: false })
    ).toThrow('no matching case for value {"output":false}')
  })
})
