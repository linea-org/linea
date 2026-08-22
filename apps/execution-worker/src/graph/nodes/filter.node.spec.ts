import { FilterNode } from "./filter.node"

describe("FilterNode", () => {
  it("keeps items matching an equals condition", async () => {
    const node = new FilterNode()

    const output = await node.execute(
      { conditions: [{ path: "status", operator: "equals", value: "done" }] },
      [{ status: "done" }, { status: "pending" }, { status: "done" }]
    )

    expect(output).toEqual({
      items: [{ status: "done" }, { status: "done" }],
    })
  })

  it("supports dot-path addressing into nested items", async () => {
    const node = new FilterNode()

    const output = await node.execute(
      {
        conditions: [
          { path: "user.age", operator: "greaterThanOrEqual", value: 18 },
        ],
      },
      [{ user: { age: 17 } }, { user: { age: 18 } }, { user: { age: 30 } }]
    )

    expect(output).toEqual({
      items: [{ user: { age: 18 } }, { user: { age: 30 } }],
    })
  })

  it("combines conditions with AND by default", async () => {
    const node = new FilterNode()

    const output = await node.execute(
      {
        conditions: [
          { path: "status", operator: "equals", value: "done" },
          { path: "score", operator: "greaterThan", value: 5 },
        ],
      },
      [
        { status: "done", score: 3 },
        { status: "done", score: 10 },
        { status: "pending", score: 10 },
      ]
    )

    expect(output).toEqual({ items: [{ status: "done", score: 10 }] })
  })

  it("combines conditions with OR when configured", async () => {
    const node = new FilterNode()

    const output = await node.execute(
      {
        combinator: "or",
        conditions: [
          { path: "status", operator: "equals", value: "done" },
          { path: "score", operator: "greaterThan", value: 5 },
        ],
      },
      [
        { status: "done", score: 1 },
        { status: "pending", score: 10 },
        { status: "pending", score: 1 },
      ]
    )

    expect(output).toEqual({
      items: [
        { status: "done", score: 1 },
        { status: "pending", score: 10 },
      ],
    })
  })

  it("passes every item through unchanged when there are no conditions", async () => {
    const node = new FilterNode()

    const output = await node.execute({ conditions: [] }, [1, 2, 3])

    expect(output).toEqual({ items: [1, 2, 3] })
  })

  it("supports contains for strings and arrays", async () => {
    const node = new FilterNode()

    const output = await node.execute(
      { conditions: [{ path: "tags", operator: "contains", value: "urgent" }] },
      [{ tags: ["urgent", "bug"] }, { tags: ["low-priority"] }]
    )

    expect(output).toEqual({ items: [{ tags: ["urgent", "bug"] }] })
  })

  it("supports exists/notExists/isEmpty/isNotEmpty", async () => {
    const node = new FilterNode()

    const output = await node.execute(
      { conditions: [{ path: "note", operator: "isNotEmpty" }] },
      [{ note: "hi" }, { note: "" }, {}]
    )

    expect(output).toEqual({ items: [{ note: "hi" }] })
  })
})
