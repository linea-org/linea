import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { EnvironmentKeysService } from './environment-keys.service'
import {
  createEnvironmentKeySchema,
  type CreateEnvironmentKeyDto,
} from './dto/create-environment-key.dto'

@Controller('environments/:environmentId/keys')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class EnvironmentKeysController {
  constructor(private readonly environmentKeys: EnvironmentKeysService) {}

  @Post()
  @UseGuards(RecentAuthenticationGuard)
  create(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Body(new ZodValidationPipe(createEnvironmentKeySchema))
    body: CreateEnvironmentKeyDto,
  ) {
    return this.environmentKeys.create(
      workspaceId,
      environmentId,
      actorUserId,
      body,
    )
  }

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
  ) {
    return this.environmentKeys.list(workspaceId, environmentId)
  }

  @Post(':id/rotate')
  @UseGuards(RecentAuthenticationGuard)
  rotate(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.environmentKeys.rotate(
      workspaceId,
      environmentId,
      id,
      actorUserId,
    )
  }

  @Delete(':id')
  @UseGuards(RecentAuthenticationGuard)
  revoke(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.environmentKeys.revoke(
      workspaceId,
      environmentId,
      id,
      actorUserId,
    )
  }
}
