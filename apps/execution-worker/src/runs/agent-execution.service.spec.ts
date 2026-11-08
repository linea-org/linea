import "dotenv/config"
import { randomUUID } from "node:crypto"
import { createServer, type Server } from "node:http"
import { Test } from "@nestjs/testing"
import { Queue, Worker } from "bullmq"
import { registry, type CompletionResult } from "@linea/ai"
import { db, pool, repositories } from "@linea/db"
import { createConnection } from "@linea/queue"
import { CheckpointsModule } from "../checkpoints/checkpoints.module"
import { CheckpointsService } from "../checkpoints/checkpoints.service"
import { InterpreterService } from "../graph/interpreter.service"
import { GraphModule } from "../graph/graph.module"
import { ConnectorGatewayService } from "../connectors/connector-gateway.service"
import { AgentExecutionService } from "./agent-execution.service"
import { RunLeaseService } from "./run-lease.service"
import { RunsService } from "./runs.service"
import {
  createAgentExecutionFixture,
  type AgentExecutionFixture,
} from "./agent-execution.fixture"

const originalKey = process.env.OPENAI_API_KEY
const originalCredentialKeys = {
  active: process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY,
  keys: process.env.CONNECTION_CREDENTIAL_KEYS,
}
let server: Server
let fixture: AgentExecutionFixture
let runs: RunsService
let moduleRef: Awaited<
  ReturnType<ReturnType<typeof Test.createTestingModule>["compile"]>
>
const effects: string[] = []
const reads: string[] = []

async function start() {
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
  if (result.outcome !== "created")
    throw new Error(`Agent start failed: ${result.outcome}`)
  return result.execution
}

function modelTurn(resourceIds: string[]): CompletionResult {
  return {
    text: "",
    tokensInput: 10,
    tokensOutput: 5,
    toolCalls: resourceIds.map((resourceId, index) => ({
      id: `call-${index}`,
      name: "update",
      arguments: {
        connectionId: fixture.connectionId,
        input: {
          resourceId,
          value: "approved",
          secret: "fixture-input",
          expectedVersion: "v1",
        },
      },
    })),
  }
}

async function decide(executionId: string, outcome: "approved" | "rejected") {
  const approval =
    await repositories.approvalRequest.getPendingApprovalRequestForExecution(
      db,
      executionId
    )
  if (!approval) throw new Error("Pending approval missing")
  const decision =
    await repositories.approvalRequest.decideExternalApprovalRequest(db, {
      workspaceId: fixture.workspaceId,
      environmentId: fixture.environmentId,
      externalSubjectId: fixture.externalSubjectId,
      endUserSessionId: fixture.sessionId,
      approvalRequestId: approval.id,
      outcome,
      idempotencyKey: randomUUID(),
      now: new Date(),
    })
  expect(decision.outcome).toBe("decided")
  return approval.id
}

