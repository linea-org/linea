import { sendEmail } from "@linea/auth/email"
import {
  db,
  repositories,
  type ApprovalRequest,
  type ApprovalRequestDisplay,
} from "@linea/db"
import { nodeRegistry } from "@linea/runtime"
import { Injectable, Logger } from "@nestjs/common"
import { PauseExecutionError } from "../../checkpoints/checkpoints.service"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"

function parseAudience(raw: unknown): "workspace" | "external_subject" {
  if (raw === undefined || raw === "workspace") return "workspace"
  if (raw === "external_subject") return raw
  throw new Error(
    'Approval node audience must be "workspace" or "external_subject"'
  )
}

function parseApproverEmails(raw: unknown): string[] | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

function parseTimeoutAt(raw: unknown): Date | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined
  const minutes = Number(raw)
  if (!Number.isFinite(minutes) || minutes <= 0) return undefined
  return new Date(Date.now() + minutes * 60_000)
}

function parseDetails(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined) return undefined
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Approval display details must be an object")
  }
  const details: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      throw new Error("Approval display details must contain only text values")
    }
    details[key] = value
  }
  return details
}

function parseDisplay(config: Record<string, unknown>): ApprovalRequestDisplay {
  const rawTitle = config.title ?? config.message
  const title =
    typeof rawTitle === "string" && rawTitle.trim() !== ""
      ? rawTitle.trim()
      : "Approval requested"
  const description =
    typeof config.description === "string" && config.description.trim() !== ""
      ? config.description.trim()
      : undefined
  const details = parseDetails(config.details)
  const display = { title, description, details }
  if (new TextEncoder().encode(JSON.stringify(display)).length > 8_192) {
    throw new Error("Approval display must not exceed 8 KiB")
  }
  return display
}

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
    const audience = parseAudience(config.audience)
    let request = await repositories.approvalRequest.getApprovalRequest(
      db,
      context.workspaceId,
      executionId,
      nodeId
    )
    if (request && request.audience !== audience) {
      throw new Error("Approval Request audience cannot change after creation")
    }
    if (!request) {
      const execution = await repositories.execution.getExecutionById(
        db,
        executionId
      )
      if (!execution || execution.workspaceId !== context.workspaceId) {
        throw new Error("Approval node execution was not found")
      }
      const expiresAt = parseTimeoutAt(config.timeoutMinutes)
      const created = await repositories.approvalRequest.createApprovalRequest(
        db,
        {
          workspaceId: context.workspaceId,
          applicationId: execution.applicationId,
          workflowId: execution.workflowId,
          executionId,
          nodeId,
          audience,
          externalSubjectId:
            audience === "external_subject"
              ? execution.externalSubjectRecordId
              : undefined,
          conversationId: execution.conversationId,
          display: parseDisplay(config),
          approverEmails:
            audience === "workspace"
              ? parseApproverEmails(config.approverEmails)
              : undefined,
          expiresAt,
          timeoutAction: expiresAt
            ? config.timeoutAction === "auto_approve"
              ? "auto_approve"
              : "auto_reject"
            : undefined,
        }
      )
      if (created) {
        request = created
        if (created.audience === "workspace") {
          await this.notifyApprovers(created)
        }
      } else {
        request = await repositories.approvalRequest.getApprovalRequest(
          db,
          context.workspaceId,
          executionId,
          nodeId
        )
      }
      throw new PauseExecutionError(nodeId)
    }
    if (request.status === "pending") {
      throw new PauseExecutionError(nodeId)
    }
    if (request.status === "cancelled") {
      throw new Error("Approval Request was cancelled")
    }
    const decision = await repositories.approvalRequest.getApprovalDecision(
      db,
      request.id
    )
    if (!decision) {
      throw new Error("Decided Approval Request is missing its Decision")
    }
    return nodeRegistry.approval.outputSchema.parse({
      approved: decision.outcome === "approved",
      comment: decision.comment,
      respondedBy:
        decision.actorUserId ?? decision.actorExternalSubjectId ?? null,
      respondedAt: decision.decidedAt.toISOString(),
      timedOut: decision.reason === "timeout",
    })
  }

  private async notifyApprovers(request: ApprovalRequest): Promise<void> {
    try {
      const execution = await repositories.execution.getExecutionById(
        db,
        request.executionId
      )
      const workflow = execution
        ? await repositories.workflow.getWorkflowById(
            db,
            request.workspaceId,
            execution.workflowId
          )
        : undefined
      const recipientUserIds = request.approverEmails?.length
        ? await repositories.organization.listMemberUserIdsByEmail(
            db,
            request.workspaceId,
            request.approverEmails
          )
        : await repositories.organization.listMemberUserIds(
            db,
            request.workspaceId
          )
      await repositories.notification.createNotificationsForUsers(
        db,
        recipientUserIds,
        {
          workspaceId: request.workspaceId,
          type: "execution.approval_requested",
          severity: "info",
          title: `${workflow?.name ?? "A workflow"} needs your approval`,
          body: request.display.description ?? request.display.title,
          metadata: {
            workspaceId: request.workspaceId,
            workflowId: workflow?.id,
            executionId: request.executionId,
          },
        }
      )
      if (request.approverEmails?.length) {
        const message = request.display.description ?? request.display.title
        await Promise.all(
          request.approverEmails.map((to) =>
            sendEmail({
              to,
              subject: `${workflow?.name ?? "A workflow"} needs your approval`,
              html: `<p>${escapeHtml(message)}</p>`,
              text: message,
            })
          )
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(
        `Failed to notify approvers for Approval Request ${request.id}: ${message}`
      )
    }
  }
}
