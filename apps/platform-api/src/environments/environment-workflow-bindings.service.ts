import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories, type EnvironmentWorkflowBinding } from '@linea/db'
import type { PutWorkflowBindingDto } from './dto/put-workflow-binding.dto'

@Injectable()
export class EnvironmentWorkflowBindingsService {
  async put(
    workspaceId: string,
    environmentId: string,
    workflowId: string,
    input: PutWorkflowBindingDto,
  ): Promise<EnvironmentWorkflowBinding> {
    const result =
      await repositories.environmentWorkflowBinding.putEnvironmentWorkflowBinding(
        db,
        workspaceId,
        environmentId,
        workflowId,
        input,
      )
    if (result.outcome === 'environment_not_found') {
      throw new NotFoundException('Environment not found')
    }
    if (result.outcome === 'workflow_not_found') {
      throw new NotFoundException('Workflow not found')
    }
    if (result.outcome === 'contract_revision_not_found') {
      throw new NotFoundException('Workflow Contract not found')
    }
    if (result.outcome === 'version_not_found')
      throw new NotFoundException(
        'Published Workflow version not found for this contract',
      )
    return result.binding
  }

  async list(
    workspaceId: string,
    environmentId: string,
  ): Promise<EnvironmentWorkflowBinding[]> {
    const environment = await repositories.environment.getEnvironmentById(
      db,
      workspaceId,
      environmentId,
    )
    if (!environment) throw new NotFoundException('Environment not found')
    return repositories.environmentWorkflowBinding.listEnvironmentWorkflowBindings(
      db,
      workspaceId,
      environmentId,
    )
  }
}
