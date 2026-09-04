import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { db, repositories, type EvalResult, type EvalRun } from '@linea/db'
import { EvalRunQueueService } from '../queue/eval-run-queue.service'
import type { ListEvalRunsDto } from './dto/list-eval-runs.dto'
import type { TriggerEvalRunDto } from './dto/trigger-eval-run.dto'

@Injectable()
export class EvalRunsService {
  constructor(private readonly evalRunQueue: EvalRunQueueService) {}

  list(
    workspaceId: string,
    workflowId: string,
    query: ListEvalRunsDto,
  ): Promise<EvalRun[]> {
    return repositories.evalRun.listEvalRuns(db, workspaceId, workflowId, {
      limit: query.limit,
    })
  }

  async get(
    workspaceId: string,
    workflowId: string,
    id: string,
  ): Promise<EvalRun & { results: EvalResult[] }> {
    const run = await repositories.evalRun.getEvalRunById(db, workspaceId, id)
    if (!run || run.workflowId !== workflowId) {
      throw new NotFoundException('Eval run not found')
    }
    const results = await repositories.evalRun.listEvalResults(
      db,
      workspaceId,
      run.id,
    )
    return { ...run, results }
  }

  /** Fire-and-forget, same contract as the publish-triggered path — the actual eval_runs row is
   * created by EvalRunConsumer once it dequeues the job, not synchronously here, so this returns
   * before there's anything to look up yet. */
  async trigger(
    workspaceId: string,
    workflowId: string,
    body: TriggerEvalRunDto,
  ): Promise<{ queued: true }> {
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      workspaceId,
      workflowId,
    )
    if (!workflow) {
      throw new NotFoundException('Workflow not found')
    }
    const workflowVersionId =
      body.workflowVersionId ?? workflow.publishedVersionId
    if (!workflowVersionId) {
      throw new BadRequestException(
        'Publish a version before running evals against it',
      )
    }
    // An explicit override must actually belong to this workflow — otherwise the job enqueues
    // anyway, the worker fails at the version lookup or the composite FK, retries the invalid
    // job, and never creates the run the caller asked for. Not needed for the publishedVersionId
    // fallback above, which is already trusted (read from this same workflow's own row).
    if (body.workflowVersionId) {
      const version = await repositories.workflow.getWorkflowVersionById(
        db,
        body.workflowVersionId,
      )
      if (!version || version.workflowId !== workflowId) {
        throw new NotFoundException('Workflow version not found')
      }
    }

    await this.evalRunQueue.enqueue({
      workspaceId,
      workflowId,
      workflowVersionId,
      trigger: 'manual',
    })
    return { queued: true }
  }
}
