import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { db, repositories } from '@linea/db'
import { publicErrorStatuses } from '@linea/protocol/errors'
import { WorkflowQueueService } from '../queue/workflow-queue.service'
import type { ApplicationPrincipal } from '../auth/application-key.guard'
import { publicError } from '../auth/public-error'
import type { StartApplicationExecutionDto } from './dto/start-application-execution.dto'

@Injectable()
export class ApplicationRuntimeService {
  constructor(private readonly queue: WorkflowQueueService) {}

  async start(
    principal: ApplicationPrincipal,
    input: StartApplicationExecutionDto,
  ) {
    const result =
      await repositories.applicationWorkflowBinding.startApplicationWorkflow(
        db,
        principal.workspaceId,
        principal.applicationId,
        input.workflowId,
        'backend',
        input.triggerPayload,
      )
    if (result.outcome !== 'created') {
      const messages = {
        workflow_binding_not_found: 'Workflow binding not found',
        workflow_binding_disabled: 'Workflow binding is disabled',
        workflow_start_not_allowed: 'Workflow start is not allowed',
        workflow_binding_incompatible:
          'Workflow binding has no compatible published implementation',
        validation_failed: 'Workflow input failed Contract validation',
      } as const
      throw new HttpException(
        publicError(result.outcome, messages[result.outcome]),
        publicErrorStatuses[result.outcome],
      )
    }
    try {
      await this.queue.enqueue(result.execution.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await repositories.execution.failQueuedExecution(
        db,
        result.execution.id,
        {
          message,
        },
      )
      throw new ServiceUnavailableException(
        publicError(
          'service_unavailable',
          'Execution dispatch is temporarily unavailable',
        ),
      )
    }
    return { execution: result.execution }
  }
}
