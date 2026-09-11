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
import { ApplicationKeysService } from './application-keys.service'
import {
  createApplicationKeySchema,
  type CreateApplicationKeyDto,
} from './dto/create-application-key.dto'

@Controller('applications/:applicationId/keys')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class ApplicationKeysController {
  constructor(private readonly applicationKeys: ApplicationKeysService) {}

  @Post()
  @UseGuards(RecentAuthenticationGuard)
  create(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body(new ZodValidationPipe(createApplicationKeySchema))
    body: CreateApplicationKeyDto,
  ) {
    return this.applicationKeys.create(
      workspaceId,
      applicationId,
      actorUserId,
      body,
    )
  }

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.applicationKeys.list(workspaceId, applicationId)
  }

  @Post(':id/rotate')
  @UseGuards(RecentAuthenticationGuard)
  rotate(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applicationKeys.rotate(
      workspaceId,
      applicationId,
      id,
      actorUserId,
    )
  }

  @Delete(':id')
  @UseGuards(RecentAuthenticationGuard)
  revoke(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applicationKeys.revoke(
      workspaceId,
      applicationId,
      id,
      actorUserId,
    )
  }
}
