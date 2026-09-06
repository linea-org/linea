import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  db,
  repositories,
  type RegressionResult,
  type RegressionRun,
} from '@linea/db'
import { RegressionRunQueueService } from '../queue/regression-run-queue.service'
import type { ListRegressionRunsDto } from './dto/list-regression-runs.dto'
import type { TriggerRegressionRunDto } from './dto/trigger-regression-run.dto'

@Injectable()
export class RegressionRunsService {
  constructor(private readonly regressionRunQueue: RegressionRunQueueService) {}

  list(
    workspaceId: string,
    workflowId: string,
    query: ListRegressionRunsDto,
  ): Promise<RegressionRun[]> {
    return repositories.regressionRun.listRegressionRuns(
      db,
      workspaceId,
      workflowId,
      {
        limit: query.limit,
      },
    )
  }

  async get(
    workspaceId: string,
    workflowId: string,
    id: string,
  ): Promise<RegressionRun & { results: RegressionResult[] }> {
    const run = await repositories.regressionRun.getRegressionRunById(
      db,
      workspaceId,
      id,
    )
    if (!run || run.workflowId !== workflowId) {
      throw new NotFoundException('Regression run not found')
    }
    const results = await repositories.regressionRun.listRegressionResults(
      db,
      workspaceId,
      run.id,
    )
    return { ...run, results }
  }

  /** Returns before the worker creates the Regression Run. */
  async trigger(
    workspaceId: string,
    workflowId: string,
    body: TriggerRegressionRunDto,
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
        'Publish a version before running a regression suite against it',
      )
    }
    // Reject a foreign version before an invalid job enters the retry queue.
    if (body.workflowVersionId) {
      const version = await repositories.workflow.getWorkflowVersionById(
        db,
        body.workflowVersionId,
      )
      if (!version || version.workflowId !== workflowId) {
        throw new NotFoundException('Workflow version not found')
      }
    }

    await this.regressionRunQueue.enqueue({
      workspaceId,
      workflowId,
      workflowVersionId,
      trigger: 'manual',
    })
    return { queued: true }
  }
}
