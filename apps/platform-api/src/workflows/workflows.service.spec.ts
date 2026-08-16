import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, schema } from '@linea/db'
import type { WorkflowGraph } from '@linea/runtime'
import { RealtimeTokenService } from '../realtime/realtime-token.service'
import { WorkflowsGateway } from '../realtime/workflows.gateway'
import { WorkflowsService } from './workflows.service'

const providers = [WorkflowsService, RealtimeTokenService, WorkflowsGateway]

afterAll(async () => {
  await pool.end()
})

function validGraph(entryNodeId = 'n1'): WorkflowGraph {
  return {
    version: 1,
    trigger: { type: 'manual' },
    entryNodeId,
    nodes: [{ id: entryNodeId, type: 'transform', config: {} }],
    edges: [],
  }
}

describe('WorkflowsService', () => {
  async function withOrg(fn: (workspaceId: string) => Promise<void>) {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Workflows Service Test Org',
        slug: `workflows-service-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      await fn(organization.id)
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  }

  it('creates, lists, gets, and updates a workflow, all scoped to the workspace', async () => {
    const moduleRef = await Test.createTestingModule({
      providers,
    }).compile()
    const service = moduleRef.get(WorkflowsService)

    await withOrg(async (workspaceId) => {
      const suffix = randomUUID()
      const created = await service.create(workspaceId, {
        name: 'Test Workflow',
        slug: `test-${suffix}`,
      })

      const fetched = await service.get(workspaceId, created.id)
      expect(fetched.id).toBe(created.id)

      const list = await service.list(workspaceId)
      expect(list.map((w) => w.id)).toContain(created.id)

      const updated = await service.update(workspaceId, created.id, {
        name: 'Renamed',
      })
      expect(updated.name).toBe('Renamed')

      await withOrg(async (otherWorkspaceId) => {
        await expect(
          service.get(otherWorkspaceId, created.id),
        ).rejects.toThrow()
      })
    })
  })

  it('rejects a structurally invalid graph before it ever reaches the database', async () => {
    const moduleRef = await Test.createTestingModule({
      providers,
    }).compile()
    const service = moduleRef.get(WorkflowsService)

    await withOrg(async (workspaceId) => {
      const suffix = randomUUID()
      const workflow = await service.create(workspaceId, {
        name: 'Invalid Graph Workflow',
        slug: `invalid-graph-${suffix}`,
      })

      const graphWithDuplicateIds: WorkflowGraph = {
        version: 1,
        trigger: { type: 'manual' },
        entryNodeId: 'n1',
        nodes: [
          { id: 'n1', type: 'transform', config: {} },
          { id: 'n1', type: 'transform', config: {} },
        ],
        edges: [],
      }

      await expect(
        service.createVersion(workspaceId, workflow.id, {
          graph: graphWithDuplicateIds,
        }),
      ).rejects.toThrow()
    })
  })

  it('rejects a graph that uses the reserved resume-event node id', async () => {
    const moduleRef = await Test.createTestingModule({
      providers,
    }).compile()
    const service = moduleRef.get(WorkflowsService)

    await withOrg(async (workspaceId) => {
      const suffix = randomUUID()
      const workflow = await service.create(workspaceId, {
        name: 'Reserved Node Id Workflow',
        slug: `reserved-node-${suffix}`,
      })

      await expect(
        service.createVersion(workspaceId, workflow.id, {
          graph: validGraph('__resumed__'),
        }),
      ).rejects.toThrow()
    })
  })

  it('creates and publishes a version, scoped to the owning workflow', async () => {
    const moduleRef = await Test.createTestingModule({
      providers,
    }).compile()
    const service = moduleRef.get(WorkflowsService)

    await withOrg(async (workspaceId) => {
      const suffix = randomUUID()
      const workflowA = await service.create(workspaceId, {
        name: 'Workflow A',
        slug: `workflow-a-${suffix}`,
      })
      const workflowB = await service.create(workspaceId, {
        name: 'Workflow B',
        slug: `workflow-b-${suffix}`,
      })

      const version = await service.createVersion(workspaceId, workflowA.id, {
        graph: validGraph(),
      })

      // A version can't be published under the wrong workflow.
      await expect(
        service.publishVersion(workspaceId, workflowB.id, version.id),
      ).rejects.toThrow()

      const published = await service.publishVersion(
        workspaceId,
        workflowA.id,
        version.id,
      )
      expect(published.publishedVersionId).toBe(version.id)

      // A version can't be read under the wrong workflow, or from another workspace.
      await expect(
        service.getVersion(workspaceId, workflowB.id, version.id),
      ).rejects.toThrow()
      const fetched = await service.getVersion(
        workspaceId,
        workflowA.id,
        version.id,
      )
      expect(fetched.id).toBe(version.id)

      await withOrg(async (otherWorkspaceId) => {
        await expect(
          service.getVersion(otherWorkspaceId, workflowA.id, version.id),
        ).rejects.toThrow()
      })
    })
  })

  it('saves a draft without validating its structure, scoped to the workspace', async () => {
    const moduleRef = await Test.createTestingModule({
      providers,
    }).compile()
    const service = moduleRef.get(WorkflowsService)

    await withOrg(async (workspaceId) => {
      const suffix = randomUUID()
      const workflow = await service.create(workspaceId, {
        name: 'Draft Workflow',
        slug: `draft-${suffix}`,
      })

      // Missing entryNodeId/trigger, a node with no outgoing edge — invalid per
      // workflowGraphSchema, and that's fine: saveDraft doesn't validate structure.
      const incompleteGraph = { nodes: [{ id: 'n1' }] }
      const saved = await service.saveDraft(workspaceId, workflow.id, {
        graph: incompleteGraph,
      })
      expect(saved.draftGraph).toEqual(incompleteGraph)

      const fetched = await service.get(workspaceId, workflow.id)
      expect(fetched.draftGraph).toEqual(incompleteGraph)
      expect(fetched.draftUpdatedAt).toBeInstanceOf(Date)

      await withOrg(async (otherWorkspaceId) => {
        await expect(
          service.saveDraft(otherWorkspaceId, workflow.id, {
            graph: { nodes: [] },
          }),
        ).rejects.toThrow()
      })
    })
  })

  it('broadcasts a draft save to the workflow room only when a saver is given', async () => {
    const moduleRef = await Test.createTestingModule({
      providers,
    }).compile()
    const service = moduleRef.get(WorkflowsService)
    const gateway = moduleRef.get(WorkflowsGateway)
    const broadcast = jest
      .spyOn(gateway, 'broadcastDraftUpdate')
      .mockImplementation(() => undefined)

    await withOrg(async (workspaceId) => {
      const suffix = randomUUID()
      const workflow = await service.create(workspaceId, {
        name: 'Broadcast Draft Workflow',
        slug: `broadcast-draft-${suffix}`,
      })

      await service.saveDraft(workspaceId, workflow.id, {
        graph: { nodes: [] },
      })
      expect(broadcast).not.toHaveBeenCalled()

      await service.saveDraft(
        workspaceId,
        workflow.id,
        { graph: { nodes: [] } },
        { userId: 'user-1', name: 'Ada Lovelace' },
      )
      expect(broadcast).toHaveBeenCalledTimes(1)
      expect(broadcast).toHaveBeenCalledWith(
        workflow.id,
        expect.objectContaining({
          savedBy: { userId: 'user-1', name: 'Ada Lovelace' },
        }),
      )
    })

    broadcast.mockRestore()
  })

  it('mints a realtime token only for a signed-in session on a workflow in the right workspace', async () => {
    const moduleRef = await Test.createTestingModule({
      providers,
    }).compile()
    const service = moduleRef.get(WorkflowsService)

    await withOrg(async (workspaceId) => {
      const suffix = randomUUID()
      const workflow = await service.create(workspaceId, {
        name: 'Realtime Token Workflow',
        slug: `realtime-token-${suffix}`,
      })
      const session = {
        user: { id: 'user-1', name: 'Ada Lovelace', image: null },
      } as Parameters<typeof service.mintRealtimeToken>[2]

      await expect(
        service.mintRealtimeToken(workspaceId, workflow.id, null),
      ).rejects.toThrow()

      const { token } = await service.mintRealtimeToken(
        workspaceId,
        workflow.id,
        session,
      )
      expect(typeof token).toBe('string')

      await withOrg(async (otherWorkspaceId) => {
        await expect(
          service.mintRealtimeToken(otherWorkspaceId, workflow.id, session),
        ).rejects.toThrow()
      })
    })
  })
})
