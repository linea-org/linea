import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { OptionalUserId } from '../auth/optional-user-id.decorator'
import { RequireRole } from '../auth/require-role.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { WorkspaceRateLimit } from '../auth/workspace-rate-limit.guard'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { requireUserId } from './assistant-user'
import { AssistantRunService } from './assistant-run.service'
import { testRunSchema, type TestRunDto } from '../executions/dto/test-run.dto'
import { AssistantService } from './assistant.service'
import {
  assistantMessageSchema,
  type AssistantMessageDto,
} from './dto/assistant-message.dto'

@Controller()
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('member')
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly runs: AssistantRunService,
  ) {}

  @Post('workflows/:workflowId/assistant')
  @WorkspaceRateLimit('assistant')
  replyForWorkflow(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Body(new ZodValidationPipe(assistantMessageSchema))
    body: AssistantMessageDto,
  ) {
    return this.assistant.replyForWorkflow(
      workspaceId,
      requireUserId(userId),
      workflowId,
      body,
    )
  }

  @Post('applications/:applicationId/assistant')
  @WorkspaceRateLimit('assistant')
  replyForApplication(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body(new ZodValidationPipe(assistantMessageSchema))
    body: AssistantMessageDto,
  ) {
    return this.assistant.replyForApplication(
      workspaceId,
      requireUserId(userId),
      applicationId,
      body,
    )
  }

  @Post('applications/:applicationId/assistant/run')
  @WorkspaceRateLimit('start')
  runProposal(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body(new ZodValidationPipe(testRunSchema)) body: TestRunDto,
  ) {
    return this.runs.run(
      workspaceId,
      requireUserId(userId),
      applicationId,
      body,
    )
  }
}
