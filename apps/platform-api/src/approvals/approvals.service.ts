import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import {
  db,
  repositories,
  type ApprovalDecision,
  type ApprovalRequest,
} from '@linea/db'
import { WorkflowQueueService } from '../queue/workflow-queue.service'
import type { RespondToApprovalDto } from './dto/respond-to-approval.dto'

@Injectable()
export class ApprovalsService {
  constructor(private readonly queue: WorkflowQueueService) {}

  async list(userId: string, workspaceId: string) {
    const user = await repositories.user.getUserById(db, userId)
    if (!user) {
      throw new UnauthorizedException('A signed-in session is required')
    }
    const requests =
      await repositories.approvalRequest.listPendingApprovalRequests(
        db,
        workspaceId,
        user.email,
      )
    return requests.map((request) => this.project(request))
  }

  async respond(
    userId: string,
    workspaceId: string,
    approvalId: string,
    input: RespondToApprovalDto,
  ) {
    const user = await repositories.user.getUserById(db, userId)
    if (!user) {
      throw new UnauthorizedException('A signed-in session is required')
    }

    const result =
      await repositories.approvalRequest.decideWorkspaceApprovalRequest(
        db,
        workspaceId,
        approvalId,
        {
          outcome: input.approved ? 'approved' : 'rejected',
          actorUserId: userId,
          actorEmail: user.email,
          comment: input.comment,
        },
      )
    if (!result) {
      throw new NotFoundException(
        'Approval not found, already responded to, or you are not a designated approver',
      )
    }

    try {
      await this.queue.enqueue(result.request.executionId)
    } catch (error) {
      // The committed Decision already queued the Execution, so a failed publish must surface instead of stranding it.
      const message = error instanceof Error ? error.message : String(error)
      await repositories.execution.failQueuedExecution(
        db,
        result.request.executionId,
        {
          message: `Failed to resume after approval: ${message}`,
        },
      )
    }

    return this.project(result.request, result.decision)
  }

  private project(request: ApprovalRequest, decision?: ApprovalDecision) {
    return {
      id: request.id,
      executionId: request.executionId,
      nodeId: request.nodeId,
      status:
        request.status === 'pending'
          ? 'pending'
          : (decision?.outcome ?? request.status),
      message: request.display.description ?? request.display.title,
      approverEmails: request.approverEmails,
      timeoutAt: request.expiresAt,
      respondedBy: decision?.actorUserId ?? null,
      comment: decision?.comment ?? null,
      respondedAt: decision?.decidedAt ?? null,
      timedOut: decision?.reason === 'timeout',
      createdAt: request.requestedAt,
    }
  }
}
