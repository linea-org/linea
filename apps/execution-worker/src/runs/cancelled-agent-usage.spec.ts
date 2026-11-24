import "dotenv/config"
import { randomUUID } from "node:crypto"
import { Logger } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { calculateCostMicros, registry } from "@linealabs/ai"
import type { CompletionResult } from "@linealabs/ai"
import { db, pool, repositories, schema } from "@linealabs/db"
import { seedRunning } from "@linealabs/db/testing"
import { CheckpointsModule } from "../checkpoints/checkpoints.module"
import { ConnectorGatewayService } from "../connectors/connector-gateway.service"
import { GraphModule } from "../graph/graph.module"
import { AgentExecutionService } from "./agent-execution.service"
import {
  createAgentExecutionFixture,
  removeWorkspace,
  type AgentExecutionFixture,
} from "./agent-execution.fixture"
import { RunLeaseService } from "./run-lease.service"
import { RunsService } from "./runs.service"

jest.setTimeout(30_000)

const originalKey = process.env.OPENAI_API_KEY
const originalCredentialKeys = {
  active: process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY,
  keys: process.env.CONNECTION_CREDENTIAL_KEYS,
}
let fixture: AgentExecutionFixture
let runs: RunsService
let lease: RunLeaseService
let moduleRef: Awaited<
  ReturnType<ReturnType<typeof Test.createTestingModule>["compile"]>
>
let logs: jest.SpyInstance[]

beforeAll(async () => {
  process.env.OPENAI_API_KEY = "deterministic-model-key"
  process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY = "cancelled-agent-test-v1"
  process.env.CONNECTION_CREDENTIAL_KEYS = JSON.stringify({
    "cancelled-agent-test-v1": Buffer.alloc(32, 5).toString("base64"),
  })
  moduleRef = await Test.createTestingModule({
    imports: [CheckpointsModule, GraphModule],
    providers: [
      RunsService,
      RunLeaseService,
      AgentExecutionService,
      ConnectorGatewayService,
    ],
  }).compile()
  runs = moduleRef.get(RunsService)
  lease = moduleRef.get(RunLeaseService)
})

beforeEach(async () => {
  fixture = await createAgentExecutionFixture()
  logs = (["log", "warn", "error"] as const).map((level) =>
    jest.spyOn(Logger.prototype, level).mockImplementation()
  )
})

afterEach(async () => {
  jest.restoreAllMocks()
  await removeWorkspace(fixture.workspaceId)
})

afterAll(async () => {
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = originalKey
  if (originalCredentialKeys.active === undefined)
    delete process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY
  else
    process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY = originalCredentialKeys.active
  if (originalCredentialKeys.keys === undefined)
    delete process.env.CONNECTION_CREDENTIAL_KEYS
  else process.env.CONNECTION_CREDENTIAL_KEYS = originalCredentialKeys.keys
  await moduleRef.close()
  await pool.end()
})

const answer: CompletionResult = {
  text: JSON.stringify({ result: "secret answer" }),
  tokensInput: 7,
  tokensOutput: 3,
}

async function start(): Promise<string> {
  const result = await repositories.agentExecution.startAgentExecution(db, {
    workspaceId: fixture.workspaceId,
    environmentId: fixture.environmentId,
    externalSubjectId: fixture.externalSubjectId,
    agentId: fixture.agentId,
    triggerPayload: {},
    idempotency: {
      actor: { kind: "environment_key", id: randomUUID() },
      key: randomUUID(),
      requestHash: randomUUID(),
    },
  })
  if (result.outcome !== "created") throw new Error("Agent did not start")
  return result.execution.id
}

/** Runs until its model call is in flight; `respond` lets that call return. */
async function runToModelCall(executionId: string) {
  let respond!: (result: CompletionResult) => void
  let loseLease!: () => void
  const inFlight = new Promise<void>((resolve) => {
    jest.spyOn(registry["gpt-5"], "complete").mockImplementationOnce(
      (_apiKey, request) =>
        new Promise((resolveCall, reject) => {
          respond = resolveCall
          request.signal?.addEventListener("abort", () =>
            reject(new Error("Request was aborted."))
          )
          resolve()
        })
    )
  })
  jest
    .spyOn(lease, "startHeartbeat")
    .mockImplementationOnce((_executionId, _leasedBy, onLeaseLost) => {
      loseLease = onLeaseLost!
    })
  const settled = runs.execute(executionId).then(
    () => "returned",
    (error: Error) => error.message
  )
  await inFlight
  return { respond, loseLease, settled }
}

