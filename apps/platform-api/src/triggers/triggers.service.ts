import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { db, repositories, type Execution } from '@linea/db'
import { WorkflowQueueService } from '../queue/workflow-queue.service'

@Injectable()
export class TriggersService {
  constructor(private readonly queue: WorkflowQueueService) {}

  async trigger(
    workspaceId: string,
    slug: string,
    payload: Record<string, unknown> | undefined,
  ): Promise<Execution> {
    const workflow = await repositories.workflow.getWorkflowBySlug(
      db,
      workspaceId,
      slug,
    )
    if (!workflow) {
      throw new NotFoundException('Workflow not found')
    }
    if (workflow.archivedAt) {
      throw new BadRequestException('Workflow is archived')
    }
    if (!workflow.publishedVersionId) {
      throw new BadRequestException('Workflow has no published version')
    }

    const execution = await repositories.execution.createExecution(db, {
      workspaceId,
      workflowId: workflow.id,
      workflowVersionId: workflow.publishedVersionId,
      trigger: 'webhook',
      triggerPayload: payload,
    })

    try {
      await this.queue.enqueue(execution.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await repositories.execution.failQueuedExecution(db, execution.id, {
        message,
      })
      throw new ServiceUnavailableException(
        'Failed to enqueue execution — it will not run',
      )
    }

    return execution
  }
}