beforeAll(async () => {
  process.env.OPENAI_API_KEY = "deterministic-model-key"
  // The fixture encrypts a Connection credential, so the spec owns its key ring.
  process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY = "agent-execution-test-v1"
  process.env.CONNECTION_CREDENTIAL_KEYS = JSON.stringify({
    "agent-execution-test-v1": Buffer.alloc(32, 7).toString("base64"),
  })
  server = createServer((request, response) => {
    const path = request.url ?? ""
    response.setHeader("content-type", "application/json")
    if (path.endsWith("/version")) {
      response.end(JSON.stringify({ version: "v1" }))
    } else if (request.method === "PUT") {
      const resourceId = path.split("/").at(-1) ?? ""
      effects.push(resourceId)
      if (resourceId === "unknown") response.writeHead(504).end()
      else
        response.end(
          JSON.stringify({ resourceId, value: "approved", version: "v2" })
        )
    } else {
      const resourceId = path.split("/").at(-1) ?? ""
      reads.push(resourceId)
      response.end(JSON.stringify({ resourceId, label: "recorded read" }))
    }
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("Provider did not bind")
  process.env.DETERMINISTIC_CONNECTOR_BASE_URL = `http://127.0.0.1:${address.port}`
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
})

beforeEach(async () => {
  fixture = await createAgentExecutionFixture()
  effects.length = 0
  reads.length = 0
})

afterEach(async () => {
  jest.restoreAllMocks()
  await pool.query("DELETE FROM approval_requests WHERE workspace_id = $1", [
    fixture.workspaceId,
  ])
  await pool.query(
    "DELETE FROM connector_audit_facts WHERE workspace_id = $1",
    [fixture.workspaceId]
  )
  await pool.query("DELETE FROM organizations WHERE id = $1", [
    fixture.workspaceId,
  ])
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
  delete process.env.DETERMINISTIC_CONNECTOR_BASE_URL
  await moduleRef.close()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
  await pool.end()
})

it("pins a standalone Agent, separately approves two calls, and resumes with a new worker after redeployment", async () => {
  const model = jest
    .spyOn(registry["gpt-5"], "complete")
    .mockResolvedValueOnce(modelTurn(["one", "two"]))
    .mockResolvedValue({
      text: '{"result":"done"}',
      tokensInput: 3,
      tokensOutput: 2,
    })
  const execution = await start()
  expect(execution.workflowId).toBeNull()
  expect(execution.agentVersionId).toBe(fixture.agentVersionId)
  expect(execution.agentContractRevisionId).toBe(fixture.contractId)
  await runs.execute(execution.id)
  const firstApproval = await decide(execution.id, "approved")
  const newContract =
    await repositories.agentContract.createAgentContractRevision(
      db,
      fixture.workspaceId,
      fixture.agentId,
      { inputSchema: { type: "object" }, outputSchema: { type: "number" } }
    )
  if (newContract.outcome !== "created") throw new Error("New Contract failed")
  const newVersion = await repositories.agent.createAgentVersion(
    db,
    fixture.workspaceId,
    fixture.agentId,
    {
      agentContractRevisionId: newContract.revision.id,
      definition: {
        version: 1,
        instructions: "Changed instructions",
        model: "gpt-5",
        tools: [],
        maxIterations: 1,
      },
    }
  )
  if (newVersion.outcome !== "created") throw new Error("New version failed")
  await repositories.agent.publishAgentVersion(
    db,
    fixture.workspaceId,
    fixture.agentId,
    newVersion.version.id
  )
  await repositories.environmentAgentBinding.putEnvironmentAgentBinding(
    db,
    fixture.workspaceId,
    fixture.environmentId,
    fixture.agentId,
    {
      agentVersionId: newVersion.version.id,
      agentContractRevisionId: newContract.revision.id,
      enabled: true,
    }
  )
  const restarted = new RunsService(
    moduleRef.get(CheckpointsService),
    moduleRef.get(InterpreterService),
    new RunLeaseService(),
    new AgentExecutionService(
      moduleRef.get(CheckpointsService),
      new ConnectorGatewayService()
    )
  )
  await restarted.execute(execution.id)
  expect(effects).toEqual(["one"])
  const secondApproval = await decide(execution.id, "approved")
  expect(secondApproval).not.toBe(firstApproval)
  await restarted.execute(execution.id)
  await runs.execute(execution.id)
  const final = await repositories.execution.getExecutionById(db, execution.id)
  expect(final?.status).toBe("succeeded")
  expect(final?.output).toEqual({ result: "done" })
  expect(final?.agentVersionId).toBe(fixture.agentVersionId)
  expect(final?.agentContractRevisionId).toBe(fixture.contractId)
  expect(effects).toEqual(["one", "two"])
  expect(model).toHaveBeenCalledTimes(2)
})

it("keeps unknown outcomes terminal with no provider retry or redelivery write", async () => {
  jest
    .spyOn(registry["gpt-5"], "complete")
    .mockResolvedValue(modelTurn(["unknown", "never"]))
  const execution = await start()
  await runs.execute(execution.id)
  await decide(execution.id, "approved")
  await expect(runs.execute(execution.id)).rejects.toThrow("unknown")
  await runs.execute(execution.id)
  expect(effects).toEqual(["unknown"])
  const intent = await repositories.actionIntent.getActionIntentConsent(db, {
    workspaceId: fixture.workspaceId,
    executionId: execution.id,
    nodeId: "agent:tool:0:0",
    invocationIdempotencyKey: `${execution.id}:agent:tool:0:0`,
  })
  expect(intent?.intent.status).toBe("outcome_unknown")
})

it("stops after rejection while preserving a completed effect", async () => {
  jest
    .spyOn(registry["gpt-5"], "complete")
    .mockResolvedValue(modelTurn(["one", "two", "never"]))
  const execution = await start()
  await runs.execute(execution.id)
  await decide(execution.id, "approved")
  await runs.execute(execution.id)
  await decide(execution.id, "rejected")
  await expect(runs.execute(execution.id)).rejects.toThrow("rejected")
  expect(effects).toEqual(["one"])
  expect(
    (await repositories.execution.getExecutionById(db, execution.id))?.status
  ).toBe("failed")
})

it("consumes a real Redis delivery and does not repeat a completed read on duplicate delivery", async () => {
  const model = jest
    .spyOn(registry["gpt-5"], "complete")
    .mockResolvedValueOnce({
      text: "",
      tokensInput: 1,
      tokensOutput: 1,
      toolCalls: [
        {
          id: "read-one",
          name: "read",
          arguments: {
            connectionId: fixture.connectionId,
            input: { resourceId: "one" },
          },
        },
      ],
    })
    .mockResolvedValue({
      text: '{"result":"read"}',
      tokensInput: 1,
      tokensOutput: 1,
    })
  const execution = await start()
  const connection = createConnection()
  const queueName = `agent-execution-${randomUUID()}`
  const queue = new Queue(queueName, { connection })
  const worker = new Worker(queueName, async () => runs.execute(execution.id), {
    connection,
  })
  try {
    const delivered = new Promise<void>((resolve, reject) => {
      worker.once("completed", () => resolve())
      worker.once("failed", (_job, error) => reject(error))
    })
    await queue.add("execute", { executionId: execution.id })
    await delivered
    await runs.execute(execution.id)
    expect(reads).toEqual(["one"])
    expect(model).toHaveBeenCalledTimes(2)
    expect(
      (await repositories.execution.getExecutionById(db, execution.id))?.output
    ).toEqual({ result: "read" })
  } finally {
    await worker.close()
    await queue.obliterate({ force: true })
    await queue.close()
    await connection.quit()
  }
})

it("recovers a provider success lost before its checkpoint without creating a second effect", async () => {
  const model = jest
    .spyOn(registry["gpt-5"], "complete")
    .mockResolvedValueOnce(modelTurn(["one"]))
    .mockResolvedValue({
      text: '{"result":"recovered"}',
      tokensInput: 1,
      tokensOutput: 1,
    })
  const execution = await start()
  await runs.execute(execution.id)
  await decide(execution.id, "approved")
  const checkpoints = moduleRef.get(CheckpointsService)
  const checkpointWriter = new CheckpointsService()
  const interrupted = jest
    .spyOn(checkpoints, "recordStep")
    .mockImplementation(async (input) => {
      if (input.nodeType === "connector") {
        await pool.query(
          "UPDATE executions SET lease_expires_at = now() - interval '1 second' WHERE id = $1",
          [execution.id]
        )
        throw new Error("worker stopped before checkpoint")
      }
      return checkpointWriter.recordStep(input)
    })
  await expect(runs.execute(execution.id)).rejects.toThrow("worker stopped")
  interrupted.mockRestore()
  const restarted = new RunsService(
    new CheckpointsService(),
    moduleRef.get(InterpreterService),
    new RunLeaseService(),
    new AgentExecutionService(
      new CheckpointsService(),
      new ConnectorGatewayService()
    )
  )
  await restarted.execute(execution.id)
  expect(effects).toEqual(["one"])
  expect(model).toHaveBeenCalledTimes(2)
  expect(
    (await repositories.execution.getExecutionById(db, execution.id))?.output
  ).toEqual({ result: "recovered" })
})

it("rejects output outside the pinned Contract", async () => {
  jest.spyOn(registry["gpt-5"], "complete").mockResolvedValue({
    text: '{"unexpected":true}',
    tokensInput: 1,
    tokensOutput: 1,
  })
  const execution = await start()
  await expect(runs.execute(execution.id)).rejects.toThrow("pinned Contract")
  expect(
    (await repositories.execution.getExecutionById(db, execution.id))?.status
  ).toBe("failed")
})

async function failedSteps(executionId: string) {
  const { rows } = await pool.query<{
    name: string
    node_id: string
    error: { message: string } | null
  }>(
    "SELECT name, node_id, error FROM execution_steps WHERE execution_id = $1 AND status = 'failed' ORDER BY sequence",
    [executionId]
  )
  return rows
}

it("records a failed ai step when the model provider fails", async () => {
  jest
    .spyOn(registry["gpt-5"], "complete")
    .mockRejectedValue(new Error("provider unavailable"))
  const execution = await start()
  await expect(runs.execute(execution.id)).rejects.toThrow(
    "provider unavailable"
  )
  const [step, ...rest] = await failedSteps(execution.id)
  expect(rest).toEqual([])
  expect(step.name).toBe("ai")
  expect(step.node_id).toBe("agent:model:0")
  expect(step.error?.message).toBe("provider unavailable")
})

it("records a failed connector step when a tool call fails, but not for an approval pause", async () => {
  jest
    .spyOn(registry["gpt-5"], "complete")
    .mockResolvedValue(modelTurn(["unknown", "never"]))
  const execution = await start()
  await runs.execute(execution.id)
  expect(await failedSteps(execution.id)).toEqual([])
  await decide(execution.id, "approved")
  await expect(runs.execute(execution.id)).rejects.toThrow("unknown")
  expect(await failedSteps(execution.id)).toEqual([
    expect.objectContaining({
      name: "connector",
      node_id: "agent:tool:0:0",
    }),
  ])
})
