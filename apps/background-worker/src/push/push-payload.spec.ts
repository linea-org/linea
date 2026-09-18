import type { Notification } from "@linea/db"
import { buildPushPayload } from "./push-payload"

function notification(
  type: Notification["type"],
  metadata: Notification["metadata"]
): Notification {
  return {
    id: "notification-id",
    userId: "user-id",
    actorUserId: null,
    workspaceId: "workspace-id",
    type,
    severity: "error",
    title: "Workflow with customer secret failed",
    body: "password=secret-token raw workflow input",
    href: null,
    metadata,
    read: false,
    readAt: null,
    archivedAt: null,
    createdAt: new Date(),
  }
}

describe("push payload", () => {
  it.each([
    [
      "execution.failed",
      { executionId: "execution-id", secret: "hidden" },
      {
        title: "Execution failed",
        body: "A workflow execution needs attention.",
        data: {
          screen: "execution",
          workspaceId: "workspace-id",
          executionId: "execution-id",
        },
      },
    ],
    [
      "execution.approval_requested",
      { approvalId: "approval-id", token: "hidden" },
      {
        title: "Approval requested",
        body: "A workflow execution needs your approval.",
        data: {
          screen: "approval",
          workspaceId: "workspace-id",
          approvalId: "approval-id",
        },
      },
    ],
    [
      "system.warning",
      { signalId: "signal-id", credentials: "hidden" },
      {
        title: "Signal regressed",
        body: "A resolved signal was detected again.",
        data: {
          screen: "signal",
          workspaceId: "workspace-id",
          signalId: "signal-id",
        },
      },
    ],
  ] satisfies [Notification["type"], Notification["metadata"], object][])(
    "whitelists safe fields for %s",
    (type, metadata, expected) => {
      const payload = buildPushPayload(notification(type, metadata))
      expect(payload).toEqual(expected)
      expect(JSON.stringify(payload)).not.toMatch(
        /secret-token|raw workflow input|hidden/
      )
    }
  )

  it("ignores unrelated warnings and malformed destinations", () => {
    expect(buildPushPayload(notification("system.warning", {}))).toBeUndefined()
    expect(
      buildPushPayload(notification("execution.failed", { input: "hidden" }))
    ).toBeUndefined()
  })
})
