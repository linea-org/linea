import {
  Body,
  Controller,
  Get,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { RequireRole } from '../auth/require-role.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  updateModelSettingsSchema,
  type UpdateModelSettingsDto,
} from './dto/update-model-settings.dto'
import { ModelSettingsService } from './model-settings.service'

@Controller('model-settings')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
export class ModelSettingsController {
  constructor(private readonly settings: ModelSettingsService) {}

  @Get()
  @RequireRole('member')
  get(
    @CurrentWorkspaceId() workspaceId: string,
    @Query('applicationId', new ParseUUIDPipe({ optional: true }))
    applicationId?: string,
  ) {
    return this.settings.get(workspaceId, applicationId)
  }

  @Put()
  @RequireRole('admin')
  update(
    @CurrentWorkspaceId() workspaceId: string,
    @Body(new ZodValidationPipe(updateModelSettingsSchema))
    body: UpdateModelSettingsDto,
  ) {
    return this.settings.update(workspaceId, body)
  }
}
