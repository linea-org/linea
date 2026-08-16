import type { NotificationSummary } from "@/lib/notifications-api"

export type NotificationTarget =
  | {
      kind: "execution"
      label: string
      workflowId: string
      executionId: string
    }
  | { kind: "workflow"; label: string; workflowId: string }
  | { kind: "workflows"; label: string }
  | { kind: "members"; label: string }
  | { kind: "settings"; label: string }

function metaString(
  meta: NonNullable<NotificationSummary["metadata"]>,
  key: string
): string | undefined {
  const value = meta[key]
  return typeof value === "string" ? value : undefined
}

/** Destinations are resolved here from type + metadata — stored href is unused because the client already knows the workspace slug. */
export function resolveNotificationTarget(
  notification: Pick<NotificationSummary, "type" | "metadata">
): NotificationTarget | undefined {
  const meta = notification.metadata ?? {}
  const workflowId = metaString(meta, "workflowId")
  const executionId = metaString(meta, "executionId")
  switch (notification.type) {
    case "execution.failed":
    case "execution.completed":
    case "execution.started":
      if (workflowId && executionId) {
        return {
          kind: "execution",
          label: "View run",
          workflowId,
          executionId,
        }
      }
      return undefined
    case "system.warning":
    case "workflow.published":
    case "workflow.archived":
      if (workflowId) {
        return { kind: "workflow", label: "View workflow", workflowId }
      }
      return undefined
    case "workflow.deleted":
      return { kind: "workflows", label: "View workflows" }
    case "workspace.invitation":
    case "workspace.invitation_accepted":
    case "workspace.member_joined":
    case "workspace.member_removed":
    case "workspace.role_changed":
      return { kind: "members", label: "View members" }
    case "workspace.transferred":
      return { kind: "settings", label: "View settings" }
    case "account.login_detected":
    case "account.new_device":
    case "account.email_verified":
    case "account.password_changed":
    case "system.info":
    case "system.maintenance":
      return undefined
    default:
      return undefined
  }
}
