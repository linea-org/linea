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
import { ApplicationWorkflowBindingsService } from './application-workflow-bindings.service'
import {
  putWorkflowBindingSchema,
  type PutWorkflowBindingDto,
} from './dto/put-workflow-binding.dto'

@Controller('applications/:applicationId/workflow-bindings')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class ApplicationWorkflowBindingsController {
  constructor(private readonly bindings: ApplicationWorkflowBindingsService) {}

  @Put(':workflowId')
  put(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Body(new ZodValidationPipe(putWorkflowBindingSchema))
    body: PutWorkflowBindingDto,
  ) {
    return this.bindings.put(workspaceId, applicationId, workflowId, body)
  }

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.bindings.list(workspaceId, applicationId)
  }
}
