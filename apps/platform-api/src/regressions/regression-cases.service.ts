import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories, type RegressionCase } from '@linea/db'
import type { CreateRegressionCaseFromFlagDto } from './dto/create-regression-case-from-flag.dto'
import type { CreateRegressionCaseFromStepDto } from './dto/create-regression-case-from-step.dto'
import type { ListRegressionCasesDto } from './dto/list-regression-cases.dto'

@Injectable()
export class RegressionCasesService {
  list(
    workspaceId: string,
    workflowId: string,
    query: ListRegressionCasesDto,
  ): Promise<RegressionCase[]> {
    return repositories.regressionCase.listRegressionCases(
      db,
      workspaceId,
      workflowId,
      {
        includeArchived: query.includeArchived,
      },
    )
  }

  async createFromStep(
    workspaceId: string,
    workflowId: string,
    body: CreateRegressionCaseFromStepDto,
  ): Promise<RegressionCase> {
    // Validate ownership before the repository copies step data into a new row.
    const step = await repositories.executionStep.getExecutionStepById(
      db,
      body.stepId,
    )
    const execution = step
      ? await repositories.execution.getExecutionById(db, step.executionId)
      : undefined
    if (
      !step ||
      !execution ||
      execution.workspaceId !== workspaceId ||
      execution.workflowId !== workflowId
    ) {
      throw new NotFoundException('Execution step not found')
    }

    const regressionCase =
      await repositories.regressionCase.createRegressionCaseFromStep(db, {
        workspaceId,
        stepId: body.stepId,
      })
    if (!regressionCase) {
      throw new NotFoundException('Execution step not found')
    }
    return regressionCase
  }

  async createFromFlag(
    workspaceId: string,
    workflowId: string,
    body: CreateRegressionCaseFromFlagDto,
  ): Promise<RegressionCase> {
    // Workspace scoping alone cannot stop a flag from another workflow being filed here.
    const flag = await repositories.flag.getFlagById(
      db,
      workspaceId,
      body.flagId,
    )
    if (!flag || flag.workflowId !== workflowId) {
      throw new NotFoundException(
        'Flag not found, or has no conversation to build a case from',
      )
    }

    const regressionCase =
      await repositories.regressionCase.createRegressionCaseFromFlag(db, {
        workspaceId,
        flagId: body.flagId,
      })
    if (!regressionCase) {
      throw new NotFoundException(
        'Flag not found, or has no conversation to build a case from',
      )
    }
    return regressionCase
  }

  async archive(
    workspaceId: string,
    workflowId: string,
    id: string,
  ): Promise<RegressionCase> {
    const existing = await repositories.regressionCase.getRegressionCaseById(
      db,
      workspaceId,
      id,
    )
    if (
      !existing ||
      existing.workspaceId !== workspaceId ||
      existing.workflowId !== workflowId
    ) {
      throw new NotFoundException('Regression case not found')
    }
    const regressionCase =
      await repositories.regressionCase.archiveRegressionCase(
        db,
        workspaceId,
        id,
      )
    if (!regressionCase) {
      throw new NotFoundException('Regression case not found')
    }
    return regressionCase
  }
}
