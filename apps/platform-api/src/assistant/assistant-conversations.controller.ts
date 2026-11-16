import {
  Controller,
  Delete,
  Get,
  Body,
  HttpCode,
  Param,
  Patch,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { z } from 'zod'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { OptionalUserId } from '../auth/optional-user-id.decorator'
import { RequireRole } from '../auth/require-role.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { cursorParam } from './assistant-conversation-cursor'
import { AssistantConversationsService } from './assistant-conversations.service'
import { requireUserId } from './assistant-user'

const listSchema = z.object({
  workflowId: z.uuid().optional(),
  cursor: cursorParam.optional(),
})

const pinSchema = z.object({ pinned: z.boolean() })

@Controller('assistant/conversations')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('member')
export class AssistantConversationsController {
  constructor(private readonly conversations: AssistantConversationsService) {}

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Query(new ZodValidationPipe(listSchema))
    query: z.infer<typeof listSchema>,
  ) {
    return this.conversations.list(
      workspaceId,
      requireUserId(userId),
      query.workflowId ?? null,
      query.cursor ?? null,
    )
  }

  @Get(':id')
  get(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.get(workspaceId, requireUserId(userId), id)
  }

  @Patch(':id')
  setPinned(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(pinSchema)) body: z.infer<typeof pinSchema>,
  ) {
    return this.conversations.setPinned(
      workspaceId,
      requireUserId(userId),
      id,
      body.pinned,
    )
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.remove(workspaceId, requireUserId(userId), id)
  }
}
