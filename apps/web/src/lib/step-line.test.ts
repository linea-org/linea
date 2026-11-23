import { describe, expect, it } from "vitest"

import { chatMessageRef, stepLine } from "./step-line"

const chat = { chatMessageId: "m1", conversationId: "c1" }

describe("stepLine", () => {
  it("shows the message a chat run was sent, not its id", () => {
    expect(stepLine(chat, "Say hello")).toBe("Say hello")
    expect(stepLine(chat, undefined)).toBe("a chat message")
    expect(stepLine({ ...chat, externalSubjectId: "u1" }, "Hi")).toBe("Hi")
  })

  it("keeps a payload that only includes a message id", () => {
    expect(stepLine({ ...chat, order: 7 }, "Say hello")).toBe(
      '{"chatMessageId":"m1","conversationId":"c1","order":7}'
    )
    expect(chatMessageRef({ chatMessageId: "m1" })).toBeNull()
  })

  it("reads an AI step's result as its text", () => {
    expect(
      stepLine({ text: "Hello.", tokensInput: 1, tokensOutput: 2 }, undefined)
    ).toBe("Hello.")
  })

  it("fits structured and long values on one line", () => {
    expect(stepLine({ repo: "a/b", count: 2 }, undefined)).toBe(
      '{"repo":"a/b","count":2}'
    )
    expect(stepLine("one\n\n  two", undefined)).toBe("one two")
    expect(stepLine("x".repeat(500), undefined)).toHaveLength(201)
  })

  it.each([null, "", "  ", {}, []])("shows nothing for %j", (value) => {
    expect(stepLine(value, undefined)).toBeNull()
  })

  it("keeps falsy results", () => {
    expect(stepLine(0, undefined)).toBe("0")
    expect(stepLine(false, undefined)).toBe("false")
  })
})
