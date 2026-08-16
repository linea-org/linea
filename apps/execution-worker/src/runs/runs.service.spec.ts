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

describe("RunsService chat-preview message persistence", () => {
  it("does not persist a reply when triggerPayload carries a conversationId but no chatMessageId to link it to", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Runs Service Chat Test Org",
        slug: `runs-chat-${suffix}`,
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
        name: "Runs Service Chat Test Workflow",
        slug: `runs-chat-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "runs-chat-hash",
      })
      const conversationId = randomUUID()
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: { conversationId },
      })

      const fastInterpreter = {
        run: () =>
          Promise.resolve({
            result: { status: "completed" as const },
            totalTokensInput: 10,
            totalTokensOutput: 5,
            totalCostMicros: 0n,
            costUnpriced: false,
            completed: new Map([["n1", { text: "the assistant's reply" }]]),
          }),
      } as unknown as InterpreterService

      const runs = new RunsService(
        new CheckpointsService(),
        fastInterpreter,
        new RunLeaseService()
      )
      await runs.execute(execution.id)

      const messages = await repositories.chatMessage.listChatMessages(
        db,
        organization.id,
        workflow.id,
        conversationId
      )
      expect(messages).toHaveLength(0)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("does not persist a reply when chatMessageId points to a real user message from a different conversation", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Runs Service Chat Forged Test Org",
        slug: `runs-chat-forged-${suffix}`,
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
        name: "Runs Service Chat Forged Test Workflow",
        slug: `runs-chat-forged-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "runs-chat-forged-hash",
      })
      // Real row, wrong conversation — passes the FK constraint, so only an explicit scope check catches this.
      const foreignMessage = await repositories.chatMessage.createChatMessage(
        db,
        {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId: randomUUID(),
          role: "user",
          content: "a message from a different conversation",
        }
      )
      const conversationId = randomUUID()
      // Simulates an ordinary execution whose triggerPayload happens to carry a mismatched pair.
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: { conversationId, chatMessageId: foreignMessage.id },
      })

      const fastInterpreter = {
        run: () =>
          Promise.resolve({
            result: { status: "completed" as const },
            totalTokensInput: 10,
            totalTokensOutput: 5,
            totalCostMicros: 0n,
            costUnpriced: false,
            completed: new Map([["n1", { text: "should not be persisted" }]]),
          }),
      } as unknown as InterpreterService

      const runs = new RunsService(
        new CheckpointsService(),
        fastInterpreter,
        new RunLeaseService()
      )
      await runs.execute(execution.id)

      const messages = await repositories.chatMessage.listChatMessages(
        db,
        organization.id,
        workflow.id,
        conversationId
      )
      expect(messages).toHaveLength(0)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("links the persisted assistant reply to its own triggering user message via respondsToMessageId", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Runs Service Chat Order Test Org",
        slug: `runs-chat-order-${suffix}`,
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
        name: "Runs Service Chat Order Test Workflow",
        slug: `runs-chat-order-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "runs-chat-order-hash",
      })
      const conversationId = randomUUID()
      const userMessage = await repositories.chatMessage.createChatMessage(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "user",
        content: "hello",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: { conversationId, chatMessageId: userMessage.id },
      })

      const fastInterpreter = {
        run: () =>
          Promise.resolve({
            result: { status: "completed" as const },
            totalTokensInput: 10,
            totalTokensOutput: 5,
            totalCostMicros: 0n,
            costUnpriced: false,
            completed: new Map([["n1", { text: "the reply" }]]),
          }),
      } as unknown as InterpreterService

      const runs = new RunsService(
        new CheckpointsService(),
        fastInterpreter,
        new RunLeaseService()
      )
      await runs.execute(execution.id)

      const messages = await repositories.chatMessage.listChatMessages(
        db,
        organization.id,
        workflow.id,
        conversationId
      )
      const reply = messages.find((m) => m.role === "assistant")
      expect(reply?.respondsToMessageId).toBe(userMessage.id)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("does not mistake a later non-ai node's coincidental text field for the assistant's reply", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Runs Service Chat Non-AI Text Test Org",
        slug: `runs-chat-non-ai-text-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph: WorkflowGraph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "n1",
        nodes: [
          { id: "n1", type: "ai", config: { model: "groq/compound" } },
          { id: "n2", type: "transform", config: { expression: "input" } },
        ],
        edges: [{ from: "n1", to: "n2" }],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Runs Service Chat Non-AI Text Test Workflow",
        slug: `runs-chat-non-ai-text-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "runs-chat-non-ai-text-hash",
      })
      const conversationId = randomUUID()
      const userMessage = await repositories.chatMessage.createChatMessage(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "user",
        content: "hello",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: { conversationId, chatMessageId: userMessage.id },
      })

      const fastInterpreter = {
        run: () =>
          Promise.resolve({
            result: { status: "completed" as const },
            totalTokensInput: 10,
            totalTokensOutput: 5,
            totalCostMicros: 0n,
            costUnpriced: false,
            // n2 (a transform node) ran after the ai node and happens to also carry a `text` field.
            completed: new Map([
              ["n1", { text: "the actual ai reply" }],
              ["n2", { text: "coincidental transform output" }],
            ]),
          }),
      } as unknown as InterpreterService

      const runs = new RunsService(
        new CheckpointsService(),
        fastInterpreter,
        new RunLeaseService()
      )
      await runs.execute(execution.id)

      const messages = await repositories.chatMessage.listChatMessages(
        db,
        organization.id,
        workflow.id,
        conversationId
      )
      const reply = messages.find((m) => m.role === "assistant")
      expect(reply?.content).toBe("the actual ai reply")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("persists nothing when triggerPayload has no conversationId", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Runs Service Non-Chat Test Org",
        slug: `runs-non-chat-${suffix}`,
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
        name: "Runs Service Non-Chat Test Workflow",
        slug: `runs-non-chat-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "runs-non-chat-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
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
            totalTokensInput: 10,
            totalTokensOutput: 5,
            totalCostMicros: 0n,
            costUnpriced: false,
            completed: new Map([["n1", { text: "should not be persisted" }]]),
          }),
      } as unknown as InterpreterService

      const runs = new RunsService(
        new CheckpointsService(),
        fastInterpreter,
        new RunLeaseService()
      )
      await runs.execute(execution.id)

      const { rows } = await pool.query(
        "SELECT id FROM chat_messages WHERE workspace_id = $1",
        [organization.id]
      )
      expect(rows).toHaveLength(0)
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
})
