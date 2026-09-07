import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { ConversationAnalysesService } from './conversation-analyses.service'
import {
  conversationAnalysisQuerySchema,
  type ConversationAnalysisQueryDto,
} from './dto/conversation-analysis-query.dto'

@Controller('workflows/:workflowId/conversations')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class ConversationAnalysesController {
  constructor(
    private readonly conversationAnalyses: ConversationAnalysesService,
  ) {}

  @Get(':conversationId/analysis')
  get(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Param('conversationId') conversationId: string,
    @Query(new ZodValidationPipe(conversationAnalysisQuerySchema))
    query: ConversationAnalysisQueryDto,
  ) {
    return this.conversationAnalyses.get(
      workspaceId,
      workflowId,
      conversationId,
      query.findingId,
    )
  }
}
