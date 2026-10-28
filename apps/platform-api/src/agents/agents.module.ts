import { Module } from '@nestjs/common'
import { AgentsController } from './agents.controller'
import { AgentsService } from './agents.service'
import { AgentContractsController } from './agent-contracts.controller'
import { AgentContractsService } from './agent-contracts.service'

@Module({
  controllers: [AgentsController, AgentContractsController],
  providers: [AgentsService, AgentContractsService],
})
export class AgentsModule {}
