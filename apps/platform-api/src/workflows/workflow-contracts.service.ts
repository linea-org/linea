import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories, type WorkflowContractRevision } from '@linea/db'
import type { CreateWorkflowContractDto } from './dto/create-workflow-contract.dto'

@Injectable()
export class WorkflowContractsService {
  async create(
    workspaceId: string,
    workflowId: string,
    input: CreateWorkflowContractDto,
  ): Promise<WorkflowContractRevision> {
    const result =
      await repositories.workflowContract.createWorkflowContractRevision(
        db,
        workspaceId,
        workflowId,
        input,
      )
    if (result.outcome === 'not_found') {
      throw new NotFoundException('Workflow not found')
    }
    return result.revision
  }

  async list(
    workspaceId: string,
    workflowId: string,
  ): Promise<WorkflowContractRevision[]> {
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      workspaceId,
      workflowId,
    )
    if (!workflow) throw new NotFoundException('Workflow not found')
    return repositories.workflowContract.listWorkflowContractRevisions(
      db,
      workspaceId,
      workflowId,
    )
  }

  async get(
    workspaceId: string,
    workflowId: string,
    id: string,
  ): Promise<WorkflowContractRevision> {
    const revision =
      await repositories.workflowContract.getWorkflowContractRevision(
        db,
        workspaceId,
        workflowId,
        id,
      )
    if (!revision) throw new NotFoundException('Workflow Contract not found')
    return revision
  }
}
