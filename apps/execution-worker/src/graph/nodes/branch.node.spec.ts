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
