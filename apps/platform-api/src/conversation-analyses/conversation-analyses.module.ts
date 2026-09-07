import { Module } from '@nestjs/common'
import { ConversationAnalysesController } from './conversation-analyses.controller'
import { ConversationAnalysesService } from './conversation-analyses.service'

@Module({
  controllers: [ConversationAnalysesController],
  providers: [ConversationAnalysesService],
})
export class ConversationAnalysesModule {}
