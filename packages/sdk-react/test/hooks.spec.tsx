import { renderHook, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"
import {
  LineaUserProvider,
  useApprovalRequests,
  useConversation,
  useDecision,
  useExecution,
} from "../src/index.js"
import { authenticatedClient } from "./authenticated-client.js"
import {
  approvalRequest,
  approvalRequestId,
  conversation,
  conversationId,
  execution,
  executionId,
  message,
} from "./fixtures.js"
import { apiBaseUrl, server } from "./server.js"

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let complete: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    complete = resolve
  })
  return {
    promise,
    resolve(value) {
      if (!complete) throw new Error("Deferred operation is unavailable")
      complete(value)
    },
  }
}

describe("headless React hooks", () => {
  it("loads a conversation and sends a message through the public client", async () => {
    server.use(
      http.get(`${apiBaseUrl}/v1/user/conversations/${conversationId}`, () =>
        HttpResponse.json(conversation)
      ),
      http.get(
        `${apiBaseUrl}/v1/user/conversations/${conversationId}/messages`,
        () => HttpResponse.json({ data: [message], nextCursor: null })
      ),
      http.post(
        `${apiBaseUrl}/v1/user/conversations/${conversationId}/messages`,
        () =>
          HttpResponse.json(
            {
              ...message,
              id: "70000000-0000-4000-8000-000000000007",
              role: "user",
              content: "Ship it",
              sequence: 2,
            },
            { status: 201 }
          )
      )
    )
    const client = await authenticatedClient()
    function wrapper({ children }: { children: ReactNode }): ReactNode {
      return <LineaUserProvider client={client}>{children}</LineaUserProvider>
    }
    const { result } = renderHook(() => useConversation(conversationId), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeUndefined()
    expect(result.current.conversation).toEqual(conversation)
    expect(result.current.messages).toEqual([message])
    await result.current.sendMessage({ content: "Ship it" })
    await waitFor(() =>
      expect(result.current.messages.at(-1)?.content).toBe("Ship it")
    )
  })

  it("loads executions and submits decisions", async () => {
    server.use(
      http.get(`${apiBaseUrl}/v1/user/executions/${executionId}`, () =>
        HttpResponse.json(execution)
      ),
      http.post(
        `${apiBaseUrl}/v1/user/approval-requests/${approvalRequestId}/decisions`,
        () =>
          HttpResponse.json(
            {
              id: "60000000-0000-4000-8000-000000000006",
              outcome: "approved",
              reason: "human",
              comment: "Reviewed",
              decidedAt: "2026-09-18T12:02:00.000Z",
            },
            { status: 201 }
          )
      )
    )
    const client = await authenticatedClient()
    function wrapper({ children }: { children: ReactNode }): ReactNode {
      return <LineaUserProvider client={client}>{children}</LineaUserProvider>
    }
    const executionHook = renderHook(() => useExecution(executionId), {
      wrapper,
    })
    const decisionHook = renderHook(() => useDecision(), { wrapper })
    await waitFor(() =>
      expect(executionHook.result.current.isLoading).toBe(false)
    )
    expect(executionHook.result.current.error).toBeUndefined()
    expect(executionHook.result.current.execution).toEqual(execution)
    await expect(
      decisionHook.result.current.decide(approvalRequestId, {
        decision: "approved",
        comment: "Reviewed",
      })
    ).resolves.toMatchObject({ outcome: "approved" })
    expect(decisionHook.result.current.error).toBeUndefined()
  })

  it("keeps pending decision state until every overlapping request settles", async () => {
    const secondApprovalRequestId = "a0000000-0000-4000-8000-00000000000a"
    const firstResponse = deferred<Response>()
    const secondResponse = deferred<Response>()
    server.use(
      http.post(
        `${apiBaseUrl}/v1/user/approval-requests/${approvalRequestId}/decisions`,
        () => firstResponse.promise
      ),
      http.post(
        `${apiBaseUrl}/v1/user/approval-requests/${secondApprovalRequestId}/decisions`,
        () => secondResponse.promise
      )
    )
    const client = await authenticatedClient()
    function wrapper({ children }: { children: ReactNode }): ReactNode {
      return <LineaUserProvider client={client}>{children}</LineaUserProvider>
    }
    const { result } = renderHook(() => useDecision(), { wrapper })
    const first = result.current.decide(approvalRequestId, {
      decision: "approved",
    })
    const second = result.current.decide(secondApprovalRequestId, {
      decision: "rejected",
    })
    await waitFor(() =>
      expect(result.current.pendingApprovalRequestIds).toEqual([
        approvalRequestId,
        secondApprovalRequestId,
      ])
    )
    firstResponse.resolve(
      HttpResponse.json(
        {
          id: "60000000-0000-4000-8000-000000000006",
          outcome: "approved",
          reason: "human",
          comment: null,
          decidedAt: "2026-09-18T12:02:00.000Z",
        },
        { status: 201 }
      )
    )
    await first
    await waitFor(() =>
      expect(result.current.pendingApprovalRequestIds).toEqual([
        secondApprovalRequestId,
      ])
    )
    secondResponse.resolve(
      HttpResponse.json(
        {
          id: "b0000000-0000-4000-8000-00000000000b",
          outcome: "rejected",
          reason: "human",
          comment: null,
          decidedAt: "2026-09-18T12:03:00.000Z",
        },
        { status: 201 }
      )
    )
    await second
    await waitFor(() =>
      expect(result.current.pendingApprovalRequestIds).toEqual([])
    )
  })

  it("does not append a completed send to a new conversation", async () => {
    const nextConversationId = "c0000000-0000-4000-8000-00000000000c"
    const sendResponse = deferred<Response>()
    server.use(
      http.get(`${apiBaseUrl}/v1/user/conversations/${conversationId}`, () =>
        HttpResponse.json(conversation)
      ),
      http.get(
        `${apiBaseUrl}/v1/user/conversations/${conversationId}/messages`,
        () => HttpResponse.json({ data: [message], nextCursor: null })
      ),
      http.post(
        `${apiBaseUrl}/v1/user/conversations/${conversationId}/messages`,
        () => sendResponse.promise
      ),
      http.get(
        `${apiBaseUrl}/v1/user/conversations/${nextConversationId}`,
        () =>
          HttpResponse.json({
            ...conversation,
            id: nextConversationId,
            title: "Next review",
          })
      ),
      http.get(
        `${apiBaseUrl}/v1/user/conversations/${nextConversationId}/messages`,
        () => HttpResponse.json({ data: [], nextCursor: null })
      )
    )
    const client = await authenticatedClient()
    function wrapper({ children }: { children: ReactNode }): ReactNode {
      return <LineaUserProvider client={client}>{children}</LineaUserProvider>
    }
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useConversation(id),
      { initialProps: { id: conversationId }, wrapper }
    )
    await waitFor(() =>
      expect(result.current.conversation).toEqual(conversation)
    )
    const sending = result.current.sendMessage({ content: "Old conversation" })
    rerender({ id: nextConversationId })
    await waitFor(() =>
      expect(result.current.conversation?.title).toBe("Next review")
    )
    sendResponse.resolve(
      HttpResponse.json(
        {
          ...message,
          id: "d0000000-0000-4000-8000-00000000000d",
          role: "user",
          content: "Old conversation",
          sequence: 2,
        },
        { status: 201 }
      )
    )
    await sending
    expect(result.current.messages).toEqual([])
    expect(result.current.isSending).toBe(false)
  })

  it("ignores approval reconciliation from a previous conversation", async () => {
    const nextConversationId = "c0000000-0000-4000-8000-00000000000c"
    const stalePage = deferred<Response>()
    let staleRequests = 0
    server.use(
      http.get(`${apiBaseUrl}/v1/user/approval-requests`, ({ request }) => {
        const selectedConversation = new URL(request.url).searchParams.get(
          "conversationId"
        )
        if (selectedConversation === conversationId) {
          staleRequests += 1
          return stalePage.promise
        }
        return HttpResponse.json({ data: [], nextCursor: null })
      }),
      http.get(
        `${apiBaseUrl}/v1/user/events`,
        () =>
          new HttpResponse("", {
            headers: { "content-type": "text/event-stream" },
          })
      )
    )
    const client = await authenticatedClient()
    function wrapper({ children }: { children: ReactNode }): ReactNode {
      return <LineaUserProvider client={client}>{children}</LineaUserProvider>
    }
    const { result, rerender, unmount } = renderHook(
      ({ id }: { id: string }) => useApprovalRequests({ conversationId: id }),
      { initialProps: { id: conversationId }, wrapper }
    )
    await waitFor(() => expect(staleRequests).toBe(1))
    rerender({ id: nextConversationId })
    await waitFor(() => expect(result.current.connection).not.toBe("loading"))
    stalePage.resolve(
      HttpResponse.json({
        data: [approvalRequest("pending")],
        nextCursor: null,
      })
    )
    await stalePage.promise
    expect(result.current.requests).toEqual([])
    unmount()
  })

  it("reconciles pending approvals from resources after reconnect", async () => {
    let listCalls = 0
    server.use(
      http.get(`${apiBaseUrl}/v1/user/approval-requests`, () => {
        listCalls += 1
        return HttpResponse.json({
          data: listCalls < 3 ? [approvalRequest("pending")] : [],
          nextCursor: null,
        })
      }),
      http.get(
        `${apiBaseUrl}/v1/user/approval-requests/${approvalRequestId}`,
        () => HttpResponse.json(approvalRequest("approved"))
      ),
      http.get(`${apiBaseUrl}/v1/user/events`, () => {
        return new HttpResponse("", {
          headers: { "content-type": "text/event-stream" },
        })
      })
    )
    const client = await authenticatedClient()
    function wrapper({ children }: { children: ReactNode }): ReactNode {
      return <LineaUserProvider client={client}>{children}</LineaUserProvider>
    }
    const { result, unmount } = renderHook(
      () => useApprovalRequests({ conversationId }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.connection).not.toBe("loading"))
    expect(result.current.error).toBeUndefined()
    await waitFor(() => expect(listCalls).toBeGreaterThanOrEqual(3), {
      timeout: 3_000,
    })
    expect(result.current.error).toBeUndefined()
    await waitFor(() =>
      expect(result.current.requests[0]?.decision?.outcome).toBe("approved")
    )
    expect(listCalls).toBeGreaterThanOrEqual(3)
    expect(result.current.pending).toEqual([])
    expect(result.current.connection).toBe("reconnecting")
    unmount()
  })
})
