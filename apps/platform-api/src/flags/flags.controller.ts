import { Controller, Get, UseGuards } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { evaluateFlags } from '@linealabs/flags'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'

@Controller('flags')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class FlagsController {
  @Get()
  list(@CurrentWorkspaceId() workspaceId: string) {
    return evaluateFlags(workspaceId)
  }
}
