import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { RequireRole } from '../auth/require-role.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { EnvironmentAgentBindingsService } from './environment-agent-bindings.service'
import {
  putAgentBindingSchema,
  type PutAgentBindingDto,
} from './dto/put-agent-binding.dto'

@Controller('environments/:environmentId/agent-bindings')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class EnvironmentAgentBindingsController {
  constructor(private readonly bindings: EnvironmentAgentBindingsService) {}

  @Put(':agentId')
  put(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body(new ZodValidationPipe(putAgentBindingSchema))
    body: PutAgentBindingDto,
  ) {
    return this.bindings.put(workspaceId, environmentId, agentId, body)
  }

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
  ) {
    return this.bindings.list(workspaceId, environmentId)
  }
}
