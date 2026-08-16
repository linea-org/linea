import { Module } from "@nestjs/common"
import { ApprovalTimeoutService } from "./approval-timeout.service"

@Module({
  providers: [ApprovalTimeoutService],
})
export class ApprovalsModule {}
