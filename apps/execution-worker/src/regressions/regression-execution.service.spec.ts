import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import type { WorkflowGraph } from "@linea/runtime"
import { CheckpointsService } from "../checkpoints/checkpoints.service"
import { InterpreterService } from "../graph/interpreter.service"
import { ApprovalNode } from "../graph/nodes/approval.node"
import { BranchNode } from "../graph/nodes/branch.node"
import { DatetimeNode } from "../graph/nodes/datetime.node"
import { FilterNode } from "../graph/nodes/filter.node"
import type { HttpNode } from "../graph/nodes/http.node"
import { MemoryNode } from "../graph/nodes/memory.node"
import { MergeNode } from "../graph/nodes/merge.node"
import { VariablesNode } from "../graph/nodes/variables.node"
import { TransformNode } from "../graph/nodes/transform.node"
import { WaitNode } from "../graph/nodes/wait.node"
import type { AiNode } from "../graph/nodes/ai.node"
import { RegressionExecutionService } from "./regression-execution.service"

afterAll(async () => {
  await pool.end()
})

function buildInterpreter(aiNode: AiNode) {
  return new InterpreterService(
    new CheckpointsService(),
    {} as HttpNode,
    new TransformNode(),
    new BranchNode(),
    aiNode,
    new ApprovalNode(),
    new MemoryNode(),
    new WaitNode(),
    new DatetimeNode(),
    new FilterNode(),
    new MergeNode(),
    new VariablesNode()
  )
}

async function setUpWorkflow(graph: WorkflowGraph) {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: "Regression Execution Test Org",
      slug: `regression-execution-test-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: organization.id,
    name: "Regression Execution Test Workflow",
    slug: `regression-execution-workflow-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph,
    contentHash: `regression-execution-hash-${suffix}`,
  })
  return { organization, workflow, version }
}

