import {
  fireEvent,
  render as renderReact,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { http, HttpResponse } from "msw"
import type { ReactElement, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LineaUserProvider } from "../src/index.js"
import {
  CopilotKitApprovalAction,
  LINEA_APPROVAL_ACTION_NAME,
  type CopilotKitApprovalPresentation,
} from "../src/copilotkit.js"
import { authenticatedClient } from "./authenticated-client.js"
import { approvalRequest, approvalRequestId, executionId } from "./fixtures.js"
import { apiBaseUrl, applicationId, server } from "./server.js"

type ToolRender = (input: {
  name: string
  toolCallId: string
  parameters: { approvalRequestId?: string }
  status: "executing"
  result: undefined
}) => ReactElement | null

type RegisteredTool = {
  name: string
  render: ToolRender
}

const copilotKit = vi.hoisted((): { tool: RegisteredTool | undefined } => ({
  tool: undefined,
}))

vi.mock("@copilotkit/react-core/v2", () => ({
  useRenderTool(configuration: RegisteredTool) {
    copilotKit.tool = configuration
  },
}))

function eventStream(
  eventType?: "approval_request.decided" | "approval_request.cancelled"
) {
  const encoder = new TextEncoder()
  return new HttpResponse(
    new ReadableStream<Uint8Array>({
      start(controller) {
        if (!eventType) return
        const event = {
          id: "e0000000-0000-4000-8000-00000000000e",
          type: eventType,
          version: 1,
          createdAt: "2026-09-18T12:02:00.000Z",
          applicationId,
          data: { approvalRequestId, executionId },
        }
        controller.enqueue(
          encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`)
        )
      },
    }),
    { headers: { "content-type": "text/event-stream" } }
  )
}

function registeredAction(id = approvalRequestId): ReactElement | null {
  const tool = copilotKit.tool
  if (!tool) throw new Error("CopilotKit approval action is not registered")
  return tool.render({
    name: LINEA_APPROVAL_ACTION_NAME,
    toolCallId: `tool-call-${id}`,
    parameters: { approvalRequestId: id },
    status: "executing",
    result: undefined,
  })
}

async function mountAdapter(
  customRender?: (presentation: CopilotKitApprovalPresentation) => ReactNode
): Promise<void> {
  const client = await authenticatedClient()
  renderReact(
    <LineaUserProvider client={client}>
      <CopilotKitApprovalAction render={customRender} />
    </LineaUserProvider>
  )
  await waitFor(() => {
    expect(copilotKit.tool?.name).toBe(LINEA_APPROVAL_ACTION_NAME)
  })
}

afterEach(() => {
  copilotKit.tool = undefined
})

describe("CopilotKitApprovalAction", () => {
  it("renders the pending state", async () => {
    server.use(
      http.get(`${apiBaseUrl}/v1/user/approval-requests`, () =>
        HttpResponse.json({
          data: [approvalRequest("pending")],
          nextCursor: null,
        })
      ),
      http.get(`${apiBaseUrl}/v1/user/events`, () => eventStream())
    )
    await mountAdapter((presentation) => <p>{presentation.state}</p>)
    const action = renderReact(<>{registeredAction()}</>)
    await waitFor(() => {
      action.rerender(<>{registeredAction()}</>)
      expect(screen.getByText("pending")).toBeTruthy()
    })
  })

  it.each(["approved", "rejected"] as const)(
    "submits the %s Decision through the public user boundary",
    async (outcome) => {
      let submitted: unknown
      server.use(
        http.get(`${apiBaseUrl}/v1/user/approval-requests`, () =>
          HttpResponse.json({
            data: [approvalRequest("pending")],
            nextCursor: null,
          })
        ),
        http.get(`${apiBaseUrl}/v1/user/events`, () => eventStream()),
        http.post(
          `${apiBaseUrl}/v1/user/approval-requests/${approvalRequestId}/decisions`,
          async ({ request }) => {
            submitted = await request.json()
            return HttpResponse.json(
              {
                id: "60000000-0000-4000-8000-000000000006",
                outcome,
                reason: "human",
                comment: null,
                decidedAt: "2026-09-18T12:02:00.000Z",
              },
              { status: 201 }
            )
          }
        )
      )
      await mountAdapter()
      const action = renderReact(<>{registeredAction()}</>)
      const label = outcome === "approved" ? "Approve" : "Reject"
      await waitFor(() => {
        action.rerender(<>{registeredAction()}</>)
        expect(screen.getByRole("button", { name: label })).toBeTruthy()
      })
      fireEvent.click(screen.getByRole("button", { name: label }))
      await waitFor(() => {
        expect(submitted).toEqual({ decision: outcome })
      })
    }
  )

  it.each([
    ["approved", "approval_request.decided", "approved"],
    ["rejected", "approval_request.decided", "rejected"],
    ["timeout", "approval_request.decided", "timeout-decided"],
    ["cancelled", "approval_request.cancelled", "cancelled"],
  ] as const)(
    "renders the %s resource state from event reconciliation",
    async (resourceState, eventType, presentationState) => {
      server.use(
        http.get(`${apiBaseUrl}/v1/user/approval-requests`, () =>
          HttpResponse.json({
            data: [approvalRequest("pending")],
            nextCursor: null,
          })
        ),
        http.get(`${apiBaseUrl}/v1/user/events`, () => eventStream(eventType)),
        http.get(
          `${apiBaseUrl}/v1/user/approval-requests/${approvalRequestId}`,
          () => HttpResponse.json(approvalRequest(resourceState))
        )
      )
      await mountAdapter((presentation) => <p>{presentation.state}</p>)
      const action = renderReact(<>{registeredAction()}</>)
      await waitFor(() => {
        action.rerender(<>{registeredAction()}</>)
        expect(screen.getByText(presentationState)).toBeTruthy()
      })
    }
  )

  it("renders reconnecting and reconciles through the public event stream", async () => {
    let eventConnections = 0
    server.use(
      http.get(`${apiBaseUrl}/v1/user/approval-requests`, () =>
        HttpResponse.json({
          data: [approvalRequest("pending")],
          nextCursor: null,
        })
      ),
      http.get(`${apiBaseUrl}/v1/user/events`, () => {
        eventConnections += 1
        if (eventConnections > 1) return eventStream("approval_request.decided")
        return new HttpResponse("", {
          headers: { "content-type": "text/event-stream" },
        })
      }),
      http.get(
        `${apiBaseUrl}/v1/user/approval-requests/${approvalRequestId}`,
        () => HttpResponse.json(approvalRequest("approved"))
      )
    )
    await mountAdapter((presentation) => <p>{presentation.state}</p>)
    const action = renderReact(<>{registeredAction()}</>)
    await waitFor(() => {
      action.rerender(<>{registeredAction()}</>)
      expect(screen.getByText("reconnecting")).toBeTruthy()
    })
    await waitFor(
      () => {
        action.rerender(<>{registeredAction()}</>)
        expect(screen.getByText("approved")).toBeTruthy()
      },
      { timeout: 3_000 }
    )
  })

  it("renders errors from the public event stream", async () => {
    server.use(
      http.get(`${apiBaseUrl}/v1/user/approval-requests`, () =>
        HttpResponse.json({
          data: [approvalRequest("pending")],
          nextCursor: null,
        })
      ),
      http.get(`${apiBaseUrl}/v1/user/events`, () =>
        HttpResponse.json(
          {
            error: {
              code: "service_unavailable",
              message: "Events are unavailable",
            },
          },
          { status: 503 }
        )
      )
    )
    await mountAdapter((presentation) => <p>{presentation.state}</p>)
    const action = renderReact(<>{registeredAction()}</>)
    await waitFor(() => {
      action.rerender(<>{registeredAction()}</>)
      expect(screen.getByText("error")).toBeTruthy()
    })
  })

  it("scopes Decision errors to the Approval Request that failed", async () => {
    const otherApprovalRequestId = "70000000-0000-4000-8000-000000000007"
    const otherRequest = {
      ...approvalRequest("pending"),
      id: otherApprovalRequestId,
      display: { title: "Delete release" },
    }
    server.use(
      http.get(`${apiBaseUrl}/v1/user/approval-requests`, () =>
        HttpResponse.json({
          data: [approvalRequest("pending"), otherRequest],
          nextCursor: null,
        })
      ),
      http.get(`${apiBaseUrl}/v1/user/events`, () => eventStream()),
      http.post(
        `${apiBaseUrl}/v1/user/approval-requests/${approvalRequestId}/decisions`,
        () => HttpResponse.json({ error: "Unavailable" }, { status: 503 })
      )
    )
    await mountAdapter((presentation) => (
      <section data-testid={presentation.request.id}>
        <p>{presentation.state}</p>
        {presentation.isActionable ? (
          <button
            type="button"
            onClick={() => void presentation.approve().catch(() => undefined)}
          >
            Approve {presentation.request.display.title}
          </button>
        ) : null}
      </section>
    ))
    const action = renderReact(
      <>
        {registeredAction()}
        {registeredAction(otherApprovalRequestId)}
      </>
    )
    await waitFor(() => {
      action.rerender(
        <>
          {registeredAction()}
          {registeredAction(otherApprovalRequestId)}
        </>
      )
      expect(
        screen.getByRole("button", { name: "Approve Publish release" })
      ).toBeTruthy()
      expect(
        screen.getByRole("button", { name: "Approve Delete release" })
      ).toBeTruthy()
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Approve Publish release" })
    )
    await waitFor(() => {
      expect(
        within(screen.getByTestId(approvalRequestId)).getByText("error")
      ).toBeTruthy()
    })
    expect(
      within(screen.getByTestId(otherApprovalRequestId)).getByText("pending")
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Approve Delete release" })
    ).toBeTruthy()
  })
})
