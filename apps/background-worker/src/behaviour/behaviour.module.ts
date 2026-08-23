import { Module } from "@nestjs/common"
import { ConversationAnalyzerService } from "./conversation-analyzer.service"

@Module({
  providers: [ConversationAnalyzerService],
})
export class BehaviourModule {}