describe("RegressionExecutionService.runRegressionForVersion", () => {
  it("runs a node-type case through the real node handler and grades its output", async () => {
    const graph: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "transform-1",
      nodes: [
        {
          id: "transform-1",
          type: "transform",
          config: { expression: "message" },
        },
      ],
      edges: [],
    }
    const { organization, workflow, version } = await setUpWorkflow(graph)
    const execute = jest.fn()
    const aiNode = { execute } as unknown as AiNode
    const service = new RegressionExecutionService(
      buildInterpreter(aiNode),
      aiNode
    )

    try {
      await repositories.regressionCase.createRegressionCase(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        caseType: "node",
        nodeId: "transform-1",
        input: { nodeInput: { message: "hello world" } },
        assertions: [
          { type: "contains", config: { target: "output", value: "hello" } },
        ],
      })

      const run = await service.runRegressionForVersion(
        organization.id,
        workflow.id,
        version.id,
        "manual"
      )
      expect(run.total).toBe(1)
      expect(run.passed).toBe(1)
      expect(run.failed).toBe(0)
      expect(run.completedAt).toBeInstanceOf(Date)

      const results = await repositories.regressionRun.listRegressionResults(
        db,
        organization.id,
        run.id
      )
      expect(results).toHaveLength(1)
      expect(results[0].status).toBe("passed")
      expect(results[0].output).toEqual({ output: "hello world" })
      expect(execute).not.toHaveBeenCalled()
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("runs an Evaluator node as a regression case", async () => {
    const graph: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "evaluator-1",
      nodes: [
        {
          id: "evaluator-1",
          type: "evaluator",
          config: {
            sample: { actualOutputPath: "text" },
            metrics: [
              {
                id: "contains-answer",
                name: "Contains answer",
                type: "contains",
                value: "answer",
              },
            ],
          },
        },
      ],
      edges: [],
    }
    const { organization, workflow, version } = await setUpWorkflow(graph)
    const aiNode = { execute: jest.fn() } as unknown as AiNode
    const service = new RegressionExecutionService(
      buildInterpreter(aiNode),
      aiNode
    )
    try {
      await repositories.regressionCase.createRegressionCase(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        caseType: "node",
        nodeId: "evaluator-1",
        input: { nodeInput: { text: "the answer" } },
        assertions: [
          { type: "contains", config: { target: "passed", value: "true" } },
        ],
      })
      const run = await service.runRegressionForVersion(
        organization.id,
        workflow.id,
        version.id,
        "manual"
      )
      const results = await repositories.regressionRun.listRegressionResults(
        db,
        organization.id,
        run.id
      )
      expect(results[0]).toMatchObject({
        status: "passed",
        score: 1,
        output: { passed: true, score: 1 },
      })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("errors a node-type case whose nodeId no longer exists in this workflow version", async () => {
    const graph: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "transform-1",
      nodes: [{ id: "transform-1", type: "transform", config: {} }],
      edges: [],
    }
    const { organization, workflow, version } = await setUpWorkflow(graph)
    const aiNode = { execute: jest.fn() } as unknown as AiNode
    const service = new RegressionExecutionService(
      buildInterpreter(aiNode),
      aiNode
    )

    try {
      await repositories.regressionCase.createRegressionCase(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        caseType: "node",
        nodeId: "deleted-node",
        input: { nodeInput: {} },
        assertions: [],
      })

      const run = await service.runRegressionForVersion(
        organization.id,
        workflow.id,
        version.id,
        "manual"
      )
      expect(run.total).toBe(1)
      expect(run.passed).toBe(0)
      expect(run.failed).toBe(1)

      const results = await repositories.regressionRun.listRegressionResults(
        db,
        organization.id,
        run.id
      )
      expect(results[0].status).toBe("errored")
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("runs a conversation-type case through AiNode's chat path with the snapshotted history", async () => {
    const graph: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "start",
      nodes: [
        { id: "start", type: "start", config: {} },
        { id: "agent-1", type: "ai", config: { model: "claude-sonnet-5" } },
      ],
      edges: [{ from: "start", to: "agent-1" }],
    }
    const { organization, workflow, version } = await setUpWorkflow(graph)
    const execute = jest.fn().mockResolvedValue({
      text: "Sure, I can help with that.",
      tokensInput: 20,
      tokensOutput: 8,
    })
    const aiNode = { execute } as unknown as AiNode
    const service = new RegressionExecutionService(
      buildInterpreter(aiNode),
      aiNode
    )

    try {
      await repositories.regressionCase.createRegressionCase(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        caseType: "conversation",
        input: {
          turns: [{ role: "user", content: "What's your refund policy?" }],
          finalPrompt: "What about after 30 days?",
          externalSubjectId: "customer-user-1",
        },
        assertions: [
          {
            type: "contains",
            config: { target: "2.content", value: "help" },
          },
        ],
      })

      const run = await service.runRegressionForVersion(
        organization.id,
        workflow.id,
        version.id,
        "publish"
      )
      expect(run.passed).toBe(1)
      expect(execute).toHaveBeenCalledWith(
        { model: "claude-sonnet-5" },
        {},
        expect.objectContaining({
          regressionConversation: {
            turns: [{ role: "user", content: "What's your refund policy?" }],
            finalPrompt: "What about after 30 days?",
            // Carried through so a memorySubjectPath-configured agent still gets memory recall
            // during regression — there's no real input object for it to resolve a dot-path against.
            externalSubjectId: "customer-user-1",
          },
        })
      )

      const results = await repositories.regressionRun.listRegressionResults(
        db,
        organization.id,
        run.id
      )
      expect(results[0].output).toEqual([
        { role: "user", content: "What's your refund policy?" },
        { role: "user", content: "What about after 30 days?" },
        { role: "assistant", content: "Sure, I can help with that." },
      ])
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("errors a conversation-type case when the graph has no Agent node", async () => {
    const graph: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "transform-1",
      nodes: [{ id: "transform-1", type: "transform", config: {} }],
      edges: [],
    }
    const { organization, workflow, version } = await setUpWorkflow(graph)
    const execute = jest.fn()
    const aiNode = { execute } as unknown as AiNode
    const service = new RegressionExecutionService(
      buildInterpreter(aiNode),
      aiNode
    )

    try {
      await repositories.regressionCase.createRegressionCase(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        caseType: "conversation",
        input: { turns: [], finalPrompt: "hi" },
        assertions: [],
      })

      const run = await service.runRegressionForVersion(
        organization.id,
        workflow.id,
        version.id,
        "manual"
      )
      expect(run.failed).toBe(1)
      const results = await repositories.regressionRun.listRegressionResults(
        db,
        organization.id,
        run.id
      )
      expect(results[0].status).toBe("errored")
      expect(execute).not.toHaveBeenCalled()
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("aggregates passed/failed across multiple cases in one run", async () => {
    const graph: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "transform-1",
      nodes: [
        {
          id: "transform-1",
          type: "transform",
          config: { expression: "message" },
        },
      ],
      edges: [],
    }
    const { organization, workflow, version } = await setUpWorkflow(graph)
    const aiNode = { execute: jest.fn() } as unknown as AiNode
    const service = new RegressionExecutionService(
      buildInterpreter(aiNode),
      aiNode
    )

    try {
      await repositories.regressionCase.createRegressionCase(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        caseType: "node",
        nodeId: "transform-1",
        input: { nodeInput: { message: "hello" } },
        assertions: [
          { type: "contains", config: { target: "output", value: "hello" } },
        ],
      })
      await repositories.regressionCase.createRegressionCase(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        caseType: "node",
        nodeId: "transform-1",
        input: { nodeInput: { message: "hello" } },
        assertions: [
          {
            type: "contains",
            config: { target: "output", value: "goodbye" },
          },
        ],
      })
      const archived = await repositories.regressionCase.createRegressionCase(
        db,
        {
          workspaceId: organization.id,
          workflowId: workflow.id,
          caseType: "node",
          nodeId: "transform-1",
          input: { nodeInput: { message: "hello" } },
          assertions: [],
        }
      )
      await repositories.regressionCase.archiveRegressionCase(
        db,
        organization.id,
        archived.id
      )

      const run = await service.runRegressionForVersion(
        organization.id,
        workflow.id,
        version.id,
        "manual"
      )
      // Archived case is excluded — only the two active ones count.
      expect(run.total).toBe(2)
      expect(run.passed).toBe(1)
      expect(run.failed).toBe(1)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
