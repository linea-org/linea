import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  listRegressionRunsSchema,
  type ListRegressionRunsDto,
} from './dto/list-regression-runs.dto'
import {
  triggerRegressionRunSchema,
  type TriggerRegressionRunDto,
} from './dto/trigger-regression-run.dto'
import { RegressionRunsService } from './regression-runs.service'

@Controller()
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class RegressionRunsController {
  constructor(private readonly regressionRuns: RegressionRunsService) {}

  @Get('workflows/:workflowId/regression-runs')
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Query(new ZodValidationPipe(listRegressionRunsSchema))
    query: ListRegressionRunsDto,
  ) {
    return this.regressionRuns.list(workspaceId, workflowId, query)
  }

  @Post('workflows/:workflowId/regression-runs')
  trigger(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(triggerRegressionRunSchema))
    body: TriggerRegressionRunDto,
  ) {
    return this.regressionRuns.trigger(workspaceId, workflowId, body)
  }

  @Get('workflows/:workflowId/regression-runs/:id')
  get(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Param('id') id: string,
  ) {
    return this.regressionRuns.get(workspaceId, workflowId, id)
  }
}
