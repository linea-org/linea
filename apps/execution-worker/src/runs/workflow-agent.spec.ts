import "dotenv/config"
import { randomUUID } from "node:crypto"
import { Test } from "@nestjs/testing"
import { registry } from "@linea/ai"
import { db, pool, repositories } from "@linea/db"
import type { WorkflowGraph } from "@linea/runtime"
import { CheckpointsModule } from "../checkpoints/checkpoints.module"
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
let fixture: AgentExecutionFixture
let runs: RunsService
let moduleRef: Awaited<
  ReturnType<ReturnType<typeof Test.createTestingModule>["compile"]>
>

async function startWorkflow(agentId: string, agentContractRevisionId: string) {
  const graph: WorkflowGraph = {
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
  return repositories.execution.createExecution(db, {
    workspaceId: fixture.workspaceId,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    environmentId: fixture.environmentId,
    trigger: "manual",
    triggerPayload: { topic: "launch" },
  })
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
})

afterEach(async () => {
  jest.restoreAllMocks()
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
  await moduleRef.close()
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
