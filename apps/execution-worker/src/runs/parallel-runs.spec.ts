import "dotenv/config"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linealabs/db"
import { fireWaitTimer, seedExecution } from "@linealabs/db/testing"
import { isFlagEnabled } from "@linealabs/flags"
import type { WorkflowGraph } from "@linealabs/runtime"
import { CheckpointsService } from "../checkpoints/checkpoints.service"
import { ConnectorGatewayService } from "../connectors/connector-gateway.service"
import { createInterpreter } from "../graph/interpreter.fixture"
import { HttpNode } from "../graph/nodes/http.node"
import { AgentExecutionService } from "./agent-execution.service"
import { RunLeaseService } from "./run-lease.service"
import { RunsService } from "./runs.service"

jest.mock("@linealabs/flags", () => ({ isFlagEnabled: jest.fn() }))
const flag = jest.mocked(isFlagEnabled)

const graph: WorkflowGraph = {
  version: 1,
  trigger: { type: "manual" },
  entryNodeId: "start",
  nodes: [
    { id: "start", type: "start", config: {} },
    { id: "first-approval", type: "approval", config: {} },
    { id: "second-approval", type: "approval", config: {} },
    ...["a", "b", "c", "d"].map((id) => ({
      id,
      type: "http" as const,
      config: { name: id },
    })),
  ],
  edges: ["first-approval", "second-approval", "a", "b", "c", "d"].map(
    (to) => ({ from: "start", to })
  ),
}

