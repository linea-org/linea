import { Module } from '@nestjs/common'
import { ExecutionsModule } from '../executions/executions.module'
import { AssistantConversationsController } from './assistant-conversations.controller'
import { AssistantConversationsService } from './assistant-conversations.service'
import { AssistantController } from './assistant.controller'
import { AssistantModel } from './assistant-model'
import { AssistantRunService } from './assistant-run.service'
import { AssistantSelfTest } from './assistant-self-test'
import { AssistantService } from './assistant.service'
import { AssistantTools } from './assistant-tools'

@Module({
  imports: [ExecutionsModule],
  controllers: [AssistantController, AssistantConversationsController],
  providers: [
    AssistantModel,
    AssistantSelfTest,
    AssistantTools,
    AssistantService,
    AssistantConversationsService,
    AssistantRunService,
  ],
})
export class AssistantModule {}
