import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories, type EvalCase } from '@linea/db'
import type { CreateEvalCaseFromFlagDto } from './dto/create-eval-case-from-flag.dto'
import type { CreateEvalCaseFromStepDto } from './dto/create-eval-case-from-step.dto'
import type { ListEvalCasesDto } from './dto/list-eval-cases.dto'

@Injectable()
export class EvalCasesService {
  list(
    workspaceId: string,
    workflowId: string,
    query: ListEvalCasesDto,
  ): Promise<EvalCase[]> {
    return repositories.evalCase.listEvalCases(db, workspaceId, workflowId, {
      includeArchived: query.includeArchived,
    })
  }

  async createFromStep(
    workspaceId: string,
    workflowId: string,
    body: CreateEvalCaseFromStepDto,
  ): Promise<EvalCase> {
    // getExecutionStepById/createEvalCaseFromStep aren't workspace-scoped by param (they derive
    // workspaceId from the step/execution row itself) — verified here, before creating anything,
    // so a stepId from another workspace 404s instead of writing a real row into it.
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

    const evalCase = await repositories.evalCase.createEvalCaseFromStep(db, {
      stepId: body.stepId,
    })
    if (!evalCase) {
      throw new NotFoundException('Execution step not found')
    }
    return evalCase
  }

  async createFromFlag(
    workspaceId: string,
    workflowId: string,
    body: CreateEvalCaseFromFlagDto,
  ): Promise<EvalCase> {
    // getFlagById is workspace-scoped but not workflow-scoped — a flag from a different workflow
    // in the same workspace would otherwise create a real row filed under that other workflow
    // before this checked anything. Verified before creating, same reasoning as createFromStep.
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

    const evalCase = await repositories.evalCase.createEvalCaseFromFlag(db, {
      workspaceId,
      flagId: body.flagId,
    })
    if (!evalCase) {
      throw new NotFoundException(
        'Flag not found, or has no conversation to build a case from',
      )
    }
    return evalCase
  }

  async archive(
    workspaceId: string,
    workflowId: string,
    id: string,
  ): Promise<EvalCase> {
    const existing = await repositories.evalCase.getEvalCaseById(db, id)
    if (
      !existing ||
      existing.workspaceId !== workspaceId ||
      existing.workflowId !== workflowId
    ) {
      throw new NotFoundException('Eval case not found')
    }
    const evalCase = await repositories.evalCase.archiveEvalCase(
      db,
      workspaceId,
      id,
    )
    if (!evalCase) {
      throw new NotFoundException('Eval case not found')
    }
    return evalCase
  }
}