async function cancelByKey(executionId: string): Promise<void> {
  const [key] = await db
    .insert(schema.environmentKeys)
    .values({
      workspaceId: fixture.workspaceId,
      environmentId: fixture.environmentId,
      name: "Cancels",
      scopes: ["executions:cancel"],
      hashedKey: randomUUID(),
      keyPrefix: randomUUID(),
    })
    .returning()
  const result = await repositories.publicRuntime.cancelPublicExecution(
    db,
    fixture.workspaceId,
    fixture.environmentId,
    executionId,
    {
      actor: { kind: "environment_key", id: key.id },
      key: randomUUID(),
      requestHash: randomUUID(),
    }
  )
  expect(result.outcome).toBe("cancelled")
}

async function cancelByFailedWorkflow(executionId: string): Promise<void> {
  const { execution: parent } = await seedRunning(db, fixture.workspaceId, {
    version: 1,
    trigger: { type: "manual" },
    entryNodeId: "run-agent",
    nodes: [{ id: "run-agent", type: "agent", config: {} }],
    edges: [],
  })
  await pool.query("UPDATE executions SET environment_id = $2 WHERE id = $1", [
    parent.id,
    fixture.environmentId,
  ])
  await pool.query(
    "UPDATE executions SET parent_execution_id = $2, parent_node_id = 'run-agent' WHERE id = $1",
    [executionId, parent.id]
  )
  const failed = await repositories.failedExecution.failExecution(
    db,
    parent.id,
    "worker-1",
    {
      error: { message: "another branch failed" },
      costMicros: 0n,
      costUnpriced: false,
      tokensInput: 0,
      tokensOutput: 0,
    }
  )
  expect(failed?.status).toBe("failed")
}

async function cancelByErasure(): Promise<void> {
  const [actor] = await db
    .insert(schema.users)
    .values({ name: "Admin", email: `${randomUUID()}@test.dev` })
    .returning()
  await db.transaction((tx) =>
    repositories.endUserContent.eraseExternalSubjectContent(tx, {
      workspaceId: fixture.workspaceId,
      externalSubjectId: fixture.externalSubjectId,
      actorUserId: actor.id,
      erasedAt: new Date(),
    })
  )
}

async function takeOver(executionId: string): Promise<void> {
  await pool.query(
    "UPDATE executions SET leased_by = 'other', lease_expires_at = now() + interval '1 minute' WHERE id = $1",
    [executionId]
  )
}

async function read(executionId: string) {
  const execution = await repositories.execution.getExecutionById(
    db,
    executionId
  )
  const steps = await repositories.checkpoint.getStepsForExecution(
    db,
    executionId
  )
  return { execution: execution!, steps }
}

function logged(): string {
  return logs
    .flatMap((log) => log.mock.calls.map(([message]) => String(message)))
    .join("\n")
}

function workspaceTokens(): Promise<number> {
  return repositories.executionStep.sumWorkspaceTokensSince(
    db,
    fixture.workspaceId,
    new Date(Date.now() - 60_000)
  )
}

