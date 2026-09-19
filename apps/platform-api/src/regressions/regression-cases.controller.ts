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
import { regressionCaseProjection } from './regression.projections'
import { RegressionCasesService } from './regression-cases.service'

@Controller()
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class RegressionCasesController {
  constructor(private readonly regressionCases: RegressionCasesService) {}

  @Get('workflows/:workflowId/regression-cases')
  async list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Query(new ZodValidationPipe(listRegressionCasesSchema))
    query: ListRegressionCasesDto,
  ) {
    const cases = await this.regressionCases.list(
      workspaceId,
      workflowId,
      query,
    )
    return cases.map(regressionCaseProjection)
  }

  @Post('workflows/:workflowId/regression-cases/from-step')
  async createFromStep(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(createRegressionCaseFromStepSchema))
    body: CreateRegressionCaseFromStepDto,
  ) {
    return regressionCaseProjection(
      await this.regressionCases.createFromStep(workspaceId, workflowId, body),
    )
  }

  @Post('workflows/:workflowId/regression-cases/from-flag')
  async createFromFlag(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(createRegressionCaseFromFlagSchema))
    body: CreateRegressionCaseFromFlagDto,
  ) {
    return regressionCaseProjection(
      await this.regressionCases.createFromFlag(workspaceId, workflowId, body),
    )
  }

  @Post('workflows/:workflowId/regression-cases/:id/archive')
  async archive(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Param('id') id: string,
  ) {
    return regressionCaseProjection(
      await this.regressionCases.archive(workspaceId, workflowId, id),
    )
  }
}
