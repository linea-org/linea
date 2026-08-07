import { Module } from "@nestjs/common"
import { OrphanedExecutionSweepService } from "./orphaned-execution-sweep.service"

@Module({
  providers: [OrphanedExecutionSweepService],
})
export class ExecutionsModule {}
