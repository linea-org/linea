import {
  BadRequestException,
  Injectable,
  NotFoundException,
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
    await this.queue.enqueue(execution.id)
    return execution
  }
}
