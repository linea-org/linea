import "dotenv/config"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linealabs/db"
import { seedExecution } from "@linealabs/db/testing"
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
    mostAtOnce: () => number
  }) => Promise<void>
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
    const { execution } = await seedExecution(db, organization.id, graph)
    let running = 0
    let most = 0
    const http = new HttpNode()
    jest.spyOn(http, "execute").mockImplementation(async () => {
      running += 1
      most = Math.max(most, running)
      await new Promise((resolve) => setTimeout(resolve, 10))
      running -= 1
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
      mostAtOnce: () => most,
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
      expect(run.mostAtOnce()).toBe(4)
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
      expect(run.mostAtOnce()).toBe(0)
      expect(await run.stepIds()).toEqual(["start"])
      expect(await run.approvePending()).toBe("first-approval")
    }))
})
