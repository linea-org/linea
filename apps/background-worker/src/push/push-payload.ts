import type { Notification } from "@linea/db"
import type { ExpoPushPayload } from "./expo-push-client"

type SafePushPayload = Omit<ExpoPushPayload, "to">

function identifiers(
  notification: Notification,
  requiredId: "approvalId" | "executionId" | "signalId"
): Record<string, string> | undefined {
  const workspaceId = notification.workspaceId
  const resourceId = notification.metadata?.[requiredId]
  if (!workspaceId || typeof resourceId !== "string") return undefined
  return { workspaceId, [requiredId]: resourceId }
}

export function buildPushPayload(
  notification: Notification
): SafePushPayload | undefined {
  if (notification.type === "execution.failed") {
    const data = identifiers(notification, "executionId")
    return data
      ? {
          title: "Execution failed",
          body: "A workflow execution needs attention.",
          data: { screen: "execution", ...data },
        }
      : undefined
  }
  if (notification.type === "execution.approval_requested") {
    const data = identifiers(notification, "approvalId")
    return data
      ? {
          title: "Approval requested",
          body: "A workflow execution needs your approval.",
          data: { screen: "approval", ...data },
        }
      : undefined
  }
  if (notification.type === "system.warning") {
    const data = identifiers(notification, "signalId")
    return data
      ? {
          title: "Signal regressed",
          body: "A resolved signal was detected again.",
          data: { screen: "signal", ...data },
        }
      : undefined
  }
  return undefined
}
