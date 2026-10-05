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
import { EnvironmentWorkflowBindingsService } from './environment-workflow-bindings.service'
import {
  putWorkflowBindingSchema,
  type PutWorkflowBindingDto,
} from './dto/put-workflow-binding.dto'

@Controller('environments/:environmentId/workflow-bindings')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class EnvironmentWorkflowBindingsController {
  constructor(private readonly bindings: EnvironmentWorkflowBindingsService) {}

  @Put(':workflowId')
  put(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Body(new ZodValidationPipe(putWorkflowBindingSchema))
    body: PutWorkflowBindingDto,
  ) {
    return this.bindings.put(workspaceId, environmentId, workflowId, body)
  }

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
  ) {
    return this.bindings.list(workspaceId, environmentId)
  }
}
