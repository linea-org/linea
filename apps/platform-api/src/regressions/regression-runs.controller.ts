import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { queuedRegressionRunSchema } from '@linea/protocol/resources'
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
import {
  regressionRunDetailProjection,
  regressionRunProjection,
} from './regression.projections'
import { RegressionRunsService } from './regression-runs.service'

@Controller()
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class RegressionRunsController {
  constructor(private readonly regressionRuns: RegressionRunsService) {}

  @Get('workflows/:workflowId/regression-runs')
  async list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Query(new ZodValidationPipe(listRegressionRunsSchema))
    query: ListRegressionRunsDto,
  ) {
    const runs = await this.regressionRuns.list(workspaceId, workflowId, query)
    return runs.map(regressionRunProjection)
  }

  @Post('workflows/:workflowId/regression-runs')
  async trigger(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(triggerRegressionRunSchema))
    body: TriggerRegressionRunDto,
  ) {
    return queuedRegressionRunSchema.parse(
      await this.regressionRuns.trigger(workspaceId, workflowId, body),
    )
  }

  @Get('workflows/:workflowId/regression-runs/:id')
  async get(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Param('id') id: string,
  ) {
    return regressionRunDetailProjection(
      await this.regressionRuns.get(workspaceId, workflowId, id),
    )
  }
}
