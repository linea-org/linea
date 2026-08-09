import { Module } from "@nestjs/common"
import { ExecutionsModule } from "./executions/executions.module"
import { QueueModule } from "./queue/queue.module"
import { ReplayModule } from "./replay/replay.module"
import { SchedulesModule } from "./schedules/schedules.module"

@Module({
  imports: [QueueModule, SchedulesModule, ExecutionsModule, ReplayModule],
})
export class AppModule {}
