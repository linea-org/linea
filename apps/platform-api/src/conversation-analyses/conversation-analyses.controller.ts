import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { ConversationAnalysesService } from './conversation-analyses.service'

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
  ) {
    return this.conversationAnalyses.get(
      workspaceId,
      workflowId,
      conversationId,
    )
  }
}
