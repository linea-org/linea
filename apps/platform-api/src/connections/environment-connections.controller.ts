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
import {
  createGithubInstallationConnectionSchema,
  connectionSubjectAuthorizationSchema,
  type CreateGithubInstallationConnection,
} from '@linea/protocol/resources'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { CurrentUserId } from '../auth/current-user-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
import { RequireRole } from '../auth/require-role.decorator'
import { RecentAuthenticationGuard } from '../auth/recent-authentication.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { EnvironmentConnectionsService } from './environment-connections.service'

@Controller('environments/:environmentId/connections')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class EnvironmentConnectionsController {
  constructor(private readonly connections: EnvironmentConnectionsService) {}
  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
  ) {
    return this.connections.list({ workspaceId, environmentId })
  }
  @Post('github-installations')
  @UseGuards(RecentAuthenticationGuard)
  createGithubInstallation(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Body(new ZodValidationPipe(createGithubInstallationConnectionSchema))
    input: CreateGithubInstallationConnection,
  ) {
    return this.connections.createGithubInstallation(
      { workspaceId, environmentId },
      actorUserId,
      input,
    )
  }
  @Get(':connectionId/authorities')
  authorities(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.connections.authorities(
      { workspaceId, environmentId },
      connectionId,
    )
  }
  @Post(':connectionId/access-grants')
  @UseGuards(RecentAuthenticationGuard)
  grant(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body(new ZodValidationPipe(connectionSubjectAuthorizationSchema))
    input: { externalSubjectId: string },
  ) {
    return this.connections.assign(
      { workspaceId, environmentId },
      connectionId,
      input.externalSubjectId,
      actorUserId,
      'requester',
    )
  }
  @Delete(':connectionId/access-grants/:authorizationId')
  @UseGuards(RecentAuthenticationGuard)
  revokeGrant(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Param('authorizationId', ParseUUIDPipe) authorizationId: string,
  ) {
    return this.connections.revokeAssignment(
      { workspaceId, environmentId },
      connectionId,
      authorizationId,
      actorUserId,
      'requester',
    )
  }
  @Post(':connectionId/reviewer-assignments')
  @UseGuards(RecentAuthenticationGuard)
  assignReviewer(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body(new ZodValidationPipe(connectionSubjectAuthorizationSchema))
    input: { externalSubjectId: string },
  ) {
    return this.connections.assign(
      { workspaceId, environmentId },
      connectionId,
      input.externalSubjectId,
      actorUserId,
      'reviewer',
    )
  }
  @Delete(':connectionId/reviewer-assignments/:authorizationId')
  @UseGuards(RecentAuthenticationGuard)
  revokeReviewer(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Param('authorizationId', ParseUUIDPipe) authorizationId: string,
  ) {
    return this.connections.revokeAssignment(
      { workspaceId, environmentId },
      connectionId,
      authorizationId,
      actorUserId,
      'reviewer',
    )
  }
  @Delete(':connectionId')
  @UseGuards(RecentAuthenticationGuard)
  revoke(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.connections.revoke(
      { workspaceId, environmentId },
      connectionId,
      actorUserId,
    )
  }
}
