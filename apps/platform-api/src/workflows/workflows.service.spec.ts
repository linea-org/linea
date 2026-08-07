import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, schema } from '@linea/db'
import type { WorkflowGraph } from '@linea/runtime'
import { WorkflowsService } from './workflows.service'

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
      providers: [WorkflowsService],
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
      providers: [WorkflowsService],
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

  it('creates and publishes a version, scoped to the owning workflow', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WorkflowsService],
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
    })
  })
})
