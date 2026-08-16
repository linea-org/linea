import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentUserId } from '../auth/current-user-id.decorator'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  listNotificationsSchema,
  type ListNotificationsDto,
} from './dto/list-notifications.dto'
import { NotificationsService } from './notifications.service'

@Controller('notifications')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUserId() userId: string,
    @CurrentWorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(listNotificationsSchema))
    query: ListNotificationsDto,
  ) {
    return this.notifications.list(userId, workspaceId, query)
  }

  @Get('unread-count')
  unreadCount(
    @CurrentUserId() userId: string,
    @CurrentWorkspaceId() workspaceId: string,
  ) {
    return this.notifications.unreadCount(userId, workspaceId)
  }

  @Post(':id/read')
  markRead(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.notifications.markRead(userId, id)
  }

  @Post(':id/unread')
  markUnread(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.notifications.markUnread(userId, id)
  }

  @Post('read-all')
  markAllRead(
    @CurrentUserId() userId: string,
    @CurrentWorkspaceId() workspaceId: string,
  ) {
    return this.notifications.markAllRead(userId, workspaceId)
  }

  @Post(':id/archive')
  archive(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.notifications.archive(userId, id)
  }

  @Post(':id/unarchive')
  unarchive(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.notifications.unarchive(userId, id)
  }

  @Delete(':id')
  remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.notifications.remove(userId, id)
  }
}
