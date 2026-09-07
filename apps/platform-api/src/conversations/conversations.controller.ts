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
import { PlatformApiKeyGuard } from '../auth/platform-api-key.guard'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { ConversationsService } from './conversations.service'
import {
  sendConversationMessageSchema,
  type SendConversationMessageDto,
} from './dto/send-conversation-message.dto'

@Controller('workflows/:workflowId/conversations')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, PlatformApiKeyGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}
  @Post(':conversationId/messages')
  sendMessage(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId', new ParseUUIDPipe()) workflowId: string,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body(new ZodValidationPipe(sendConversationMessageSchema))
    body: SendConversationMessageDto,
  ) {
    return this.conversations.sendMessage(
      workspaceId,
      workflowId,
      conversationId,
      body,
    )
  }
}
