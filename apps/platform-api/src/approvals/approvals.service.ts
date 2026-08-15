import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { db, repositories } from '@linea/db'
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
    return repositories.approval.listPendingApprovals(
      db,
      workspaceId,
      user.email,
    )
  }

  async respond(
    userId: string,
    workspaceId: string,
    approvalId: string,
    input: RespondToApprovalDto,
  ) {
    const approval = await repositories.approval.resolveApproval(
      db,
      workspaceId,
      approvalId,
      {
        status: input.approved ? 'approved' : 'rejected',
        respondedBy: userId,
        comment: input.comment,
      },
    )
    if (!approval) {
      throw new NotFoundException('Approval not found or already responded to')
    }

    try {
      await this.queue.enqueue(approval.executionId)
    } catch (error) {
      // The approval itself already landed — resolveApproval also flipped the execution back to "queued". A failed enqueue here would otherwise strand it there with no job behind it, same failure mode testRun/trigger already guard against.
      const message = error instanceof Error ? error.message : String(error)
      await repositories.execution.failQueuedExecution(
        db,
        approval.executionId,
        {
          message: `Failed to resume after approval: ${message}`,
        },
      )
    }

    return approval
  }
}
