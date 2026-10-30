import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { RequireRole } from '../auth/require-role.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  createAgentContractSchema,
  type CreateAgentContractDto,
} from './dto/create-agent-contract.dto'
import { AgentContractsService } from './agent-contracts.service'

@Controller('agents/:agentId/contracts')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class AgentContractsController {
  constructor(private readonly contracts: AgentContractsService) {}

  @Post()
  create(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body(new ZodValidationPipe(createAgentContractSchema))
    body: CreateAgentContractDto,
  ) {
    return this.contracts.create(workspaceId, agentId, body)
  }

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
  ) {
    return this.contracts.list(workspaceId, agentId)
  }

  @Get(':contractRevisionId')
  get(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('contractRevisionId', ParseUUIDPipe) contractRevisionId: string,
  ) {
    return this.contracts.get(workspaceId, agentId, contractRevisionId)
  }
}
