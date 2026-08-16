import { Module } from '@nestjs/common'
import { RealtimeTokenService } from './realtime-token.service'
import { WorkflowsGateway } from './workflows.gateway'

@Module({
  providers: [RealtimeTokenService, WorkflowsGateway],
  exports: [RealtimeTokenService, WorkflowsGateway],
})
export class RealtimeModule {}
