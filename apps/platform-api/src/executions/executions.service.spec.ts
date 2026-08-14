import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, repositories, schema } from '@linea/db'
import type { WorkflowGraph } from '@linea/runtime'
import { ExecutionsService } from './executions.service'
import { StepReplayQueueService } from '../queue/step-replay-queue.service'
import { WorkflowQueueService } from '../queue/workflow-queue.service'

afterAll(async () => {
  await pool.end()
})

const graph: WorkflowGraph = {
  version: 1,
  trigger: { type: 'manual' },
  entryNodeId: 'n1',
  nodes: [{ id: 'n1', type: 'transform', config: {} }],
  edges: [],
}

describe('ExecutionsService', () => {
  it('rejects triggering a workflow with no published version', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExecutionsService,
        WorkflowQueueService,
        StepReplayQueueService,
      ],
    }).compile()
    const service = moduleRef.get(ExecutionsService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Executions Test Org',
        slug: `executions-test-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Unpublished Workflow',
        slug: `unpublished-${suffix}`,
      })

      await expect(
        service.trigger(organization.id, workflow.id, {}),
      ).rejects.toThrow()
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })

  it('triggers a published workflow, enqueues it, and lists/gets it back scoped to the workspace', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExecutionsService,
        WorkflowQueueService,
        StepReplayQueueService,
      ],
    }).compile()
    const service = moduleRef.get(ExecutionsService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Executions Trigger Test Org',
        slug: `executions-trigger-test-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    const [otherOrg] = await db
      .insert(schema.organizations)
      .values({
        name: 'Other Org',
        slug: `other-org-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Published Workflow',
        slug: `published-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: 'test-hash',
      })
      await repositories.workflow.publishWorkflowVersion(
        db,
        workflow.id,
        version.id,
      )

      const execution = await service.trigger(organization.id, workflow.id, {
        triggerPayload: { hello: 'world' },
      })
      expect(execution.status).toBe('queued')
      expect(execution.trigger).toBe('manual')

      const list = await service.list(organization.id, workflow.id)
      expect(list.map((e) => e.id)).toContain(execution.id)

      const workspaceList = await service.listWorkspace(organization.id, {})
      expect(workspaceList.executions.map((e) => e.id)).toContain(execution.id)
      expect(workspaceList.executions[0].workflowName).toBe(workflow.name)
      expect(workspaceList.total).toBeGreaterThanOrEqual(1)

      const filteredOut = await service.listWorkspace(organization.id, {
        status: 'succeeded',
      })
      expect(filteredOut.executions.map((e) => e.id)).not.toContain(
        execution.id,
      )

      expect(
        (await service.listWorkspace(otherOrg.id, {})).executions.map(
          (e) => e.id,
        ),
      ).not.toContain(execution.id)

      const found = await service.get(organization.id, execution.id)
      expect(found.execution.id).toBe(execution.id)
      expect(found.steps).toEqual([])

      await expect(service.get(otherOrg.id, execution.id)).rejects.toThrow()
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id IN ($1, $2)', [
        organization.id,
        otherOrg.id,
      ])
    }
  })

  it('rejects triggering an archived workflow, even with a published version', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExecutionsService,
        WorkflowQueueService,
        StepReplayQueueService,
      ],
    }).compile()
    const service = moduleRef.get(ExecutionsService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Executions Archived Test Org',
        slug: `executions-archived-test-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Archived Workflow',
        slug: `archived-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: 'test-hash',
      })
      await repositories.workflow.publishWorkflowVersion(
        db,
        workflow.id,
        version.id,
      )
      await repositories.workflow.updateWorkflow(
        db,
        organization.id,
        workflow.id,
        {
          archivedAt: new Date(),
        },
      )

      await expect(
        service.trigger(organization.id, workflow.id, {}),
      ).rejects.toThrow()
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })

  it('marks the execution failed instead of stranding it queued when enqueueing fails', async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Executions Enqueue Fail Test Org',
        slug: `executions-enqueue-fail-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: 'Enqueue Fail Workflow',
        slug: `enqueue-fail-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: 'test-hash',
      })
      await repositories.workflow.publishWorkflowVersion(
        db,
        workflow.id,
        version.id,
      )

      const failingQueue = {
        enqueue: () => Promise.reject(new Error('redis unreachable')),
      } as unknown as WorkflowQueueService
      const unusedStepReplayQueue = {} as StepReplayQueueService
      const service = new ExecutionsService(failingQueue, unusedStepReplayQueue)

      await expect(
        service.trigger(organization.id, workflow.id, {}),
      ).rejects.toThrow()

      const list = await repositories.execution.listExecutions(db, workflow.id)
      expect(list).toHaveLength(1)
      expect(list[0].status).toBe('failed')
      expect(list[0].error).toEqual({ message: 'redis unreachable' })
    } finally {
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
    }
  })

  describe('testRun()', () => {
    it('runs the current graph immediately, without a published or committed version', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          ExecutionsService,
          WorkflowQueueService,
          StepReplayQueueService,
        ],
      }).compile()
      const service = moduleRef.get(ExecutionsService)

      const suffix = randomUUID()
      const [organization] = await db
        .insert(schema.organizations)
        .values({
          name: 'Test Run Test Org',
          slug: `test-run-test-${suffix}`,
          createdAt: new Date(),
        })
        .returning()

      try {
        const workflow = await repositories.workflow.createWorkflow(db, {
          workspaceId: organization.id,
          name: 'Unpublished Workflow',
          slug: `test-run-unpublished-${suffix}`,
        })

        const execution = await service.testRun(organization.id, workflow.id, {
          graph,
        })
        expect(execution.status).toBe('queued')

        const versions = await pool.query(
          'SELECT id FROM workflow_versions WHERE workflow_id = $1',
          [workflow.id],
        )
        expect(versions.rows).toHaveLength(1)

        const reloaded = await repositories.workflow.getWorkflowById(
          db,
          organization.id,
          workflow.id,
        )
        expect(reloaded?.publishedVersionId).toBeNull()
      } finally {
        await moduleRef.close()
        await pool.query('DELETE FROM organizations WHERE id = $1', [
          organization.id,
        ])
      }
    })

    it('rejects a workflow from a different workspace and creates no version row for it', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          ExecutionsService,
          WorkflowQueueService,
          StepReplayQueueService,
        ],
      }).compile()
      const service = moduleRef.get(ExecutionsService)

      const suffix = randomUUID()
      const [owningOrg] = await db
        .insert(schema.organizations)
        .values({
          name: 'Test Run Owning Org',
          slug: `test-run-owning-${suffix}`,
          createdAt: new Date(),
        })
        .returning()
      const [attackerOrg] = await db
        .insert(schema.organizations)
        .values({
          name: 'Test Run Attacker Org',
          slug: `test-run-attacker-${suffix}`,
          createdAt: new Date(),
        })
        .returning()

      try {
        const workflow = await repositories.workflow.createWorkflow(db, {
          workspaceId: owningOrg.id,
          name: 'Victim Workflow',
          slug: `test-run-victim-${suffix}`,
        })

        await expect(
          service.testRun(attackerOrg.id, workflow.id, { graph }),
        ).rejects.toThrow()

        const versions = await pool.query(
          'SELECT id FROM workflow_versions WHERE workflow_id = $1',
          [workflow.id],
        )
        expect(versions.rows).toHaveLength(0)
      } finally {
        await moduleRef.close()
        await pool.query('DELETE FROM organizations WHERE id IN ($1, $2)', [
          owningOrg.id,
          attackerOrg.id,
        ])
      }
    })
  })

  describe('get()', () => {
    it('computes nodeConfigs from the bound workflow version and replayable from origin/status', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          ExecutionsService,
          WorkflowQueueService,
          StepReplayQueueService,
        ],
      }).compile()
      const service = moduleRef.get(ExecutionsService)

      const suffix = randomUUID()
      const [organization] = await db
        .insert(schema.organizations)
        .values({
          name: 'Executions Get Test Org',
          slug: `executions-get-test-${suffix}`,
          createdAt: new Date(),
        })
        .returning()

      try {
        const configuredGraph: WorkflowGraph = {
          version: 1,
          trigger: { type: 'manual' },
          entryNodeId: 'n1',
          nodes: [
            { id: 'n1', type: 'ai', config: { model: 'gpt-5', prompt: 'hi' } },
          ],
          edges: [],
        }
        const workflow = await repositories.workflow.createWorkflow(db, {
          workspaceId: organization.id,
          name: 'Get Test Workflow',
          slug: `get-test-${suffix}`,
        })
        const version = await repositories.workflow.createWorkflowVersion(db, {
          workflowId: workflow.id,
          graph: configuredGraph,
          contentHash: 'get-test-hash',
        })
        const execution = await repositories.execution.createExecution(db, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: 'manual',
        })

        // Not yet terminal — not replayable.
        const beforeTerminal = await service.get(organization.id, execution.id)
        expect(beforeTerminal.nodeConfigs).toEqual({
          n1: { model: 'gpt-5', prompt: 'hi' },
        })
        expect(beforeTerminal.replayable).toBe(false)

        await repositories.execution.startExecution(
          db,
          execution.id,
          'test-worker',
          new Date(Date.now() + 60_000),
        )
        await repositories.execution.completeExecution(
          db,
          execution.id,
          'test-worker',
          {
            status: 'succeeded',
            costMicros: 0n,
            costUnpriced: false,
            tokensInput: 0,
            tokensOutput: 0,
          },
        )

        const afterTerminal = await service.get(organization.id, execution.id)
        expect(afterTerminal.replayable).toBe(true)
      } finally {
        await moduleRef.close()
        await pool.query('DELETE FROM organizations WHERE id = $1', [
          organization.id,
        ])
      }
    })
  })

  describe('replayStep()', () => {
    async function setUpTerminalExecutionWithStep(organizationId: string) {
      const suffix = randomUUID()
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organizationId,
        name: 'Replay Endpoint Test Workflow',
        slug: `replay-endpoint-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: `replay-endpoint-hash-${suffix}`,
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organizationId,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: 'manual',
      })
      await repositories.execution.startExecution(
        db,
        execution.id,
        'test-worker',
        new Date(Date.now() + 60_000),
      )
      await repositories.execution.completeExecution(
        db,
        execution.id,
        'test-worker',
        {
          status: 'succeeded',
          costMicros: 0n,
          costUnpriced: false,
          tokensInput: 0,
          tokensOutput: 0,
        },
      )

      const [step] = await db
        .insert(schema.executionSteps)
        .values({
          executionId: execution.id,
          workspaceId: organizationId,
          traceId: execution.id,
          spanId: 'span-1',
          name: 'transform',
          startedAt: new Date(),
          endedAt: new Date(),
          status: 'succeeded',
          nodeId: 'n1',
          sequence: 1,
          input: {},
          output: {},
        })
        .returning()

      return { execution, step }
    }

    it('enqueues a replay and returns a replayStepId for a valid target', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          ExecutionsService,
          WorkflowQueueService,
          StepReplayQueueService,
        ],
      }).compile()
      const service = moduleRef.get(ExecutionsService)

      const suffix = randomUUID()
      const [organization] = await db
        .insert(schema.organizations)
        .values({
          name: 'Replay Endpoint Test Org',
          slug: `replay-endpoint-test-${suffix}`,
          createdAt: new Date(),
        })
        .returning()

      try {
        const { execution, step } = await setUpTerminalExecutionWithStep(
          organization.id,
        )

        const result = await service.replayStep(
          organization.id,
          execution.id,
          step.id,
          { overrideConfig: { foo: 'bar' } },
        )
        expect(result.replayStepId).toEqual(expect.any(String))
      } finally {
        await moduleRef.close()
        await pool.query('DELETE FROM organizations WHERE id = $1', [
          organization.id,
        ])
      }
    })

    it('rejects a non-terminal execution, a missing step, and a replay-of-a-replay', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          ExecutionsService,
          WorkflowQueueService,
          StepReplayQueueService,
        ],
      }).compile()
      const service = moduleRef.get(ExecutionsService)

      const suffix = randomUUID()
      const [organization] = await db
        .insert(schema.organizations)
        .values({
          name: 'Replay Rejection Test Org',
          slug: `replay-rejection-test-${suffix}`,
          createdAt: new Date(),
        })
        .returning()

      try {
        const { execution, step } = await setUpTerminalExecutionWithStep(
          organization.id,
        )

        await expect(
          service.replayStep(organization.id, execution.id, randomUUID(), {}),
        ).rejects.toThrow('Step not found')

        const [alreadyAReplay] = await db
          .insert(schema.executionSteps)
          .values({
            executionId: execution.id,
            workspaceId: organization.id,
            traceId: execution.id,
            spanId: 'span-2',
            name: 'transform',
            startedAt: new Date(),
            endedAt: new Date(),
            status: 'succeeded',
            nodeId: 'n1',
            sequence: 2,
            input: {},
            output: {},
            replayedFromStepId: step.id,
          })
          .returning()
        await expect(
          service.replayStep(
            organization.id,
            execution.id,
            alreadyAReplay.id,
            {},
          ),
        ).rejects.toThrow('Cannot replay a replay')

        const nonTerminalWorkflow = await repositories.workflow.createWorkflow(
          db,
          {
            workspaceId: organization.id,
            name: 'Non Terminal Workflow',
            slug: `non-terminal-${suffix}`,
          },
        )
        const nonTerminalVersion =
          await repositories.workflow.createWorkflowVersion(db, {
            workflowId: nonTerminalWorkflow.id,
            graph,
            contentHash: `non-terminal-hash-${suffix}`,
          })
        const nonTerminalExecution =
          await repositories.execution.createExecution(db, {
            workspaceId: organization.id,
            workflowId: nonTerminalWorkflow.id,
            workflowVersionId: nonTerminalVersion.id,
            trigger: 'manual',
          })
        await expect(
          service.replayStep(
            organization.id,
            nonTerminalExecution.id,
            step.id,
            {},
          ),
        ).rejects.toThrow('Execution is not replayable')
      } finally {
        await moduleRef.close()
        await pool.query('DELETE FROM organizations WHERE id = $1', [
          organization.id,
        ])
      }
    })
  })
})
