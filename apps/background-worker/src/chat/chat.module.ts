import { Module } from "@nestjs/common"
import { ChatMessageSweepService } from "./chat-message-sweep.service"

@Module({
  providers: [ChatMessageSweepService],
})
export class ChatModule {}
