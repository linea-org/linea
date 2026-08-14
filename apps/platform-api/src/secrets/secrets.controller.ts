import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { RequireRole } from '../auth/require-role.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  secretKeySchema,
  upsertSecretSchema,
  type UpsertSecretDto,
} from './dto/upsert-secret.dto'
import { SecretsService } from './secrets.service'

// Secrets are workspace-wide credentials (e.g. an AI provider key used by every workflow) — admin+ only, same tier as API keys.
@Controller('secrets')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class SecretsController {
  constructor(private readonly secrets: SecretsService) {}

  @Get()
  list(@CurrentWorkspaceId() workspaceId: string) {
    return this.secrets.list(workspaceId)
  }

  @Get('providers')
  listAiProviders(@CurrentWorkspaceId() workspaceId: string) {
    return this.secrets.listAiProviders(workspaceId)
  }

  @Put(':key')
  upsert(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('key', new ZodValidationPipe(secretKeySchema)) key: string,
    @Body(new ZodValidationPipe(upsertSecretSchema)) body: UpsertSecretDto,
  ) {
    return this.secrets.upsert(workspaceId, key, body)
  }

  @Delete(':key')
  delete(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('key', new ZodValidationPipe(secretKeySchema)) key: string,
  ) {
    return this.secrets.delete(workspaceId, key)
  }
}
