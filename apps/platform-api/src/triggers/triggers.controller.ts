import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  triggerWebhookSchema,
  type TriggerWebhookDto,
} from './dto/trigger-webhook.dto'
import { TriggersService } from './triggers.service'

// Auth is the same WorkspaceAuthGuard as everywhere else (session or API
// key) — a real webhook caller will always use an API key, but there's no
// reason to forbid a session for manual testing.
@Controller('triggers')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class TriggersController {
  constructor(private readonly triggers: TriggersService) {}

  @Post(':slug')
  trigger(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(triggerWebhookSchema)) body: TriggerWebhookDto,
  ) {
    return this.triggers.trigger(workspaceId, slug, body)
  }
}
