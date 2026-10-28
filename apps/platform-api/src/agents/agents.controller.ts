import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { RequireRole } from '../auth/require-role.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  createAgentSchema,
  createAgentVersionSchema,
  updateAgentSchema,
  type CreateAgentDto,
  type CreateAgentVersionDto,
  type UpdateAgentDto,
} from './dto/agent-input.dto'
import { AgentsService } from './agents.service'

@Controller('agents')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}
  @Post()
  create(
    @CurrentWorkspaceId() workspaceId: string,
    @Body(new ZodValidationPipe(createAgentSchema)) input: CreateAgentDto,
  ) {
    return this.agents.create(workspaceId, input)
  }
  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Query('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.agents.list(workspaceId, applicationId)
  }
  @Get(':id')
  get(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agents.get(workspaceId, id)
  }
  @Patch(':id')
  update(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAgentSchema)) input: UpdateAgentDto,
  ) {
    return this.agents.update(workspaceId, id, input)
  }
  @Post(':id/versions')
  createVersion(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createAgentVersionSchema))
    input: CreateAgentVersionDto,
  ) {
    return this.agents.createVersion(workspaceId, id, input)
  }
  @Get(':id/versions')
  listVersions(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agents.listVersions(workspaceId, id)
  }
  @Get(':id/versions/:versionId')
  getVersion(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.agents.getVersion(workspaceId, id, versionId)
  }
  @Post(':id/versions/:versionId/publish')
  publishVersion(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.agents.publishVersion(workspaceId, id, versionId)
  }
}
