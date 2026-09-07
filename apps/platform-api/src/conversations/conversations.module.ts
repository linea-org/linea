import { Module } from '@nestjs/common'
import { PlatformApiKeyGuard } from '../auth/platform-api-key.guard'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { ConversationSessionTokenService } from './conversation-session-token.service'
import { ConversationsController } from './conversations.controller'
import { ConversationsService } from './conversations.service'

@Module({
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    ConversationSessionTokenService,
    WorkspaceAuthGuard,
    PlatformApiKeyGuard,
  ],
})
export class ConversationsModule {}
