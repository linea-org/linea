import { Module } from "@nestjs/common"
import { QueueModule } from "./queue/queue.module"
import { SchedulesModule } from "./schedules/schedules.module"

@Module({
  imports: [QueueModule, SchedulesModule],
})
export class AppModule {}
