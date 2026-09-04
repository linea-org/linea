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
  createEvalCaseFromFlagSchema,
  type CreateEvalCaseFromFlagDto,
} from './dto/create-eval-case-from-flag.dto'
import {
  createEvalCaseFromStepSchema,
  type CreateEvalCaseFromStepDto,
} from './dto/create-eval-case-from-step.dto'
import {
  listEvalCasesSchema,
  type ListEvalCasesDto,
} from './dto/list-eval-cases.dto'
import { EvalCasesService } from './eval-cases.service'

@Controller()
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class EvalCasesController {
  constructor(private readonly evalCases: EvalCasesService) {}

  @Get('workflows/:workflowId/eval-cases')
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Query(new ZodValidationPipe(listEvalCasesSchema)) query: ListEvalCasesDto,
  ) {
    return this.evalCases.list(workspaceId, workflowId, query)
  }

  @Post('workflows/:workflowId/eval-cases/from-step')
  createFromStep(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(createEvalCaseFromStepSchema))
    body: CreateEvalCaseFromStepDto,
  ) {
    return this.evalCases.createFromStep(workspaceId, workflowId, body)
  }

  @Post('workflows/:workflowId/eval-cases/from-flag')
  createFromFlag(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(createEvalCaseFromFlagSchema))
    body: CreateEvalCaseFromFlagDto,
  ) {
    return this.evalCases.createFromFlag(workspaceId, workflowId, body)
  }

  @Post('workflows/:workflowId/eval-cases/:id/archive')
  archive(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Param('id') id: string,
  ) {
    return this.evalCases.archive(workspaceId, workflowId, id)
  }
}
