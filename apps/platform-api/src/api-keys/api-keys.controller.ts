import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import {
  RequireActiveOrg,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth'
import type { auth } from '@linea/auth'
import { RequireRole } from '../auth/require-role.decorator'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { ApiKeysService } from './api-keys.service'
import {
  createApiKeySchema,
  type CreateApiKeyDto,
} from './dto/create-api-key.dto'

// Managing keys requires a real session, not another API key — otherwise a leaked key could mint further keys for itself. @RequireActiveOrg() guarantees session.session.activeOrganizationId is set below.
@Controller('api-keys')
@RequireActiveOrg()
@UseGuards(WorkspaceRoleGuard)
@RequireRole('admin')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  private workspaceId(session: UserSession<typeof auth>): string {
    return session.session.activeOrganizationId as string
  }

  @Post()
  create(
    @Session() session: UserSession<typeof auth>,
    @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(this.workspaceId(session), body)
  }

  @Get()
  list(@Session() session: UserSession<typeof auth>) {
    return this.apiKeys.list(this.workspaceId(session))
  }

  @Delete(':id')
  revoke(
    @Session() session: UserSession<typeof auth>,
    @Param('id') id: string,
  ) {
    return this.apiKeys.revoke(this.workspaceId(session), id)
  }
}
