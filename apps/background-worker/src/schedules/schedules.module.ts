import { Module } from "@nestjs/common"
import { ScheduleFiringService } from "./schedule-firing.service"

@Module({
  providers: [ScheduleFiringService],
})
export class SchedulesModule {}
