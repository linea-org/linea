import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { ApplicationWebhooksService } from './application-webhooks.service'
import {
  createWebhookSchema,
  updateWebhookSchema,
  type CreateWebhookDto,
  type UpdateWebhookDto,
} from './dto/webhook-input.dto'

@Controller('applications/:applicationId/webhooks')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class ApplicationWebhooksController {
  constructor(private readonly webhooks: ApplicationWebhooksService) {}

  @Post()
  @UseGuards(RecentAuthenticationGuard)
  create(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body(new ZodValidationPipe(createWebhookSchema)) body: CreateWebhookDto,
  ) {
    return this.webhooks.create(workspaceId, applicationId, actorUserId, body)
  }

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.webhooks.list(workspaceId, applicationId)
  }

  @Patch(':webhookId')
  @UseGuards(RecentAuthenticationGuard)
  update(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Body(new ZodValidationPipe(updateWebhookSchema)) body: UpdateWebhookDto,
  ) {
    return this.webhooks.update(
      workspaceId,
      applicationId,
      webhookId,
      actorUserId,
      body,
    )
  }

  @Post(':webhookId/rotate')
  @UseGuards(RecentAuthenticationGuard)
  rotate(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
  ) {
    return this.webhooks.rotate(
      workspaceId,
      applicationId,
      webhookId,
      actorUserId,
    )
  }

  @Delete(':webhookId')
  @UseGuards(RecentAuthenticationGuard)
  disable(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
  ) {
    return this.webhooks.disable(
      workspaceId,
      applicationId,
      webhookId,
      actorUserId,
    )
  }
}
