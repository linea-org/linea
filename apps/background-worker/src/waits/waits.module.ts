import { Module } from "@nestjs/common"
import { WaitFiringService } from "./wait-firing.service"

@Module({
  providers: [WaitFiringService],
})
export class WaitsModule {}
