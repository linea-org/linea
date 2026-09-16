import { Module } from "@nestjs/common"
import { OutboxDispatcherService } from "./outbox-dispatcher.service"

@Module({ providers: [OutboxDispatcherService] })
export class OutboxModule {}
