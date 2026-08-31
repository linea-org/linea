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
  listEvalRunsSchema,
  type ListEvalRunsDto,
} from './dto/list-eval-runs.dto'
import {
  triggerEvalRunSchema,
  type TriggerEvalRunDto,
} from './dto/trigger-eval-run.dto'
import { EvalRunsService } from './eval-runs.service'

@Controller()
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class EvalRunsController {
  constructor(private readonly evalRuns: EvalRunsService) {}

  @Get('workflows/:workflowId/eval-runs')
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Query(new ZodValidationPipe(listEvalRunsSchema)) query: ListEvalRunsDto,
  ) {
    return this.evalRuns.list(workspaceId, workflowId, query)
  }

  @Post('workflows/:workflowId/eval-runs')
  trigger(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(triggerEvalRunSchema)) body: TriggerEvalRunDto,
  ) {
    return this.evalRuns.trigger(workspaceId, workflowId, body)
  }

  @Get('workflows/:workflowId/eval-runs/:id')
  get(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Param('id') id: string,
  ) {
    return this.evalRuns.get(workspaceId, workflowId, id)
  }
}
