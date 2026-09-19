import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentUserId } from '../auth/current-user-id.decorator'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { RecentAuthenticationGuard } from '../auth/recent-authentication.guard'
import { RequireRole } from '../auth/require-role.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { ApplicationsService } from './applications.service'
import {
  createApplicationSchema,
  replaceApplicationTrustSchema,
  replaceConnectorAccessPolicySchema,
  updateApplicationProfileSchema,
  type CreateApplicationDto,
  type ReplaceApplicationTrustDto,
  type ReplaceConnectorAccessPolicyDto,
  type UpdateApplicationProfileDto,
} from './dto/application-input.dto'

@Controller('applications')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  @UseGuards(RecentAuthenticationGuard)
  create(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Body(new ZodValidationPipe(createApplicationSchema))
    body: CreateApplicationDto,
  ) {
    return this.applications.create(workspaceId, actorUserId, body)
  }

  @Get()
  list(@CurrentWorkspaceId() workspaceId: string) {
    return this.applications.list(workspaceId)
  }

  @Get(':id')
  get(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applications.get(workspaceId, id)
  }

  @Patch(':id')
  @UseGuards(RecentAuthenticationGuard)
  updateProfile(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateApplicationProfileSchema))
    body: UpdateApplicationProfileDto,
  ) {
    return this.applications.updateProfile(workspaceId, actorUserId, id, body)
  }

  @Put(':id/trust-configuration')
  @UseGuards(RecentAuthenticationGuard)
  replaceTrust(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(replaceApplicationTrustSchema))
    body: ReplaceApplicationTrustDto,
  ) {
    return this.applications.replaceTrust(workspaceId, actorUserId, id, body)
  }

  @Post(':id/disable')
  @UseGuards(RecentAuthenticationGuard)
  disable(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applications.disable(workspaceId, actorUserId, id)
  }

  @Put(':id/connector-access-policy')
  @UseGuards(RecentAuthenticationGuard)
  replaceConnectorAccessPolicy(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(replaceConnectorAccessPolicySchema))
    body: ReplaceConnectorAccessPolicyDto,
  ) {
    return this.applications.replaceConnectorAccessPolicy(
      workspaceId,
      actorUserId,
      id,
      body,
    )
  }
}
