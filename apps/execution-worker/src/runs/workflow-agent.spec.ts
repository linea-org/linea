import { createTestExecution } from "@linealabs/db/testing"
import "dotenv/config"
import { randomUUID } from "node:crypto"
import { createServer, type Server } from "node:http"
import { Test } from "@nestjs/testing"
import { registry } from "@linealabs/ai"
import { db, pool, repositories } from "@linealabs/db"
import { isFlagEnabled } from "@linealabs/flags"
import type { WorkflowGraph } from "@linealabs/runtime"
import { CheckpointsModule } from "../checkpoints/checkpoints.module"
import { GraphModule } from "../graph/graph.module"
import { AgentNode } from "../graph/nodes/agent.node"
import { ConnectorGatewayService } from "../connectors/connector-gateway.service"
import { AgentExecutionService } from "./agent-execution.service"
import { RunLeaseService } from "./run-lease.service"
import { RunsService } from "./runs.service"
import {
  createAgentExecutionFixture,
  removeWorkspace,
  type AgentExecutionFixture,
} from "./agent-execution.fixture"

jest.mock("@linealabs/flags", () => ({ isFlagEnabled: jest.fn() }))
const flag = jest.mocked(isFlagEnabled)
const onlyPlatformKey = (key: string) =>
  Promise.resolve(key === "platformModelKey")

const originalKey = process.env.OPENAI_API_KEY
const originalCredentialKeys = {
  active: process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY,
  keys: process.env.CONNECTION_CREDENTIAL_KEYS,
}
let fixture: AgentExecutionFixture
let provider: Server
const reads: string[] = []
let runs: RunsService
let moduleRef: Awaited<
  ReturnType<ReturnType<typeof Test.createTestingModule>["compile"]>
>

