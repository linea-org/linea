import { describe, expect, it } from "vitest"

import { branchTo, latestLeafFrom, siblingsOf } from "./message-branches"

const messages = [
  { id: "a", parentId: null },
  { id: "b", parentId: "a" },
  { id: "c", parentId: "b" },
  { id: "b2", parentId: "a" },
  { id: "c2", parentId: "b2" },
]

describe("message branches", () => {
  it("lists the messages on one branch in order", () => {
    expect(branchTo(messages, "c").map((m) => m.id)).toEqual(["a", "b", "c"])
    expect(branchTo(messages, null)).toEqual([])
  })

  it("fails loudly for a leaf that is not in the chat", () => {
    expect(() => branchTo(messages, "zzz")).toThrow("zzz")
  })

  it("finds the alternatives to an edited message", () => {
    expect(siblingsOf(messages, messages[1]).map((m) => m.id)).toEqual([
      "b",
      "b2",
    ])
  })

  it("follows the newest reply to the end of a branch", () => {
    expect(latestLeafFrom(messages, "a")).toBe("c2")
    expect(latestLeafFrom(messages, "b")).toBe("c")
  })
})
