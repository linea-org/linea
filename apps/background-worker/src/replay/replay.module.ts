import { Module } from "@nestjs/common"
import { ReplayClaimSweepService } from "./replay-claim-sweep.service"

@Module({
  providers: [ReplayClaimSweepService],
})
export class ReplayModule {}
