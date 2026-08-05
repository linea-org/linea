import { Module } from "@nestjs/common"
import { CheckpointsService } from "./checkpoints.service"

@Module({
  providers: [CheckpointsService],
  exports: [CheckpointsService],
})
export class CheckpointsModule {}
