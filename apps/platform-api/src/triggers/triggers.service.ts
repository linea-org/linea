import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { db, repositories, type Execution } from '@linea/db'

@Injectable()
export class TriggersService {
  async trigger(
    workspaceId: string,
    slug: string,
    payload: Record<string, unknown> | undefined,
  ): Promise<Execution> {
    const result = await repositories.execution.triggerWorkflowExecution(
      db,
      workspaceId,
      { by: 'slug', value: slug },
      { trigger: 'webhook', triggerPayload: payload },
    )
    switch (result.outcome) {
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
