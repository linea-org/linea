import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentUserId } from '../auth/current-user-id.decorator'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { ApprovalsService } from './approvals.service'
import {
  respondToApprovalSchema,
  type RespondToApprovalDto,
} from './dto/respond-to-approval.dto'

@Controller('approvals')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  list(
    @CurrentUserId() userId: string,
    @CurrentWorkspaceId() workspaceId: string,
  ) {
    return this.approvals.list(userId, workspaceId)
  }

  @Post(':id/respond')
  respond(
    @CurrentUserId() userId: string,
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(respondToApprovalSchema))
    body: RespondToApprovalDto,
  ) {
    return this.approvals.respond(userId, workspaceId, id, body)
  }
}
