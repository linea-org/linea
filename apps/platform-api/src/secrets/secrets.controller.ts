import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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

@Controller('environments/:environmentId/secrets')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class SecretsController {
  constructor(private readonly secrets: SecretsService) {}

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
  ) {
    return this.secrets.list(workspaceId, environmentId)
  }

  @Get('providers')
  listAiProviders(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
  ) {
    return this.secrets.listAiProviders(workspaceId, environmentId)
  }

  @Put(':key')
  upsert(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('key', new ZodValidationPipe(secretKeySchema)) key: string,
    @Body(new ZodValidationPipe(upsertSecretSchema)) body: UpsertSecretDto,
  ) {
    return this.secrets.upsert(workspaceId, environmentId, key, body)
  }

  @Delete(':key')
  delete(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('key', new ZodValidationPipe(secretKeySchema)) key: string,
  ) {
    return this.secrets.delete(workspaceId, environmentId, key)
  }
}
