import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { db, repositories, type Execution, type ExecutionStep } from '@linea/db'
import { WorkflowQueueService } from '../queue/workflow-queue.service'
import type { TriggerExecutionDto } from './dto/trigger-execution.dto'

@Injectable()
export class ExecutionsService {
  constructor(private readonly queue: WorkflowQueueService) {}

  async trigger(
    workspaceId: string,
    workflowId: string,
    input: TriggerExecutionDto,
  ): Promise<Execution> {
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      workspaceId,
      workflowId,
    )
    if (!workflow) {
      throw new NotFoundException('Workflow not found')
    }
    if (!workflow.publishedVersionId) {
      throw new BadRequestException('Workflow has no published version')
    }

    const execution = await repositories.execution.createExecution(db, {
      workspaceId,
      workflowId,
      workflowVersionId: workflow.publishedVersionId,
      trigger: 'manual',
      triggerPayload: input.triggerPayload,
    })
    await this.queue.enqueue(execution.id)
    return execution
  }

  async list(workspaceId: string, workflowId: string): Promise<Execution[]> {
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      workspaceId,
      workflowId,
    )
    if (!workflow) {
      throw new NotFoundException('Workflow not found')
    }
    return repositories.execution.listExecutions(db, workflowId)
  }

  async get(
    workspaceId: string,
    id: string,
  ): Promise<{ execution: Execution; steps: ExecutionStep[] }> {
    const result = await repositories.execution.getExecutionWithSteps(db, id)
    if (!result || result.execution.workspaceId !== workspaceId) {
      throw new NotFoundException('Execution not found')
    }
    return result
  }
}
