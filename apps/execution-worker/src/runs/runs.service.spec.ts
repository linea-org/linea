import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import type { WorkflowGraph } from "@linea/runtime"
import { CheckpointsService } from "../checkpoints/checkpoints.service"
import type { InterpreterService } from "../graph/interpreter.service"
import { RunLeaseService } from "./run-lease.service"
import { RunsService } from "./runs.service"

afterAll(async () => {
  await pool.end()
})

describe("RunsService failure accounting", () => {
  it("preserves previously checkpointed token usage when a resumed run fails outright", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Runs Service Fail Test Org",
        slug: `runs-fail-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "n1",
        nodes: [{ id: "n1", type: "transform", config: { expression: "" } }],
        edges: [],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Runs Service Fail Test Workflow",
        slug: `runs-fail-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "runs-fail-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })

      // A prior abandoned attempt already checkpointed real token usage.
      const checkpoints = new CheckpointsService()
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-0-abandoned",
        new Date(Date.now() + 60_000)
      )
      await checkpoints.recordStep({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-0-abandoned",
        nodeId: "n1",
        nodeType: "transform",
        input: {},
        output: {},
        startedAt: new Date(),
        endedAt: new Date(),
        tokensInput: 100,
        tokensOutput: 50,
        completed: new Map([["n1", {}]]),
      })
      // Now it's abandoned — heartbeat stops, lease ages out.
      await pool.query(
        "UPDATE executions SET lease_expires_at = $1 WHERE id = $2",
        [new Date(Date.now() - 1_000), execution.id]
      )

      // The resuming interpreter fails outright before returning any outcome.
      const poisonInterpreter = {
        run: () => Promise.reject(new Error("simulated failure after resume")),
      } as unknown as InterpreterService

      const runs = new RunsService(
        checkpoints,
        poisonInterpreter,
        new RunLeaseService()
      )

      await expect(runs.execute(execution.id)).rejects.toThrow(
        "simulated failure after resume"
      )

      const [finalExecution] = await repositories.execution.listExecutions(
        db,
        workflow.id,
        { limit: 1 }
      )
      expect(finalExecution.status).toBe("failed")
      expect(finalExecution.tokensInput).toBe(100)
      expect(finalExecution.tokensOutput).toBe(50)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("notifies every workspace member when a run fails outright", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Runs Service Notify Test Org",
        slug: `runs-notify-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    const [member] = await db
      .insert(schema.users)
      .values({
        name: "Notify Member",
        email: `notify-member-${suffix}@test.dev`,
      })
      .returning()

    try {
      await db.insert(schema.members).values({
        organizationId: organization.id,
        userId: member.id,
        role: "member",
        createdAt: new Date(),
      })

      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "n1",
        nodes: [{ id: "n1", type: "transform", config: { expression: "" } }],
        edges: [],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Runs Service Notify Test Workflow",
        slug: `runs-notify-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "runs-notify-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })

      const poisonInterpreter = {
        run: () =>
          Promise.reject(new Error("simulated failure for notification test")),
      } as unknown as InterpreterService

      const runs = new RunsService(
        new CheckpointsService(),
        poisonInterpreter,
        new RunLeaseService()
      )

      await expect(runs.execute(execution.id)).rejects.toThrow(
        "simulated failure for notification test"
      )

      const notifications = await repositories.notification.listNotifications(
        db,
        member.id,
        { workspaceId: organization.id }
      )
      expect(notifications).toHaveLength(1)
      expect(notifications[0]).toMatchObject({
        type: "execution.failed",
        severity: "error",
        title: "Runs Service Notify Test Workflow run failed",
      })
      expect(notifications[0].metadata).toMatchObject({
        workflowId: workflow.id,
        executionId: execution.id,
      })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
      await pool.query("DELETE FROM users WHERE id = $1", [member.id])
    }
  })

  it("reflects a step checkpointed during a run that then throws, not the stale pre-run state", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Runs Service Mid-Run Fail Test Org",
        slug: `runs-mid-run-fail-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "n1",
        nodes: [{ id: "n1", type: "ai", config: { model: "groq/compound" } }],
        edges: [],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Runs Service Mid-Run Fail Test Workflow",
        slug: `runs-mid-run-fail-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "runs-mid-run-fail-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })

      const checkpoints = new CheckpointsService()

      // No prior checkpoints exist yet — the pre-run known* state starts at false/0, same as any fresh execution.
      // interpreter.run() checkpoints an unpriced AI step for real (as it would mid-run), then throws before
      // ever returning an outcome — simulating a crash right after that checkpoint lands.
      const midRunFailInterpreter = {
        run: async ({
          executionId,
          workspaceId,
          leasedBy,
        }: {
          executionId: string
          workspaceId: string
          leasedBy: string
        }) => {
          await checkpoints.recordStep({
            executionId,
            workspaceId,
            leasedBy,
            nodeId: "n1",
            nodeType: "ai",
            input: {},
            output: {},
            startedAt: new Date(),
            endedAt: new Date(),
            tokensInput: 10,
            tokensOutput: 5,
            costMicros: undefined,
            costUnpriced: true,
            completed: new Map([["n1", {}]]),
          })
          throw new Error("simulated crash right after checkpointing")
        },
      } as unknown as InterpreterService

      const runs = new RunsService(
        checkpoints,
        midRunFailInterpreter,
        new RunLeaseService()
      )

      await expect(runs.execute(execution.id)).rejects.toThrow(
        "simulated crash right after checkpointing"
      )

      const [finalExecution] = await repositories.execution.listExecutions(
        db,
        workflow.id,
        { limit: 1 }
      )
      expect(finalExecution.status).toBe("failed")
      expect(finalExecution.tokensInput).toBe(10)
      expect(finalExecution.costUnpriced).toBe(true)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("preserves previously checkpointed token usage when graph parsing fails before the interpreter ever runs", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Runs Service Early Fail Test Org",
        slug: `runs-early-fail-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Runs Service Early Fail Test Workflow",
        slug: `runs-early-fail-workflow-${suffix}`,
      })
      // Not a valid WorkflowGraph — parsing this throws before the
      // interpreter is ever reached.
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph: {},
        contentHash: "runs-early-fail-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })

      const checkpoints = new CheckpointsService()
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-0-abandoned",
        new Date(Date.now() + 60_000)
      )
      await checkpoints.recordStep({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-0-abandoned",
        nodeId: "n1",
        nodeType: "transform",
        input: {},
        output: {},
        startedAt: new Date(),
        endedAt: new Date(),
        tokensInput: 100,
        tokensOutput: 50,
        completed: new Map([["n1", {}]]),
      })
      // Now it's abandoned — heartbeat stops, lease ages out.
      await pool.query(
        "UPDATE executions SET lease_expires_at = $1 WHERE id = $2",
        [new Date(Date.now() - 1_000), execution.id]
      )

      const unreachableInterpreter = {
        run: () => {
          throw new Error(
            "should never be called — graph parse should fail first"
          )
        },
      } as unknown as InterpreterService

      const runs = new RunsService(
        checkpoints,
        unreachableInterpreter,
        new RunLeaseService()
      )

      await expect(runs.execute(execution.id)).rejects.toThrow()

      const [finalExecution] = await repositories.execution.listExecutions(
        db,
        workflow.id,
        { limit: 1 }
      )
      expect(finalExecution.status).toBe("failed")
      expect(finalExecution.tokensInput).toBe(100)
      expect(finalExecution.tokensOutput).toBe(50)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})

describe("RunsService fencing identity", () => {
  it("gives each execute() call its own leasedBy, even from the same instance", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Runs Service Identity Test Org",
        slug: `runs-identity-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "n1",
        nodes: [{ id: "n1", type: "transform", config: { expression: "" } }],
        edges: [],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Runs Service Identity Test Workflow",
        slug: `runs-identity-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "runs-identity-hash",
      })
      const executionA = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })
      const executionB = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })

      const fastInterpreter = {
        run: () =>
          Promise.resolve({
            result: { status: "completed" as const },
            totalTokensInput: 0,
            totalTokensOutput: 0,
          }),
      } as unknown as InterpreterService

      const runs = new RunsService(
        new CheckpointsService(),
        fastInterpreter,
        new RunLeaseService()
      )
      await runs.execute(executionA.id)
      await runs.execute(executionB.id)

      const ownerA = await repositories.execution.getLeaseOwner(
        db,
        executionA.id
      )
      const ownerB = await repositories.execution.getLeaseOwner(
        db,
        executionB.id
      )
      expect(ownerA).not.toBe(ownerB)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("loops back and continues immediately instead of pausing when the approval resolves before the pause is recorded", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Runs Service Approval Race Test Org",
        slug: `runs-approval-race-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "approval-1",
        nodes: [{ id: "approval-1", type: "approval", config: {} }],
        edges: [],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Runs Service Approval Race Test Workflow",
        slug: `runs-approval-race-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "runs-approval-race-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })

      // Simulates a response racing ahead of the pause: the approval is already resolved before RunsService's own pausedAt handling runs.
      const approval = await repositories.approval.createApproval(db, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
      })
      await repositories.approval.resolveApproval(
        db,
        organization.id,
        approval!.id,
        {
          status: "approved",
          respondedBy: null,
          respondedByEmail: "anyone@test.dev",
        }
      )

      let callCount = 0
      const racyInterpreter = {
        run: () => {
          callCount += 1
          if (callCount === 1) {
            return Promise.resolve({
              pausedAt: "approval-1",
              totalTokensInput: 0,
              totalTokensOutput: 0,
              totalCostMicros: 0n,
              costUnpriced: false as const,
            })
          }
          return Promise.resolve({
            result: { status: "completed" as const },
            totalTokensInput: 0,
            totalTokensOutput: 0,
            totalCostMicros: 0n,
            costUnpriced: false as const,
            completed: new Map(),
          })
        },
      } as unknown as InterpreterService

      const runs = new RunsService(
        new CheckpointsService(),
        racyInterpreter,
        new RunLeaseService()
      )
      await runs.execute(execution.id)

      // Proves the loop actually re-ran the interpreter instead of pausing on the first pausedAt result.
      expect(callCount).toBe(2)

      const reloaded = await repositories.execution.getExecutionById(
        db,
        execution.id
      )
      expect(reloaded?.status).toBe("succeeded")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("throws instead of falsely reporting paused when the lease is lost before the pause is recorded", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Runs Service Approval Lease Loss Test Org",
        slug: `runs-approval-lease-loss-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "approval-1",
        nodes: [{ id: "approval-1", type: "approval", config: {} }],
        edges: [],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Runs Service Approval Lease Loss Test Workflow",
        slug: `runs-approval-lease-loss-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "runs-approval-lease-loss-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })
      await repositories.approval.createApproval(db, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
      })

      const leaseStealingInterpreter = {
        run: async () => {
          // Simulates the lease being reclaimed in the gap between the pause and claimPauseForPendingApproval running, so its guarded UPDATE can't match.
          await pool.query(
            "UPDATE executions SET leased_by = $1, lease_expires_at = $2 WHERE id = $3",
            ["someone-else", new Date(Date.now() + 60_000), execution.id]
          )
          return {
            pausedAt: "approval-1",
            totalTokensInput: 0,
            totalTokensOutput: 0,
            totalCostMicros: 0n,
            costUnpriced: false as const,
          }
        },
      } as unknown as InterpreterService

      const runs = new RunsService(
        new CheckpointsService(),
        leaseStealingInterpreter,
        new RunLeaseService()
      )

      // Must surface as a real failure — a silent success would leave the row running under someone else's lease with a pending approval and nothing left to resume it.
      await expect(runs.execute(execution.id)).rejects.toThrow(/lease/i)

      const reloaded = await repositories.execution.getExecutionById(
        db,
        execution.id
      )
      // Not falsely marked "paused" — completeExecution's lease guard also stops this worker overwriting the new owner.
      expect(reloaded?.status).not.toBe("paused")
      expect(reloaded?.leasedBy).toBe("someone-else")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
