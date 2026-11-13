import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import {
  db,
  type DbClient,
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
import { z } from 'zod'
import type { UserSession } from '@thallesp/nestjs-better-auth'
import type { auth } from '@linea/auth'
import { RegressionRunQueueService } from '../queue/regression-run-queue.service'
import { RealtimeTokenService } from '../realtime/realtime-token.service'
import { WorkflowsGateway } from '../realtime/workflows.gateway'
import type { CreateWorkflowDto } from './dto/create-workflow.dto'
import type { CreateWorkflowVersionDto } from './dto/create-workflow-version.dto'
import type { SaveWorkflowDraftDto } from './dto/save-workflow-draft.dto'
import type { UpdateWorkflowDto } from './dto/update-workflow.dto'

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly realtimeTokens: RealtimeTokenService,
    private readonly gateway: WorkflowsGateway,
    private readonly regressionRunQueue: RegressionRunQueueService,
  ) {}

  async create(
    workspaceId: string,
    input: CreateWorkflowDto,
  ): Promise<Workflow> {
    const application = await repositories.application.getApplicationById(
      db,
      workspaceId,
      input.applicationId,
    )
    if (!application) throw new NotFoundException('Application not found')
    return db.transaction(async (tx) => {
      const workflow = await repositories.workflow.createWorkflow(tx, {
        applicationId: application.id,
        workspaceId,
        name: input.name,
        slug: input.slug,
        description: input.description,
      })
      const contract =
        await repositories.workflowContract.createWorkflowContractRevision(
          tx,
          workspaceId,
          workflow.id,
          { inputSchema: { type: 'object' }, outputSchema: {} },
        )
      if (contract.outcome !== 'created')
        throw new Error('Workflow contract creation failed')
      return workflow
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
    actorUserId: string | undefined,
  ): Promise<Workflow> {
    return db.transaction(async (tx) => {
      const current = await repositories.workflow.lockWorkflowById(
        tx,
        workspaceId,
        id,
      )
      if (!current) throw new NotFoundException('Workflow not found')
      const changesProductionRouting =
        (input.slug !== undefined && input.slug !== current.slug) ||
        (input.archived !== undefined &&
          input.archived !== (current.archivedAt !== null))
      if (changesProductionRouting)
        await this.assertProductionAdmin(tx, workspaceId, id, actorUserId)
      const workflow = await repositories.workflow.updateWorkflow(
        tx,
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
      if (!workflow) throw new NotFoundException('Workflow not found')
      return workflow
    })
  }

  /** Archive state and slug decide whether Production serves the Workflow and which one a trigger slug starts, so once bound they follow the admin-owned binding. */
  private async assertProductionAdmin(
    tx: DbClient,
    workspaceId: string,
    workflowId: string,
    actorUserId: string | undefined,
  ): Promise<void> {
    const bound =
      await repositories.environmentWorkflowBinding.hasProductionWorkflowBinding(
        tx,
        workspaceId,
        workflowId,
      )
    if (!bound) return
    const role = actorUserId
      ? await repositories.organization.getMemberRole(
          tx,
          workspaceId,
          actorUserId,
        )
      : undefined
    if (role !== 'admin' && role !== 'owner') {
      throw new ForbiddenException(
        'Archiving, restoring, or changing the slug of a Workflow bound to Production requires an admin session',
      )
    }
  }

  /** A Run Agent step may only name an active Agent of the Workflow's own Application and one of its Contract revisions; a draft may still leave them unset. */
  private async assertAgentReferences(
    workflow: Workflow,
    graph: unknown,
    options: { requireAgent: boolean },
  ): Promise<void> {
    const nodes = z
      .object({
        nodes: z.array(
          z.object({
            id: z.string(),
            type: z.string(),
            config: z.record(z.string(), z.unknown()).optional(),
          }),
        ),
      })
      .safeParse(graph)
    if (!nodes.success) return
    await Promise.all(
      nodes.data.nodes
        .filter((node) => node.type === 'agent')
        .map((node) =>
          this.assertAgentStep(workflow, node.id, node.config ?? {}, options),
        ),
    )
  }

  private async assertAgentStep(
    workflow: Workflow,
    nodeId: string,
    config: Record<string, unknown>,
    options: { requireAgent: boolean },
  ): Promise<void> {
    const { agentId, agentContractRevisionId } = config
    const unset = (value: unknown) => value === undefined || value === ''
    if (unset(agentId)) {
      if (options.requireAgent)
        throw new BadRequestException(`Choose an Agent for step ${nodeId}`)
      return
    }
    if (options.requireAgent && unset(agentContractRevisionId))
      throw new BadRequestException(
        `Choose a Contract revision for step ${nodeId}`,
      )
    const ids = z.uuid().safeParse(agentId)
    const revisionId = z.uuid().safeParse(agentContractRevisionId)
    const agent = ids.success
      ? await repositories.agent.getAgentById(
          db,
          workflow.workspaceId,
          ids.data,
        )
      : undefined
    if (!agent || agent.applicationId !== workflow.applicationId)
      throw new BadRequestException(
        `Step ${nodeId} must use an Agent from this Workflow's Application`,
      )
    if (agent.archivedAt)
      throw new BadRequestException(`Step ${nodeId} uses an archived Agent`)
    if (unset(agentContractRevisionId)) return
    const revision = revisionId.success
      ? await repositories.agentContract.getAgentContractRevision(
          db,
          workflow.workspaceId,
          agent.id,
          revisionId.data,
        )
      : undefined
    if (!revision)
      throw new BadRequestException(
        `Step ${nodeId} names a Contract revision the Agent does not have`,
      )
  }

  async saveDraft(
    workspaceId: string,
    id: string,
    input: SaveWorkflowDraftDto,
    savedBy?: { userId: string; name: string },
  ): Promise<Workflow> {
    await this.assertAgentReferences(
      await this.get(workspaceId, id),
      input.graph,
      { requireAgent: false },
    )
    const workflow = await repositories.workflow.saveWorkflowDraft(
      db,
      workspaceId,
      id,
      input.graph,
    )
    if (!workflow) {
      throw new NotFoundException('Workflow not found')
    }
    // savedBy is absent for an API-key-authenticated save (no session user) — nobody realistically has that workflow's builder open with an API key, so skipping the broadcast there is harmless.
    if (savedBy && workflow.draftUpdatedAt) {
      await this.gateway.broadcastDraftUpdate(id, {
        graph: input.graph,
        updatedAt: workflow.draftUpdatedAt.toISOString(),
        savedBy,
      })
    }
    return workflow
  }

  async mintRealtimeToken(
    workspaceId: string,
    id: string,
    session: UserSession<typeof auth> | null,
  ) {
    if (!session?.user || !session.session?.id) {
      throw new UnauthorizedException('A signed-in session is required')
    }
    // Confirms the workflow belongs to this workspace before minting a token for it.
    await this.get(workspaceId, id)
    return this.realtimeTokens.mint({
      sessionId: session.session.id,
      userId: session.user.id,
      name: session.user.name,
      image: session.user.image ?? null,
      workspaceId,
      workflowId: id,
    })
  }

  async createVersion(
    workspaceId: string,
    workflowId: string,
    input: CreateWorkflowVersionDto,
  ): Promise<WorkflowVersion> {
    // Confirms the workflow belongs to this workspace before touching its versions.
    const workflow = await this.get(workspaceId, workflowId)
    await this.assertAgentReferences(workflow, input.graph, {
      requireAgent: true,
    })
    if (input.workflowContractRevisionId) {
      const revision =
        await repositories.workflowContract.getWorkflowContractRevision(
          db,
          workspaceId,
          workflowId,
          input.workflowContractRevisionId,
        )
      if (!revision) {
        throw new NotFoundException('Workflow Contract not found')
      }
    }
    try {
      validateGraphStructure(input.graph)
      assertNoReservedNodeIds(input.graph)
    } catch (error) {
      if (error instanceof WorkflowGraphError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }
    const [defaultContract] =
      await repositories.workflowContract.listWorkflowContractRevisions(
        db,
        workspaceId,
        workflowId,
      )
    const workflowContractRevisionId =
      input.workflowContractRevisionId ?? defaultContract?.id
    if (!workflowContractRevisionId)
      throw new BadRequestException(
        'Create an input/output contract before saving a version',
      )
    return repositories.workflow.createWorkflowVersion(db, {
      workflowId,
      graph: input.graph,
      contentHash: hashWorkflowGraph(input.graph),
      message: input.message,
      workflowContractRevisionId,
    })
  }

  async listVersions(
    workspaceId: string,
    workflowId: string,
  ): Promise<WorkflowVersion[]> {
    await this.get(workspaceId, workflowId)
    return repositories.workflow.listWorkflowVersions(
      db,
      workspaceId,
      workflowId,
    )
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
    const published = await repositories.workflow.publishWorkflowVersion(
      db,
      workflowId,
      versionId,
    )
    // Defensive handling preserves publication even if the queue service breaks its non-rejection contract.
    void this.regressionRunQueue
      .enqueue({
        workspaceId,
        workflowId,
        workflowVersionId: versionId,
        trigger: 'publish',
      })
      .catch(() => {})
    return published
  }
}
