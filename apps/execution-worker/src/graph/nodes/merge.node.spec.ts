import { MergeNode } from "./merge.node"

describe("MergeNode", () => {
  it("concatenates two arrays", async () => {
    const node = new MergeNode()

    const output = await node.execute({ mode: "concat" }, [
      [1, 2],
      [3, 4],
    ])

    expect(output).toEqual({ result: [1, 2, 3, 4] })
  })

  it("throws when concat is given a non-array input", () => {
    const node = new MergeNode()

    expect(() => node.execute({ mode: "concat" }, [{ a: 1 }, [1, 2]])).toThrow(
      "requires every input to be an array"
    )
  })

  it("deep-merges two objects, preferring the first input by default on a conflict", async () => {
    const node = new MergeNode()

    const output = await node.execute({ mode: "deepMerge" }, [
      { a: 1, nested: { x: 1, y: 1 } },
      { b: 2, nested: { y: 2, z: 2 } },
    ])

    expect(output).toEqual({
      result: { a: 1, b: 2, nested: { x: 1, y: 1, z: 2 } },
    })
  })

  it("deep-merges preferring the second input when configured", async () => {
    const node = new MergeNode()

    const output = await node.execute(
      { mode: "deepMerge", conflictStrategy: "preferSecond" },
      [
        { a: 1, nested: { y: 1 } },
        { b: 2, nested: { y: 2 } },
      ]
    )

    expect(output).toEqual({ result: { a: 1, b: 2, nested: { y: 2 } } })
  })

  it("throws when deepMerge is given a non-object input", () => {
    const node = new MergeNode()

    expect(() =>
      node.execute({ mode: "deepMerge" }, [{ a: 1 }, [1, 2]])
    ).toThrow("requires every input to be an object")
  })

  it("zips two arrays by position, preferring the first input's keys by default", async () => {
    const node = new MergeNode()

    const output = await node.execute({ mode: "zip" }, [
      [{ a: 1 }, { a: 2 }],
      [
        { a: 10, b: 1 },
        { a: 20, b: 2 },
      ],
    ])

    expect(output).toEqual({
      result: [
        { a: 1, b: 1 },
        { a: 2, b: 2 },
      ],
    })
  })

  it("zips preferring the second input's keys when configured", async () => {
    const node = new MergeNode()

    const output = await node.execute(
      { mode: "zip", conflictStrategy: "preferSecond" },
      [[{ a: 1 }], [{ a: 10, b: 1 }]]
    )

    expect(output).toEqual({ result: [{ a: 10, b: 1 }] })
  })

  it("truncates to the shorter input on uneven lengths, matching n8n's documented Combine-by-Position behavior", async () => {
    const node = new MergeNode()

    const output = await node.execute({ mode: "zip" }, [
      [{ a: 1 }, { a: 2 }, { a: 3 }],
      [{ b: 1 }],
    ])

    expect(output).toEqual({ result: [{ a: 1, b: 1 }] })
  })

  it("concatenates every input in order", async () => {
    const output = await new MergeNode().execute({ mode: "concat" }, [
      [1],
      [[2]],
      [3],
    ])

    expect(output).toEqual({ result: [1, [2], 3] })
  })

  it.each([
    ["preferFirst", { a: 1, b: 2, c: 3 }],
    ["preferSecond", { a: 3, b: 3, c: 3 }],
  ])("deep-merges every input with %s", async (conflictStrategy, result) => {
    const output = await new MergeNode().execute(
      { mode: "deepMerge", conflictStrategy },
      [{ a: 1 }, { a: 2, b: 2 }, { a: 3, b: 3, c: 3 }]
    )

    expect(output).toEqual({ result })
  })

  it.each([
    ["preferFirst", [{ a: 1, b: 2, c: 3 }]],
    ["preferSecond", [{ a: 3, b: 3, c: 3 }]],
  ])("zips every input with %s", async (conflictStrategy, result) => {
    const output = await new MergeNode().execute(
      { mode: "zip", conflictStrategy },
      [[{ a: 1 }], [{ a: 2, b: 2 }, { a: 9 }], [{ a: 3, b: 3, c: 3 }]]
    )

    expect(output).toEqual({ result })
  })

  it.each([1, 6])("refuses %i inputs", (count) => {
    expect(() =>
      new MergeNode().execute({ mode: "concat" }, Array(count).fill([]))
    ).toThrow()
  })
})
