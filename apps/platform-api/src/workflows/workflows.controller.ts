import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  createWorkflowVersionSchema,
  type CreateWorkflowVersionDto,
} from './dto/create-workflow-version.dto'
import {
  createWorkflowSchema,
  type CreateWorkflowDto,
} from './dto/create-workflow.dto'
import {
  updateWorkflowSchema,
  type UpdateWorkflowDto,
} from './dto/update-workflow.dto'
import { WorkflowsService } from './workflows.service'

@Controller('workflows')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Post()
  create(
    @CurrentWorkspaceId() workspaceId: string,
    @Body(new ZodValidationPipe(createWorkflowSchema)) body: CreateWorkflowDto,
  ) {
    return this.workflows.create(workspaceId, body)
  }

  @Get()
  list(@CurrentWorkspaceId() workspaceId: string) {
    return this.workflows.list(workspaceId)
  }

  @Get(':id')
  get(@CurrentWorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.workflows.get(workspaceId, id)
  }

  @Patch(':id')
  update(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWorkflowSchema)) body: UpdateWorkflowDto,
  ) {
    return this.workflows.update(workspaceId, id, body)
  }

  @Post(':id/versions')
  createVersion(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createWorkflowVersionSchema))
    body: CreateWorkflowVersionDto,
  ) {
    return this.workflows.createVersion(workspaceId, id, body)
  }

  @Post(':id/versions/:versionId/publish')
  publishVersion(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.workflows.publishVersion(workspaceId, id, versionId)
  }
}