async function withRun(
  test: (run: {
    execute: () => Promise<void>
    approvePending: () => Promise<string>
    stepIds: () => Promise<(string | null)[]>
    status: () => Promise<string | undefined>
    parallelBranches: () => Promise<boolean | null | undefined>
    branchesStarted: () => number
    fireTimer: (nodeId: string) => Promise<void>
  }) => Promise<void>,
  workflow: WorkflowGraph = graph
): Promise<void> {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: "Parallel Runs Test Org",
      slug: `parallel-runs-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const [approver] = await db
    .insert(schema.users)
    .values({ name: "Approver", email: `parallel-${suffix}@test.dev` })
    .returning()
  try {
    await db.insert(schema.members).values({
      organizationId: organization.id,
      userId: approver.id,
      role: "member",
      createdAt: new Date(),
    })
    const { execution } = await seedExecution(db, organization.id, workflow)
    let arrived = 0
    let meet = () => {}
    const everyone = new Promise<void>((resolve) => (meet = resolve))
    const http = new HttpNode()
    // Each branch finishes only once all four are running, so one at a time would time out.
    jest.spyOn(http, "execute").mockImplementation(async () => {
      arrived += 1
      if (arrived === 4) meet()
      await everyone
      return {}
    })
    const checkpoints = new CheckpointsService()
    const runs = new RunsService(
      checkpoints,
      createInterpreter(checkpoints, { http: http }),
      new RunLeaseService(),
      new AgentExecutionService(checkpoints, new ConnectorGatewayService())
    )
    await test({
      execute: () => runs.execute(execution.id),
      approvePending: async () => {
        const pending =
          await repositories.approvalRequest.listPendingApprovalRequests(
            db,
            organization.id,
            approver.email
          )
        expect(pending).toHaveLength(1)
        await repositories.approvalRequest.decideWorkspaceApprovalRequest(
          db,
          organization.id,
          pending[0].id,
          {
            outcome: "approved",
            actorUserId: approver.id,
            actorEmail: approver.email,
          }
        )
        return pending[0].nodeId
      },
      stepIds: async () =>
        (await repositories.checkpoint.getStepsForExecution(db, execution.id))
          .filter(({ isSystemEvent }) => !isSystemEvent)
          .map(({ nodeId }) => nodeId),
      status: async () =>
        (await repositories.execution.getExecutionById(db, execution.id))
          ?.status,
      parallelBranches: async () =>
        (await repositories.execution.getExecutionById(db, execution.id))
          ?.parallelBranches,
      branchesStarted: () => arrived,
      fireTimer: (nodeId) => fireWaitTimer(db, execution.id, nodeId),
    })
  } finally {
    await pool.query("DELETE FROM organizations WHERE id = $1", [
      organization.id,
    ])
    await pool.query("DELETE FROM users WHERE id = $1", [approver.id])
  }
}

afterEach(() => jest.restoreAllMocks())
afterAll(async () => {
  await pool.end()
})

describe("runs with parallel branches", () => {
  it("runs branches together, then waits on one approval at a time and repeats nothing", () =>
    withRun(async (run) => {
      flag.mockResolvedValue(true)
      await run.execute()
      expect(run.branchesStarted()).toBe(4)
      expect(await run.status()).toBe("paused")
      expect(await run.approvePending()).toBe("first-approval")
      await run.execute()
      expect(await run.status()).toBe("paused")
      expect(await run.approvePending()).toBe("second-approval")
      await run.execute()
      expect(await run.status()).toBe("succeeded")
      const steps = await run.stepIds()
      expect([...steps].sort()).toEqual(graph.nodes.map(({ id }) => id).sort())
    }))

  it("runs one step at a time with the flag off", () =>
    withRun(async (run) => {
      flag.mockResolvedValue(false)
      await run.execute()
      expect(run.branchesStarted()).toBe(0)
      expect(await run.stepIds()).toEqual(["start"])
      expect(await run.approvePending()).toBe("first-approval")
    }))

  it.each([true, false])(
    "keeps the mode it started in (%s) when the flag changes",
    (startedParallel) =>
      withRun(async (run) => {
        flag.mockResolvedValue(startedParallel)
        await run.execute()
        flag.mockResolvedValue(!startedParallel)
        await run.approvePending()
        await run.execute()
        expect(await run.status()).toBe("paused")
        expect(run.branchesStarted()).toBe(startedParallel ? 4 : 0)
        expect(await run.parallelBranches()).toBe(startedParallel)
      })
  )

  it("asks for no second decision when the flag is turned off while it waits", () => {
    const waiting: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "start",
      nodes: [
        { id: "start", type: "start", config: {} },
        { id: "second", type: "approval", config: {} },
        { id: "first", type: "approval", config: {} },
        {
          id: "timer",
          type: "wait",
          config: { mode: "duration", amount: "1", unit: "hours" },
        },
      ],
      edges: ["first", "second", "timer"].map((to) => ({ from: "start", to })),
    }
    return withRun(async (run) => {
      flag.mockResolvedValue(true)
      await run.execute()
      flag.mockResolvedValue(false)
      await run.fireTimer("timer")
      await run.execute()
      expect(await run.status()).toBe("paused")
      expect(await run.approvePending()).toBe("first")
      await run.execute()
      expect(await run.approvePending()).toBe("second")
      await run.execute()
      expect(await run.status()).toBe("succeeded")
      expect([...(await run.stepIds())].sort()).toEqual(
        waiting.nodes.map(({ id }) => id).sort()
      )
    }, waiting)
  })

  it("keeps the order of decided steps with the flag off", () => {
    const decided: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "start",
      nodes: [
        { id: "start", type: "start", config: {} },
        { id: "listed-first", type: "approval", config: {} },
        { id: "asked-first", type: "approval", config: {} },
      ],
      edges: ["asked-first", "listed-first"].map((to) => ({
        from: "start",
        to,
      })),
    }
    return withRun(async (run) => {
      flag.mockResolvedValue(false)
      await run.execute()
      expect(await run.approvePending()).toBe("asked-first")
      await run.execute()
      expect(await run.approvePending()).toBe("listed-first")
      await run.execute()
      expect(await run.status()).toBe("succeeded")
      expect(await run.stepIds()).toEqual([
        "start",
        "listed-first",
        "asked-first",
      ])
    }, decided)
  })

  it("waits on timers and one decision together, and asks for the second only after the first, across resumes", () => {
    const wait = (id: string) => ({
      id,
      type: "wait" as const,
      config: { mode: "duration", amount: "1", unit: "hours" },
    })
    // Resuming scans nodes in this order, so without holding the decision "second" would be asked
    // for while "first" is still pending.
    const waiting: WorkflowGraph = {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "start",
      nodes: [
        { id: "start", type: "start", config: {} },
        { id: "second", type: "approval", config: {} },
        { id: "first", type: "approval", config: {} },
        wait("early"),
        wait("late"),
        { id: "after-early", type: "end", config: {} },
      ],
      edges: [
        { from: "start", to: "first" },
        { from: "start", to: "second" },
        { from: "start", to: "early" },
        { from: "start", to: "late" },
        { from: "early", to: "after-early" },
      ],
    }
    return withRun(async (run) => {
      flag.mockResolvedValue(true)
      await run.execute()
      expect(await run.status()).toBe("paused")
      await run.fireTimer("early")
      expect(await run.status()).toBe("queued")
      await run.execute()
      expect(await run.status()).toBe("paused")
      expect(await run.stepIds()).toEqual(["start", "early", "after-early"])
      expect(await run.approvePending()).toBe("first")
      await run.execute()
      expect(await run.status()).toBe("paused")
      expect(await run.approvePending()).toBe("second")
      await run.execute()
      expect(await run.status()).toBe("paused")
      await run.fireTimer("late")
      await run.execute()
      expect(await run.status()).toBe("succeeded")
      expect([...(await run.stepIds())].sort()).toEqual(
        waiting.nodes.map(({ id }) => id).sort()
      )
    }, waiting)
  })
})
