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
import { EnvironmentsService } from './environments.service'
import {
  replaceEnvironmentTrustSchema,
  replaceConnectorAccessPolicySchema,
  updateEnvironmentProfileSchema,
  type ReplaceEnvironmentTrustDto,
  type ReplaceConnectorAccessPolicyDto,
  type UpdateEnvironmentProfileDto,
} from './dto/environment-input.dto'

@Controller('environments')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class EnvironmentsController {
  constructor(private readonly environments: EnvironmentsService) {}

  @Get(':id')
  get(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.environments.get(workspaceId, id)
  }

  @Patch(':id')
  @UseGuards(RecentAuthenticationGuard)
  updateProfile(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEnvironmentProfileSchema))
    body: UpdateEnvironmentProfileDto,
  ) {
    return this.environments.updateProfile(workspaceId, actorUserId, id, body)
  }

  @Put(':id/trust-configuration')
  @UseGuards(RecentAuthenticationGuard)
  replaceTrust(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(replaceEnvironmentTrustSchema))
    body: ReplaceEnvironmentTrustDto,
  ) {
    return this.environments.replaceTrust(workspaceId, actorUserId, id, body)
  }

  @Post(':id/disable')
  @UseGuards(RecentAuthenticationGuard)
  disable(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.environments.disable(workspaceId, actorUserId, id)
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
    return this.environments.replaceConnectorAccessPolicy(
      workspaceId,
      actorUserId,
      id,
      body,
    )
  }
}
