import { Module } from "@nestjs/common"
import { ApprovalsModule } from "./approvals/approvals.module"
import { BehaviourModule } from "./behaviour/behaviour.module"
import { ChatModule } from "./chat/chat.module"
import { EndUserAuthorizationModule } from "./end-user-authorization/end-user-authorization.module"
import { ExecutionsModule } from "./executions/executions.module"
import { FlaggersModule } from "./flaggers/flaggers.module"
import { QueueModule } from "./queue/queue.module"
import { ReplayModule } from "./replay/replay.module"
import { SchedulesModule } from "./schedules/schedules.module"
import { WaitsModule } from "./waits/waits.module"

@Module({
  imports: [
    QueueModule,
    SchedulesModule,
    ExecutionsModule,
    ReplayModule,
    FlaggersModule,
    ApprovalsModule,
    ChatModule,
    WaitsModule,
    BehaviourModule,
    EndUserAuthorizationModule,
  ],
})
export class AppModule {}
