import { Injectable, Logger } from "@nestjs/common"
import { sendEmail } from "@linea/auth/email"
import { db, repositories, type Approval } from "@linea/db"
import { nodeRegistry } from "@linea/runtime"
import { PauseExecutionError } from "../../checkpoints/checkpoints.service"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"

function parseApproverEmails(raw: unknown): string[] | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined
  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
}

function parseTimeoutAt(raw: unknown): Date | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined
  const minutes = Number(raw)
  if (!Number.isFinite(minutes) || minutes <= 0) return undefined
  return new Date(Date.now() + minutes * 60_000)
}

// approval.message is workflow-author-controlled and interpolated into an email's HTML body —
// escaped so it can only ever render as inert text, never as markup (links, images, scripts).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

@Injectable()
export class ApprovalNode implements NodeHandler {
  private readonly logger = new Logger(ApprovalNode.name)

  async execute(
    config: Record<string, unknown>,
    _input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown> {
    const { executionId, nodeId } = context
    if (!executionId || !nodeId) {
      throw new Error(
        "Approval node requires executionId and nodeId in context"
      )
    }

    let approval = await repositories.approval.getApproval(
      db,
      context.workspaceId,
      executionId,
      nodeId
    )

    if (!approval) {
      const timeoutAt = parseTimeoutAt(config.timeoutMinutes)
      const created = await repositories.approval.createApproval(db, {
        workspaceId: context.workspaceId,
        executionId,
        nodeId,
        message:
          typeof config.message === "string" ? config.message : undefined,
        approverEmails: parseApproverEmails(config.approverEmails),
        timeoutAt,
        timeoutAction: timeoutAt
          ? config.timeoutAction === "auto_approve"
            ? "auto_approve"
            : "auto_reject"
          : undefined,
      })
      if (created) {
        approval = created
        // Only the worker that actually won the insert notifies — a concurrent re-fetch below (a lease reclaim racing this same visit) must not double-notify.
        await this.notifyApprovers(created)
      } else {
        // A concurrent worker already inserted it — re-fetch rather than trust a possibly-undefined onConflictDoNothing result.
        approval = await repositories.approval.getApproval(
          db,
          context.workspaceId,
          executionId,
          nodeId
        )
      }
      throw new PauseExecutionError(nodeId)
    }

    if (approval.status === "pending") {
      throw new PauseExecutionError(nodeId)
    }

    return nodeRegistry.approval.outputSchema.parse({
      approved: approval.status === "approved",
      comment: approval.comment,
      respondedBy: approval.respondedBy,
      respondedAt: approval.respondedAt?.toISOString() ?? null,
      timedOut: approval.timedOut,
    })
  }

  /** Best-effort: a notification failure must never fail the node — the approval row already exists and the run is already paused by the time this runs. In-app always fans out (to the listed approvers if set, otherwise the whole workspace); email only goes to explicitly-listed approver addresses — blasting the whole workspace by email for an unassigned approval isn't a default anyone asked for. */
  private async notifyApprovers(approval: Approval): Promise<void> {
    try {
      const execution = await repositories.execution.getExecutionById(
        db,
        approval.executionId
      )
      const workflow = execution
        ? await repositories.workflow.getWorkflowById(
            db,
            approval.workspaceId,
            execution.workflowId
          )
        : undefined

      const recipientUserIds = approval.approverEmails?.length
        ? await repositories.organization.listMemberUserIdsByEmail(
            db,
            approval.workspaceId,
            approval.approverEmails
          )
        : await repositories.organization.listMemberUserIds(
            db,
            approval.workspaceId
          )

      await repositories.notification.createNotificationsForUsers(
        db,
        recipientUserIds,
        {
          workspaceId: approval.workspaceId,
          type: "execution.approval_requested",
          severity: "info",
          title: `${workflow?.name ?? "A workflow"} needs your approval`,
          body:
            approval.message ?? "A workflow run is waiting on your decision.",
          metadata: {
            workspaceId: approval.workspaceId,
            workflowId: workflow?.id,
            executionId: approval.executionId,
          },
        }
      )

      if (approval.approverEmails?.length) {
        await Promise.all(
          approval.approverEmails.map((to) =>
            sendEmail({
              to,
              subject: `${workflow?.name ?? "A workflow"} needs your approval`,
              html: `<p>${escapeHtml(approval.message ?? "A workflow run is waiting on your decision.")}</p>`,
              text:
                approval.message ??
                "A workflow run is waiting on your decision.",
            })
          )
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(
        `Failed to notify approvers for approval ${approval.id}: ${message}`
      )
    }
  }
}
