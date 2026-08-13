import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  db,
  repositories,
  type Workflow,
  type WorkflowVersion,
} from '@linea/db'
import {
  assertNoReservedNodeIds,
  hashWorkflowGraph,
  validateGraphStructure,
  WorkflowGraphError,
} from '@linea/runtime'
import type { CreateWorkflowDto } from './dto/create-workflow.dto'
import type { CreateWorkflowVersionDto } from './dto/create-workflow-version.dto'
import type { SaveWorkflowDraftDto } from './dto/save-workflow-draft.dto'
import type { UpdateWorkflowDto } from './dto/update-workflow.dto'

@Injectable()
export class WorkflowsService {
  async create(
    workspaceId: string,
    input: CreateWorkflowDto,
  ): Promise<Workflow> {
    return repositories.workflow.createWorkflow(db, {
      workspaceId,
      name: input.name,
      slug: input.slug,
      description: input.description,
    })
  }

  async list(workspaceId: string): Promise<Workflow[]> {
    return repositories.workflow.listWorkflows(db, workspaceId)
  }

  async get(workspaceId: string, id: string): Promise<Workflow> {
    const workflow = await repositories.workflow.getWorkflowById(
      db,
      workspaceId,
      id,
    )
    if (!workflow) {
      throw new NotFoundException('Workflow not found')
    }
    return workflow
  }

  async update(
    workspaceId: string,
    id: string,
    input: UpdateWorkflowDto,
  ): Promise<Workflow> {
    const workflow = await repositories.workflow.updateWorkflow(
      db,
      workspaceId,
      id,
      {
        name: input.name,
        slug: input.slug,
        description: input.description,
        archivedAt:
          input.archived === undefined
            ? undefined
            : input.archived
              ? new Date()
              : null,
      },
    )
    if (!workflow) {
      throw new NotFoundException('Workflow not found')
    }
    return workflow
  }

  async saveDraft(
    workspaceId: string,
    id: string,
    input: SaveWorkflowDraftDto,
  ): Promise<Workflow> {
    const workflow = await repositories.workflow.saveWorkflowDraft(
      db,
      workspaceId,
      id,
      input.graph,
    )
    if (!workflow) {
      throw new NotFoundException('Workflow not found')
    }
    return workflow
  }

  async createVersion(
    workspaceId: string,
    workflowId: string,
    input: CreateWorkflowVersionDto,
  ): Promise<WorkflowVersion> {
    // Confirms the workflow belongs to this workspace before touching its versions.
    await this.get(workspaceId, workflowId)

    try {
      validateGraphStructure(input.graph)
      assertNoReservedNodeIds(input.graph)
    } catch (error) {
      if (error instanceof WorkflowGraphError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }

    return repositories.workflow.createWorkflowVersion(db, {
      workflowId,
      graph: input.graph,
      contentHash: hashWorkflowGraph(input.graph),
      message: input.message,
    })
  }

  async getVersion(
    workspaceId: string,
    workflowId: string,
    versionId: string,
  ): Promise<WorkflowVersion> {
    await this.get(workspaceId, workflowId)

    const version = await repositories.workflow.getWorkflowVersionById(
      db,
      versionId,
    )
    if (!version || version.workflowId !== workflowId) {
      throw new NotFoundException('Workflow version not found')
    }
    return version
  }

  async publishVersion(
    workspaceId: string,
    workflowId: string,
    versionId: string,
  ): Promise<Workflow> {
    await this.get(workspaceId, workflowId)

    const version = await repositories.workflow.getWorkflowVersionById(
      db,
      versionId,
    )
    if (!version || version.workflowId !== workflowId) {
      throw new NotFoundException('Workflow version not found')
    }

    return repositories.workflow.publishWorkflowVersion(
      db,
      workflowId,
      versionId,
    )
  }
}
