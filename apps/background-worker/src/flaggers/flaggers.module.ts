import { Module } from "@nestjs/common"
import { GraphFlaggersService } from "./graph-flaggers.service"

@Module({
  providers: [GraphFlaggersService],
})
export class FlaggersModule {}
