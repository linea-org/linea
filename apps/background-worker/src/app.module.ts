import { Module } from "@nestjs/common"
import { ApprovalsModule } from "./approvals/approvals.module"
import { BehaviourModule } from "./behaviour/behaviour.module"
import { ChatModule } from "./chat/chat.module"
import { EndUserAuthorizationModule } from "./end-user-authorization/end-user-authorization.module"
import { FlaggersModule } from "./flaggers/flaggers.module"
import { OutboxModule } from "./outbox/outbox.module"
import { QueueModule } from "./queue/queue.module"
import { PushModule } from "./push/push.module"
import { ReplayModule } from "./replay/replay.module"
import { SchedulesModule } from "./schedules/schedules.module"
import { WaitsModule } from "./waits/waits.module"
import { WebhooksModule } from "./webhooks/webhooks.module"

@Module({
  imports: [
    QueueModule,
    PushModule,
    SchedulesModule,
    OutboxModule,
    ReplayModule,
    FlaggersModule,
    ApprovalsModule,
    ChatModule,
    WaitsModule,
    BehaviourModule,
    EndUserAuthorizationModule,
    WebhooksModule,
  ],
})
export class AppModule {}
