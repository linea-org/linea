import { Module } from "@nestjs/common"
import { ApprovalsModule } from "./approvals/approvals.module"
import { ExecutionsModule } from "./executions/executions.module"
import { FlaggersModule } from "./flaggers/flaggers.module"
import { QueueModule } from "./queue/queue.module"
import { ReplayModule } from "./replay/replay.module"
import { SchedulesModule } from "./schedules/schedules.module"

@Module({
  imports: [
    QueueModule,
    SchedulesModule,
    ExecutionsModule,
    ReplayModule,
    FlaggersModule,
    ApprovalsModule,
  ],
})
export class AppModule {}
