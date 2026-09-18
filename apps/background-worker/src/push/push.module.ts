import { Module } from "@nestjs/common"
import { PushDeliveryService } from "./push-delivery.service"

@Module({ providers: [PushDeliveryService] })
export class PushModule {}
