import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  ApprovalRequest,
  type ApprovalRequestProps,
  type ApprovalRequestPresentationState,
} from "../src/index.js"
import { approvalRequest } from "./fixtures.js"

describe("ApprovalRequest", () => {
  const states: [
    ApprovalRequestPresentationState,
    ReturnType<typeof approvalRequest>,
    ApprovalRequestProps["connection"],
    Error | undefined,
  ][] = [
    ["pending", approvalRequest("pending"), "ready", undefined],
    ["approved", approvalRequest("approved"), "ready", undefined],
    ["rejected", approvalRequest("rejected"), "ready", undefined],
    ["timeout-decided", approvalRequest("timeout"), "ready", undefined],
    ["cancelled", approvalRequest("cancelled"), "ready", undefined],
    ["reconnecting", approvalRequest("pending"), "reconnecting", undefined],
    ["error", approvalRequest("pending"), "error", new Error("Offline")],
  ]
  it.each(states)(
    "supports custom rendering for %s",
    (expected, request, connection, error) => {
      let renderedState: ApprovalRequestPresentationState | undefined
      render(
        <ApprovalRequest
          request={request}
          connection={connection}
          error={error}
          render={(presentation) => {
            renderedState = presentation.state
            return <p>{presentation.label}</p>
          }}
        />
      )
      expect(renderedState).toBe(expected)
    }
  )

  it("renders schema details and passes an optional comment to an action", async () => {
    const approve = vi.fn()
    render(
      <ApprovalRequest
        request={approvalRequest("pending")}
        onApprove={approve}
      />
    )
    expect(screen.getByText("Environment")).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Comment"), {
      target: { value: "Reviewed" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    expect(approve).toHaveBeenCalledWith("Reviewed")
  })
})
