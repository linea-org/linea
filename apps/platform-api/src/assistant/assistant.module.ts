import { Module } from '@nestjs/common'
import { AssistantConversationsController } from './assistant-conversations.controller'
import { AssistantConversationsService } from './assistant-conversations.service'
import { AssistantController } from './assistant.controller'
import { AssistantModel } from './assistant-model'
import { AssistantService } from './assistant.service'
import { AssistantTools } from './assistant-tools'

@Module({
  controllers: [AssistantController, AssistantConversationsController],
  providers: [
    AssistantModel,
    AssistantTools,
    AssistantService,
    AssistantConversationsService,
  ],
})
export class AssistantModule {}
