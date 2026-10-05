import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { ExternalSubjectsService } from './external-subjects.service'

@Controller('external-subjects')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard, RecentAuthenticationGuard)
@RequireRole('admin')
export class ExternalSubjectsController {
  constructor(private readonly externalSubjects: ExternalSubjectsService) {}

  @Post(':id/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  disable(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.externalSubjects.disable(workspaceId, id, actorUserId)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  erase(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUserId() actorUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.externalSubjects.erase(workspaceId, id, actorUserId)
  }
}
