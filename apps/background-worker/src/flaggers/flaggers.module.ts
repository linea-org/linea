import { Module } from "@nestjs/common"
import { GraphFlaggersService } from "./graph-flaggers.service"
import { TranscriptFlaggersService } from "./transcript-flaggers.service"

@Module({
  providers: [GraphFlaggersService, TranscriptFlaggersService],
})
export class FlaggersModule {}
