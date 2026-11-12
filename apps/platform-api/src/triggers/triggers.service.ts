import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { db, repositories, type Execution } from '@linea/db'

@Injectable()
export class TriggersService {
  async trigger(
    workspaceId: string,
    environmentId: string,
    slug: string,
    payload: Record<string, unknown> | undefined,
    triggeredByUserId?: string,
  ): Promise<Execution> {
    const environment = await repositories.environment.getEnvironmentById(
      db,
      workspaceId,
      environmentId,
    )
    if (!environment) throw new NotFoundException('Environment not found')
    const result = await repositories.execution.triggerWorkflowExecution(
      db,
      workspaceId,
      { by: 'slug', value: slug, applicationId: environment.applicationId },
      {
        trigger: 'webhook',
        triggerPayload: payload,
        environmentId,
        triggeredByUserId,
      },
    )
    switch (result.outcome) {
      case 'production_start_forbidden':
        throw new ForbiddenException(
          'Production management starts require a signed-in workspace admin; backend callers must use an Environment Key',
        )
      case 'workflow_start_not_allowed':
        throw new ForbiddenException(
          'Enable backend starts on the Environment Workflow Binding before running this Workflow',
        )
      case 'validation_failed':
        throw new BadRequestException(result.message)
      case 'not_found':
        throw new NotFoundException('Workflow not found')
      case 'archived':
        throw new BadRequestException('Workflow is archived')
      case 'unpublished':
        throw new BadRequestException('Workflow has no published version')
    }
    return result.execution
  }
}
