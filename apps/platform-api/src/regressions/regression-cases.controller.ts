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
import { OptionalUserId } from '../auth/optional-user-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { RequireWorkspaceKeyScopes } from '../auth/require-workspace-key-scopes.decorator'
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
  @RequireWorkspaceKeyScopes('regressions:read')
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
  @RequireWorkspaceKeyScopes('regressions:write')
  async createFromStep(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(createRegressionCaseFromStepSchema))
    body: CreateRegressionCaseFromStepDto,
  ) {
    return regressionCaseProjection(
      await this.regressionCases.createFromStep(
        workspaceId,
        workflowId,
        body,
        userId,
      ),
    )
  }

  @Post('workflows/:workflowId/regression-cases/from-flag')
  @RequireWorkspaceKeyScopes('regressions:write')
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
  @RequireWorkspaceKeyScopes('regressions:write')
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
