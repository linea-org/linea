import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories, type ApplicationWorkflowBinding } from '@linea/db'
import type { PutWorkflowBindingDto } from './dto/put-workflow-binding.dto'

@Injectable()
export class ApplicationWorkflowBindingsService {
  async put(
    workspaceId: string,
    applicationId: string,
    workflowId: string,
    input: PutWorkflowBindingDto,
  ): Promise<ApplicationWorkflowBinding> {
    const result =
      await repositories.applicationWorkflowBinding.putApplicationWorkflowBinding(
        db,
        workspaceId,
        applicationId,
        workflowId,
        input,
      )
    if (result.outcome === 'application_not_found') {
      throw new NotFoundException('Application not found')
    }
    if (result.outcome === 'workflow_not_found') {
      throw new NotFoundException('Workflow not found')
    }
    if (result.outcome === 'contract_revision_not_found') {
      throw new NotFoundException('Workflow Contract not found')
    }
    return result.binding
  }

  async list(
    workspaceId: string,
    applicationId: string,
  ): Promise<ApplicationWorkflowBinding[]> {
    const application = await repositories.application.getApplicationById(
      db,
      workspaceId,
      applicationId,
    )
    if (!application) throw new NotFoundException('Application not found')
    return repositories.applicationWorkflowBinding.listApplicationWorkflowBindings(
      db,
      workspaceId,
      applicationId,
    )
  }
}
