import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { SignalsService } from './signals.service'

@Controller('signals')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class SignalsController {
  constructor(private readonly signals: SignalsService) {}

  @Get()
  list(@CurrentWorkspaceId() workspaceId: string) {
    return this.signals.list(workspaceId)
  }

  @Get(':id')
  get(@CurrentWorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.signals.get(workspaceId, id)
  }

  @Post(':id/resolve')
  resolve(@CurrentWorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.signals.resolve(workspaceId, id)
  }
}