describe("an Agent cancelled while its model call is in flight", () => {
  it.each([
    ["an Environment key", cancelByKey],
    ["its failed Workflow", cancelByFailedWorkflow],
    ["its End User's erasure", cancelByErasure],
  ])("by %s, counts the call that returns later", async (_by, cancel) => {
    const id = await start()
    const run = await runToModelCall(id)
    await cancel(id)
    const ended = await read(id)
    expect(ended.execution.status).toBe("cancelled")
    run.respond(answer)
    expect(await run.settled).toBe("returned")

    const { execution, steps } = await read(id)
    const cost = calculateCostMicros("gpt-5", 7, 3)
    expect(execution).toEqual({
      ...ended.execution,
      tokensInput: 7,
      tokensOutput: 3,
      costMicros: cost,
      costUnpriced: false,
      nextStepSequence: 1,
      sortKeysChangedAt: expect.any(Date) as Date,
    })
    expect(steps).toEqual([
      expect.objectContaining({
        name: "ai",
        nodeId: "agent:model:0",
        status: "failed",
        tokensInput: 7,
        tokensOutput: 3,
        costMicros: cost,
        input: null,
        output: null,
      }),
    ])
    expect(await workspaceTokens()).toBe(10)
    expect(JSON.stringify(steps[0].error)).not.toContain("secret")
    expect(logged()).not.toContain("another worker")
  })

  it("adds the call to what earlier calls used", async () => {
    const id = await start()
    jest.spyOn(registry["gpt-5"], "complete").mockResolvedValueOnce({
      text: "",
      tokensInput: 100,
      tokensOutput: 50,
      toolCalls: [
        {
          id: "read",
          name: "read",
          arguments: {
            connectionId: fixture.connectionId,
            input: { resourceId: "one" },
          },
        },
      ],
    })
    jest
      .spyOn(ConnectorGatewayService.prototype, "execute")
      .mockResolvedValueOnce({
        outcome: "succeeded",
        result: { resourceId: "one", label: "read" },
      } as never)
    const run = await runToModelCall(id)
    await cancelByKey(id)
    expect((await read(id)).execution).toMatchObject({
      tokensInput: 100,
      tokensOutput: 50,
    })
    run.respond(answer)
    await run.settled
    expect((await read(id)).execution).toMatchObject({
      tokensInput: 107,
      tokensOutput: 53,
    })
  })

  it("marks the cost partial when the call is aborted", async () => {
    const id = await start()
    const run = await runToModelCall(id)
    await cancelByKey(id)
    run.loseLease()
    expect(await run.settled).toBe("returned")

    const { execution, steps } = await read(id)
    expect(execution).toMatchObject({
      status: "cancelled",
      tokensInput: 0,
      tokensOutput: 0,
      costUnpriced: true,
    })
    expect(steps).toEqual([
      expect.objectContaining({
        nodeId: "agent:model:0",
        status: "failed",
        tokensInput: 0,
        tokensOutput: 0,
      }),
    ])
    expect(logged()).not.toContain("another worker")
  })

  it("marks the cost partial when the work budget aborts the call first", async () => {
    let endBudget!: () => void
    jest.spyOn(AbortSignal, "timeout").mockImplementationOnce(() => {
      const controller = new AbortController()
      endBudget = () => controller.abort()
      return controller.signal
    })
    const id = await start()
    const run = await runToModelCall(id)
    await cancelByKey(id)
    endBudget()
    expect(await run.settled).toBe("returned")
    const { execution, steps } = await read(id)
    expect(execution).toMatchObject({ status: "cancelled", costUnpriced: true })
    expect(steps).toHaveLength(1)
  })

  it("records no usage for a call the provider refused", async () => {
    const id = await start()
    const run = await runToModelCall(id)
    await cancelByKey(id)
    run.respond(Promise.reject(new Error("provider down")) as never)
    expect(await run.settled).toBe("returned")
    const { execution, steps } = await read(id)
    expect(execution.costUnpriced).toBe(false)
    expect(steps).toEqual([])
    expect(logged()).not.toContain("another worker")
  })
})

describe("the heartbeat of a run whose lease is gone", () => {
  it.each([
    ["was cancelled", cancelByKey, "was cancelled"],
    ["was taken over", takeOver, "to another worker"],
  ])("says it %s", async (_what, end, message) => {
    const id = await start()
    await repositories.execution.startExecution(
      db,
      id,
      "worker",
      new Date(Date.now() + 60_000)
    )
    await end(id)
    let beat!: () => void
    const interval = jest
      .spyOn(global, "setInterval")
      .mockImplementationOnce((callback) => {
        beat = callback as () => void
        return undefined as never
      })
    const lost = new Promise<void>((resolve) =>
      new RunLeaseService().startHeartbeat(id, "worker", resolve)
    )
    interval.mockRestore()
    beat()
    await lost
    while (!logged().includes("stopping heartbeat"))
      await new Promise((resolve) => setTimeout(resolve, 5))
    expect(logged()).toContain(message)
  })
})

describe("an Agent another worker took over during its model call", () => {
  it.each([
    ["keeps running", () => Promise.resolve()],
    ["is then cancelled", cancelByKey],
  ])("records nothing when the run %s", async (_then, then) => {
    const id = await start()
    const run = await runToModelCall(id)
    await takeOver(id)
    await then(id)
    run.respond(answer)
    expect(await run.settled).toContain("another worker")
    const { execution, steps } = await read(id)
    expect(execution).toMatchObject({ tokensInput: 0, tokensOutput: 0 })
    expect(steps).toEqual([])
  })

  it("records nothing while its expired lease can still be taken over", async () => {
    const id = await start()
    const run = await runToModelCall(id)
    await pool.query(
      "UPDATE executions SET lease_expires_at = now() - interval '1 second' WHERE id = $1",
      [id]
    )
    run.respond(answer)
    expect(await run.settled).toContain("another worker")
    const { execution, steps } = await read(id)
    expect(execution).toMatchObject({ status: "running", tokensInput: 0 })
    expect(steps).toEqual([])
  })

  it("records nothing for its aborted call either", async () => {
    const id = await start()
    const run = await runToModelCall(id)
    await takeOver(id)
    run.loseLease()
    expect(await run.settled).toBe("Request was aborted.")
    const { execution, steps } = await read(id)
    expect(execution.status).toBe("running")
    expect(steps).toEqual([])
  })
})
