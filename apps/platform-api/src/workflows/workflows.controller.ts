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
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { RequireWorkspaceKeyScopes } from '../auth/require-workspace-key-scopes.decorator'
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
@UseGuards(WorkspaceAuthGuard)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Post()
  @RequireWorkspaceKeyScopes('workflows:write')
  create(
    @CurrentWorkspaceId() workspaceId: string,
    @Body(new ZodValidationPipe(createWorkflowSchema)) body: CreateWorkflowDto,
  ) {
    return this.workflows.create(workspaceId, body)
  }

  @Get()
  @RequireWorkspaceKeyScopes('workflows:read')
  list(@CurrentWorkspaceId() workspaceId: string) {
    return this.workflows.list(workspaceId)
  }

  @Get(':id')
  @RequireWorkspaceKeyScopes('workflows:read')
  get(@CurrentWorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.workflows.get(workspaceId, id)
  }

  @Patch(':id')
  @RequireWorkspaceKeyScopes('workflows:write')
  update(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWorkflowSchema)) body: UpdateWorkflowDto,
  ) {
    return this.workflows.update(workspaceId, id, body)
  }

  @Put(':id/draft')
  @RequireWorkspaceKeyScopes('workflows:write')
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
  @RequireWorkspaceKeyScopes('workflows:write')
  createVersion(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createWorkflowVersionSchema))
    body: CreateWorkflowVersionDto,
  ) {
    return this.workflows.createVersion(workspaceId, id, body)
  }

  @Get(':id/versions')
  @RequireWorkspaceKeyScopes('workflows:read')
  listVersions(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.workflows.listVersions(workspaceId, id)
  }

  @Get(':id/versions/:versionId')
  @RequireWorkspaceKeyScopes('workflows:read')
  getVersion(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.workflows.getVersion(workspaceId, id, versionId)
  }

  @Post(':id/versions/:versionId/publish')
  @RequireWorkspaceKeyScopes('workflows:publish')
  publishVersion(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.workflows.publishVersion(workspaceId, id, versionId)
  }
}
