import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { listSignalsSchema, type ListSignalsDto } from './dto/list-signals.dto'
import {
  signalsTrendSchema,
  type SignalsTrendDto,
} from './dto/signals-trend.dto'
import { SignalsService } from './signals.service'

@Controller('signals')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class SignalsController {
  constructor(private readonly signals: SignalsService) {}

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(listSignalsSchema)) query: ListSignalsDto,
  ) {
    return this.signals.list(workspaceId, query)
  }

  // Must come before ':id' — otherwise Nest would match "trend" as an :id param.
  @Get('trend')
  trend(
    @CurrentWorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(signalsTrendSchema)) query: SignalsTrendDto,
  ) {
    return this.signals.trend(workspaceId, query)
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