async function startWorkflow(
  agentId: string,
  agentContractRevisionId: string,
  externalSubjectRecordId?: string,
  graph: WorkflowGraph = {
    version: 1,
    trigger: { type: "manual" },
    entryNodeId: "run-agent",
    nodes: [
      {
        id: "run-agent",
        type: "agent",
        config: { agentId, agentContractRevisionId },
      },
    ],
    edges: [],
  }
) {
  const workflow = await repositories.workflow.createWorkflow(db, {
    applicationId: (
      await repositories.agent.getAgentById(db, fixture.workspaceId, agentId)
    )?.applicationId as string,
    workspaceId: fixture.workspaceId,
    name: "Reuses an Agent",
    slug: `reuse-${randomUUID()}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph,
    contentHash: randomUUID(),
  })
  return createTestExecution(db, {
    workspaceId: fixture.workspaceId,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    environmentId: fixture.environmentId,
    trigger: "manual",
    triggerPayload: { topic: "launch" },
    externalSubjectRecordId,
  })
}

function mockAgentReadsThroughConnection() {
  return jest
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
      text: JSON.stringify({ result: "read" }),
      tokensInput: 1,
      tokensOutput: 1,
    })
}

async function childOf(parentExecutionId: string) {
  const { rows } = await pool.query<{
    id: string
    external_subject_record_id: string | null
  }>(
    "SELECT id, external_subject_record_id FROM executions WHERE parent_execution_id = $1",
    [parentExecutionId]
  )
  return rows[0]
}

async function statusOf(executionId: string) {
  return (await repositories.execution.getExecutionById(db, executionId))
    ?.status
}

beforeAll(async () => {
  process.env.OPENAI_API_KEY = "deterministic-model-key"
  process.env.CONNECTION_CREDENTIAL_ACTIVE_KEY = "workflow-agent-test-v1"
  process.env.CONNECTION_CREDENTIAL_KEYS = JSON.stringify({
    "workflow-agent-test-v1": Buffer.alloc(32, 9).toString("base64"),
  })
  provider = createServer((request, response) => {
    const resourceId = (request.url ?? "").split("/").at(-1) ?? ""
    reads.push(resourceId)
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify({ resourceId, label: "recorded read" }))
  })
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve))
  const address = provider.address()
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
  flag.mockImplementation(onlyPlatformKey)
  fixture = await createAgentExecutionFixture()
  reads.length = 0
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
  await new Promise<void>((resolve, reject) =>
    provider.close((error) => (error ? reject(error) : resolve()))
  )
  delete process.env.DETERMINISTIC_CONNECTOR_BASE_URL
  await pool.end()
})

it("waits for the nested Agent, then continues with its Contract-valid result", async () => {
  jest.spyOn(registry["gpt-5"], "complete").mockResolvedValue({
    text: JSON.stringify({ result: "hello" }),
    tokensInput: 10,
    tokensOutput: 5,
  })
  const parent = await startWorkflow(fixture.agentId, fixture.contractId)
  await runs.execute(parent.id)
  expect(await statusOf(parent.id)).toBe("paused")
  const detail = await repositories.execution.getExecutionWithSteps(
    db,
    parent.id
  )
  expect(detail?.execution.status).toBe("paused")
  const [child] = await pool
    .query<{
      id: string
      agent_version_id: string
      agent_contract_revision_id: string
    }>(
      "SELECT id, agent_version_id, agent_contract_revision_id FROM executions WHERE parent_execution_id = $1",
      [parent.id]
    )
    .then((result) => result.rows)
  expect(child.agent_version_id).toBe(fixture.agentVersionId)
  expect(child.agent_contract_revision_id).toBe(fixture.contractId)
  await runs.execute(child.id)
  expect(await statusOf(child.id)).toBe("succeeded")
  expect(await statusOf(parent.id)).toBe("queued")
  await runs.execute(parent.id)
  expect(await statusOf(parent.id)).toBe("succeeded")
  const steps = await repositories.execution.getExecutionWithSteps(
    db,
    parent.id
  )
  expect(
    steps?.steps.find((step) => step.nodeId === "run-agent")?.output
  ).toEqual({ result: "hello" })
})

it("fails the Workflow step before any Agent work when the Agent is no longer deployed", async () => {
  const complete = jest.spyOn(registry["gpt-5"], "complete")
  await repositories.environmentAgentBinding.putEnvironmentAgentBinding(
    db,
    fixture.workspaceId,
    fixture.environmentId,
    fixture.agentId,
    {
      agentVersionId: fixture.agentVersionId,
      agentContractRevisionId: fixture.contractId,
      enabled: false,
    }
  )
  const parent = await startWorkflow(fixture.agentId, fixture.contractId)
  await runs.execute(parent.id)
  const result = await repositories.execution.getExecutionWithSteps(
    db,
    parent.id
  )
  expect(result?.execution.status).toBe("failed")
  expect(result?.execution.error?.message).toMatch(/not deployed and enabled/)
  expect(complete).not.toHaveBeenCalled()
})

it("gives the nested Agent the Workflow Execution's End-User subject, so it can read through that End User's Connection", async () => {
  mockAgentReadsThroughConnection()
  const parent = await startWorkflow(
    fixture.agentId,
    fixture.contractId,
    fixture.externalSubjectId
  )
  await runs.execute(parent.id)
  const child = await childOf(parent.id)
  expect(child.external_subject_record_id).toBe(fixture.externalSubjectId)
  await runs.execute(child.id)
  expect(await statusOf(child.id)).toBe("succeeded")
  expect(reads).toEqual(["one"])
  await runs.execute(parent.id)
  const result = await repositories.execution.getExecutionWithSteps(
    db,
    parent.id
  )
  expect(result?.execution.status).toBe("succeeded")
  expect(
    result?.steps.find((step) => step.nodeId === "run-agent")?.output
  ).toEqual({ result: "read" })
})

it("refuses the nested Agent's Connection read when the Workflow Execution has no End-User subject", async () => {
  mockAgentReadsThroughConnection()
  const parent = await startWorkflow(fixture.agentId, fixture.contractId)
  await runs.execute(parent.id)
  const child = await childOf(parent.id)
  expect(child.external_subject_record_id).toBeNull()
  await expect(runs.execute(child.id)).rejects.toThrow(
    "Connector operation rejected"
  )
  expect(reads).toEqual([])
})

it("stops the nested Agent before its next call once its Workflow Execution has ended", async () => {
  const complete = mockAgentReadsThroughConnection()
  const parent = await startWorkflow(
    fixture.agentId,
    fixture.contractId,
    fixture.externalSubjectId
  )
  await runs.execute(parent.id)
  const child = await childOf(parent.id)
  complete.mockReset()
  complete.mockImplementationOnce(async () => {
    await pool.query("UPDATE executions SET status = 'failed' WHERE id = $1", [
      parent.id,
    ])
    return {
      text: "",
      tokensInput: 7,
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
    }
  })
  await runs.execute(child.id)
  expect(reads).toEqual([])
  expect(complete).toHaveBeenCalledTimes(1)
  const stopped = await repositories.execution.getExecutionById(db, child.id)
  expect(stopped).toMatchObject({ status: "cancelled", tokensInput: 7 })
})

it("stops the nested Agent as cancelled, not failed, when its call is refused because the Workflow Execution ended", async () => {
  mockAgentReadsThroughConnection()
  const parent = await startWorkflow(
    fixture.agentId,
    fixture.contractId,
    fixture.externalSubjectId
  )
  await runs.execute(parent.id)
  const child = await childOf(parent.id)
  jest
    .spyOn(ConnectorGatewayService.prototype, "execute")
    .mockImplementationOnce(async () => {
      await pool.query(
        "UPDATE executions SET status = 'failed' WHERE id = $1",
        [parent.id]
      )
      throw new Error("Action Intent execution claim was lost")
    })
  await runs.execute(child.id)
  expect(await statusOf(child.id)).toBe("cancelled")
  const { rows } = await pool.query(
    "SELECT id FROM notifications WHERE workspace_id = $1 AND type = 'execution.failed'",
    [fixture.workspaceId]
  )
  expect(rows).toEqual([])
})

describe("the token budget of a Workflow Execution and its Agents", () => {
  const answer = (tokensInput: number) =>
    jest.spyOn(registry["gpt-5"], "complete").mockResolvedValue({
      text: JSON.stringify({ result: "hello" }),
      tokensInput,
      tokensOutput: 0,
    })

  async function pausedOnAgent() {
    const parent = await startWorkflow(fixture.agentId, fixture.contractId)
    await runs.execute(parent.id)
    return { parent, child: await childOf(parent.id) }
  }

  async function use(executionId: string, tokens: number) {
    await pool.query(
      `INSERT INTO execution_steps (execution_id, workspace_id, trace_id, span_id, name, started_at, ended_at, status, node_id, sequence, attempt, tokens_input)
       VALUES ($1::uuid, $2, $1::uuid::text, gen_random_uuid()::text, 'ai', now(), now(), 'succeeded', 'earlier', 1000, 1, $3)`,
      [executionId, fixture.workspaceId, tokens]
    )
  }

  async function addSibling(parentId: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO executions (workspace_id, environment_id, agent_id, agent_version_id, agent_contract_revision_id, environment, trigger, parent_execution_id, parent_node_id)
       SELECT workspace_id, environment_id, agent_id, agent_version_id, agent_contract_revision_id, environment, trigger, parent_execution_id, 'sibling'
       FROM executions WHERE parent_execution_id = $1 RETURNING id`,
      [parentId]
    )
    return rows[0].id
  }

  it.each(["its Workflow", "a sibling", "both"])(
    "stops an Agent once %s used it",
    async (who) => {
      flag.mockResolvedValue(true)
      const complete = answer(1)
      const { parent, child } = await pausedOnAgent()
      const sibling = await addSibling(parent.id)
      if (who === "its Workflow") await use(parent.id, 1_000_000)
      if (who === "a sibling") await use(sibling, 1_000_000)
      if (who === "both") {
        await use(parent.id, 400_000)
        await use(sibling, 600_000)
      }
      await expect(runs.execute(child.id)).rejects.toThrow("token budget")
      expect(complete).not.toHaveBeenCalled()
    }
  )

  it("leaves an Agent of another Execution alone", async () => {
    flag.mockResolvedValue(true)
    answer(1)
    const other = await pausedOnAgent()
    await use(other.parent.id, 1_000_000)
    await use(other.child.id, 1_000_000)
    const { child } = await pausedOnAgent()
    await runs.execute(child.id)
    expect(await statusOf(child.id)).toBe("succeeded")
  })

  it("keeps an Agent's own budget with the flag off", async () => {
    answer(1)
    const { parent, child } = await pausedOnAgent()
    await use(parent.id, 1_000_000)
    await runs.execute(child.id)
    expect(await statusOf(child.id)).toBe("succeeded")
  })

  it.each([
    [true, "failed"],
    [false, "succeeded"],
  ])(
    "counts its Agents in a Workflow Execution: flag %s, %s",
    async (on, status) => {
      if (on) flag.mockResolvedValue(true)
      answer(1_000_000)
      const { parent, child } = await pausedOnAgent()
      await runs.execute(child.id)
      expect(await statusOf(child.id)).toBe("succeeded")
      await runs.execute(parent.id)
      const finished = await repositories.execution.getExecutionById(
        db,
        parent.id
      )
      expect(finished?.status).toBe(status)
      if (on) expect(finished?.error?.message).toContain("token budget")
    }
  )
})

