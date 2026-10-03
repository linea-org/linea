import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { db, repositories } from '@linea/db'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { RecentAuthenticationGuard } from '../auth/recent-authentication.guard'
import { RequireRole } from '../auth/require-role.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  createApplicationSchema,
  type CreateApplicationDto,
} from './dto/application-input.dto'

@Controller('applications')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
export class ApplicationsController {
  @Post()
  @RequireRole('admin')
  @UseGuards(RecentAuthenticationGuard)
  create(
    @CurrentWorkspaceId() workspaceId: string,
    @Body(new ZodValidationPipe(createApplicationSchema))
    input: CreateApplicationDto,
  ) {
    return repositories.application.createApplication(db, {
      workspaceId,
      ...input,
    })
  }
  @Get()
  list(@CurrentWorkspaceId() workspaceId: string) {
    return repositories.application.listApplications(db, workspaceId)
  }
  @Get(':id')
  async get(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const application = await repositories.application.getApplicationById(
      db,
      workspaceId,
      id,
    )
    if (!application) throw new NotFoundException('Application not found')
    return application
  }
  @Get(':id/workflows')
  async workflows(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.get(workspaceId, id)
    return repositories.workflow.listWorkflows(db, workspaceId, {
      applicationId: id,
    })
  }
  @Get(':id/environments')
  async environments(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.get(workspaceId, id)
    return repositories.environment.listEnvironments(db, workspaceId, id)
  }
}
