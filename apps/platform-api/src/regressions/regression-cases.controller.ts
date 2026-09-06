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
  createRegressionCaseFromFlagSchema,
  type CreateRegressionCaseFromFlagDto,
} from './dto/create-regression-case-from-flag.dto'
import {
  createRegressionCaseFromStepSchema,
  type CreateRegressionCaseFromStepDto,
} from './dto/create-regression-case-from-step.dto'
import {
  listRegressionCasesSchema,
  type ListRegressionCasesDto,
} from './dto/list-regression-cases.dto'
import { RegressionCasesService } from './regression-cases.service'

@Controller()
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class RegressionCasesController {
  constructor(private readonly regressionCases: RegressionCasesService) {}

  @Get('workflows/:workflowId/regression-cases')
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Query(new ZodValidationPipe(listRegressionCasesSchema))
    query: ListRegressionCasesDto,
  ) {
    return this.regressionCases.list(workspaceId, workflowId, query)
  }

  @Post('workflows/:workflowId/regression-cases/from-step')
  createFromStep(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(createRegressionCaseFromStepSchema))
    body: CreateRegressionCaseFromStepDto,
  ) {
    return this.regressionCases.createFromStep(workspaceId, workflowId, body)
  }

  @Post('workflows/:workflowId/regression-cases/from-flag')
  createFromFlag(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(createRegressionCaseFromFlagSchema))
    body: CreateRegressionCaseFromFlagDto,
  ) {
    return this.regressionCases.createFromFlag(workspaceId, workflowId, body)
  }

  @Post('workflows/:workflowId/regression-cases/:id/archive')
  archive(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Param('id') id: string,
  ) {
    return this.regressionCases.archive(workspaceId, workflowId, id)
  }
}