describe("a Workflow Execution with Agents in two branches", () => {
  beforeEach(() => {
    flag.mockResolvedValue(true)
    jest.spyOn(registry["gpt-5"], "complete").mockResolvedValue({
      text: JSON.stringify({ result: "hello" }),
      tokensInput: 1,
      tokensOutput: 1,
    })
  })

  function startBranches(extra: WorkflowGraph["nodes"] = []) {
    const agent = (id: string) => ({
      id,
      type: "agent" as const,
      config: {
        agentId: fixture.agentId,
        agentContractRevisionId: fixture.contractId,
      },
    })
    return startWorkflow(fixture.agentId, fixture.contractId, undefined, {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "start",
      nodes: [
        { id: "start", type: "start", config: {} },
        agent("one"),
        agent("two"),
        { id: "after-one", type: "end", config: {} },
        ...extra,
      ],
      edges: [
        { from: "start", to: "one" },
        { from: "start", to: "two" },
        { from: "one", to: "after-one" },
        ...extra.map(({ id }) => ({ from: "start", to: id })),
      ],
    })
  }

  async function children(parentId: string) {
    const { rows } = await pool.query<{
      id: string
      parent_node_id: string
      status: string
    }>(
      "SELECT id, parent_node_id, status FROM executions WHERE parent_execution_id = $1 ORDER BY parent_node_id",
      [parentId]
    )
    return rows
  }

  async function stepIds(executionId: string) {
    const steps = await repositories.checkpoint.getStepsForExecution(
      db,
      executionId
    )
    return steps
      .filter(({ isSystemEvent }) => !isSystemEvent)
      .map(({ nodeId }) => nodeId)
  }

  it("starts both, continues the branch that finishes first, and repeats nothing", async () => {
    const parent = await startBranches()
    await runs.execute(parent.id)
    expect(await statusOf(parent.id)).toBe("paused")
    const [one, two] = await children(parent.id)
    expect([one.status, two.status]).toEqual(["queued", "queued"])
    await runs.execute(one.id)
    expect(await statusOf(parent.id)).toBe("queued")
    await runs.execute(parent.id)
    expect(await statusOf(parent.id)).toBe("paused")
    expect(await stepIds(parent.id)).toEqual(["start", "one", "after-one"])
    await runs.execute(two.id)
    await runs.execute(parent.id)
    expect(await statusOf(parent.id)).toBe("succeeded")
    expect(await stepIds(parent.id)).toEqual([
      "start",
      "one",
      "after-one",
      "two",
    ])
  })

  it("starts one at a time with the flag off", async () => {
    flag.mockImplementation(onlyPlatformKey)
    const parent = await startBranches()
    await runs.execute(parent.id)
    expect(await children(parent.id)).toHaveLength(1)
    expect(await statusOf(parent.id)).toBe("paused")
  })

  it("does not lose an Agent that finishes between parking and pausing", async () => {
    const parent = await startBranches()
    const agentNode = moduleRef.get<AgentNode>(AgentNode)
    const real = new AgentNode()
    let finishedOne = false
    jest.spyOn(agentNode, "execute").mockImplementation(async (...args) => {
      try {
        return await real.execute(...args)
      } catch (error) {
        const rows = await children(parent.id)
        if (rows.length === 2 && !finishedOne) {
          finishedOne = true
          await runs.execute(rows[0].id)
        }
        throw error
      }
    })
    await runs.execute(parent.id)
    expect(finishedOne).toBe(true)
    expect(await stepIds(parent.id)).toEqual(["start", "one", "after-one"])
    expect(await statusOf(parent.id)).toBe("paused")
  })

  it("never stays paused with every Agent finished, however they race", async () => {
    for (let round = 0; round < 10; round += 1) {
      const parent = await startBranches()
      await Promise.all([
        runs.execute(parent.id),
        (async () => {
          let rows = await children(parent.id)
          while (rows.length < 2) rows = await children(parent.id)
          await Promise.all(rows.map(({ id }) => runs.execute(id)))
        })(),
      ])
      for (
        let pass = 0;
        pass < 4 && (await statusOf(parent.id)) === "queued";
        pass += 1
      ) {
        await runs.execute(parent.id)
      }
      expect(await statusOf(parent.id)).toBe("succeeded")
      expect([...(await stepIds(parent.id))].sort()).toEqual([
        "after-one",
        "one",
        "start",
        "two",
      ])
    }
  }, 60_000)

  it("cancels its Agents when another branch fails", async () => {
    const parent = await startBranches([
      { id: "broken", type: "http", config: {} },
    ])
    await runs.execute(parent.id)
    expect(await statusOf(parent.id)).toBe("failed")
    expect((await children(parent.id)).map(({ status }) => status)).toEqual([
      "cancelled",
      "cancelled",
    ])
  })

  it("cancels the open Agent when it is refused at its next claim", async () => {
    const parent = await startBranches()
    await runs.execute(parent.id)
    const [one, two] = await children(parent.id)
    await runs.execute(one.id)
    await pool.query(
      "UPDATE workflows SET archived_at = now() WHERE id = (SELECT workflow_id FROM executions WHERE id = $1)",
      [parent.id]
    )
    await runs.execute(parent.id)
    expect(await statusOf(parent.id)).toBe("failed")
    expect(await statusOf(one.id)).toBe("succeeded")
    expect(await statusOf(two.id)).toBe("cancelled")
  })

  it("leaves the Agents of a run another worker holds alone", async () => {
    const parent = await startBranches()
    await runs.execute(parent.id)
    await pool.query(
      "UPDATE executions SET status = 'running', leased_by = 'other', lease_expires_at = now() + interval '1 minute' WHERE id = $1",
      [parent.id]
    )
    await runs.execute(parent.id)
    expect((await children(parent.id)).map(({ status }) => status)).toEqual([
      "queued",
      "queued",
    ])
  })
})
