import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { OptionalUserId } from '../auth/optional-user-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { RequireWorkspaceKeyScopes } from '../auth/require-workspace-key-scopes.decorator'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  triggerWebhookSchema,
  type TriggerWebhookDto,
} from './dto/trigger-webhook.dto'
import { TriggersService } from './triggers.service'

@Controller('triggers')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class TriggersController {
  constructor(private readonly triggers: TriggersService) {}

  @Post(':environmentId/:slug')
  @RequireWorkspaceKeyScopes('executions:start')
  trigger(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() triggeredByUserId: string | undefined,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(triggerWebhookSchema)) body: TriggerWebhookDto,
  ) {
    return this.triggers.trigger(
      workspaceId,
      environmentId,
      slug,
      body,
      triggeredByUserId,
    )
  }
}
