import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import {
  OptionalAuth,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth'
import type { auth } from '@linea/auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { OptionalUserId } from '../auth/optional-user-id.decorator'
import { RequireRole } from '../auth/require-role.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
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
  saveWorkflowDraftSchema,
  type SaveWorkflowDraftDto,
} from './dto/save-workflow-draft.dto'
import {
  updateWorkflowSchema,
  type UpdateWorkflowDto,
} from './dto/update-workflow.dto'
import { WorkflowsService } from './workflows.service'

@Controller('workflows')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
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
    @OptionalUserId() actorUserId: string | undefined,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWorkflowSchema)) body: UpdateWorkflowDto,
  ) {
    return this.workflows.update(workspaceId, id, body, actorUserId)
  }

  @Put(':id/draft')
  saveDraft(
    @Session() session: UserSession<typeof auth> | null,
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveWorkflowDraftSchema))
    body: SaveWorkflowDraftDto,
  ) {
    const savedBy = session?.user
      ? { userId: session.user.id, name: session.user.name }
      : undefined
    return this.workflows.saveDraft(workspaceId, id, body, savedBy)
  }

  @Post(':id/realtime-token')
  mintRealtimeToken(
    @Session() session: UserSession<typeof auth> | null,
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.workflows.mintRealtimeToken(workspaceId, id, session)
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

  @Get(':id/versions')
  listVersions(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.workflows.listVersions(workspaceId, id)
  }

  @Get(':id/versions/:versionId')
  getVersion(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.workflows.getVersion(workspaceId, id, versionId)
  }

  // Matches Agent publish: only a published version can be bound to an Environment, and publishing queues the regression suite.
  @Post(':id/versions/:versionId/publish')
  @RequireRole('admin')
  publishVersion(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.workflows.publishVersion(workspaceId, id, versionId)
  }
}
