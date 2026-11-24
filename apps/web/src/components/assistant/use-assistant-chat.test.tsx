// @vitest-environment jsdom
import { act } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AssistantAnswer } from "@/lib/assistant-api"
import { useAssistantChat } from "./use-assistant-chat"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

type Chat = ReturnType<typeof useAssistantChat>
type Settle = {
  message: string
  parent: string | null
  answer: () => void
  fail: () => void
}

let root: Root
let chat: Chat
let asked: Settle[]

const answerTo = (index: number): AssistantAnswer => ({
  conversationId: "c1",
  userMessageId: `u${index}`,
  messageId: `a${index}`,
  reply: `reply ${index}`,
  graph: null,
  title: null,
  actions: [],
  model: "m",
})

function Harness() {
  chat = useAssistantChat(
    ({ message, parentMessageId }) =>
      new Promise((resolve, reject) => {
        const index = asked.length
        asked.push({
          message,
          parent: parentMessageId,
          answer: () => resolve(answerTo(index)),
          fail: () => reject(new Error("no")),
        })
      })
  )
  return null
}

async function settle(run: () => void) {
  await act(async () => {
    run()
    await vi.waitFor(() => undefined)
  })
}

beforeEach(() => {
  asked = []
  root = createRoot(document.createElement("div"))
  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness />
      </QueryClientProvider>
    )
  )
})

afterEach(() => act(() => root.unmount()))

const messages = () => asked.map(({ message }) => message)

describe("messages written while Inky answers", () => {
  it("are sent in order, each under the reply before it", async () => {
    await settle(() => chat.send("one", []))
    await settle(() => chat.send("two", []))
    await settle(() => chat.send("three", []))
    expect(messages()).toEqual(["one"])
    expect(chat.queue.map(({ text }) => text)).toEqual(["two", "three"])

    await settle(asked[0].answer)
    expect(asked[1]).toMatchObject({ message: "two", parent: "a0" })
    await settle(asked[1].answer)
    expect(asked[2]).toMatchObject({ message: "three", parent: "a1" })
    expect(chat.queue).toEqual([])
  })

  it("wait when the answer fails", async () => {
    await settle(() => chat.send("one", []))
    await settle(() => chat.send("two", []))
    await settle(asked[0].fail)
    expect(messages()).toEqual(["one"])
    expect(chat.queue).toHaveLength(1)

    await settle(() => chat.resend())
    expect(messages()).toEqual(["one", "one"])
    await settle(asked[1].answer)
    expect(asked[2]).toMatchObject({ message: "two", parent: "a1" })
    expect(chat.messages.map(({ content }) => content)).toEqual([
      "one",
      "reply 1",
      "two",
    ])
  })

  it("can be taken back, and go away with the chat", async () => {
    await settle(() => chat.send("one", []))
    await settle(() => chat.send("two", []))
    await settle(() => chat.unqueue(chat.queue[0].id))
    expect(chat.queue).toEqual([])
    await settle(() => chat.send("three", []))
    await settle(() => chat.startNew())
    await settle(asked[0].answer)
    expect(messages()).toEqual(["one"])
    expect(chat.messages).toEqual([])
  })
})
