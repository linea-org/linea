import { describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { executions } from "../schema/index.js"
import {
  createAgent,
  createAgentVersion,
  publishAgentVersion,
} from "./agent.repository.js"
import { createAgentContractRevision } from "./agent-contract.repository.js"
import { putEnvironmentAgentBinding } from "./environment-agent-binding.repository.js"
import {
  createExecution,
  getExecutionById,
  listWorkspaceExecutions,
  startExecution,
} from "./execution.repository.js"
import {
  claimPauseForNestedAgent,
  resumeParentOfFinishedExecution,
  startNestedAgentExecution,
} from "./nested-agent-execution.repository.js"
import {
  createTestFixtures,
  getTestDevelopmentEnvironmentId,
  withRollback,
} from "./test-utils.js"
import type { DbClient } from "./types.js"

type Tx = Parameters<typeof createTestFixtures>[0]

const definition = {
  version: 1,
  instructions: "Summarize",
  model: "gpt-5",
  tools: [],
  maxIterations: 2,
}

async function deployAgent(
  client: DbClient,
  workspaceId: string,
  applicationId: string,
  environmentId: string,
  slug: string,
  inputSchema: Record<string, unknown> = { type: "object" }
) {
  const agent = await createAgent(client, {
    workspaceId,
    applicationId,
    name: slug,
    slug,
  })
  if (!agent) throw new Error("Agent fixture failed")
  const contract = await createAgentContractRevision(
    client,
    workspaceId,
    agent.id,
    { inputSchema, outputSchema: { type: "string" } }
  )
  if (contract.outcome !== "created") throw new Error("Contract failed")
  const version = await createAgentVersion(client, workspaceId, agent.id, {
    definition,
    agentContractRevisionId: contract.revision.id,
  })
  if (version.outcome !== "created") throw new Error("Version failed")
  await publishAgentVersion(client, workspaceId, agent.id, version.version.id)
  await putEnvironmentAgentBinding(
    client,
    workspaceId,
    environmentId,
    agent.id,
    {
      agentVersionId: version.version.id,
      agentContractRevisionId: contract.revision.id,
      enabled: true,
    }
  )
  return { agent, version: version.version, contract: contract.revision }
}

async function fixture(client: Tx) {
  const base = await createTestFixtures(client)
  const environmentId = await getTestDevelopmentEnvironmentId(
    client,
    base.organization.id,
    base.workflow.id
  )
  const parent = await createExecution(client, {
    workspaceId: base.organization.id,
    workflowId: base.workflow.id,
    workflowVersionId: base.version.id,
    environmentId,
    trigger: "manual",
  })
  return { ...base, environmentId, parent }
}

describe("startNestedAgentExecution", () => {
  it("pins the deployed version once, keeps the pin after redeploy, and stays out of root lists", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const deployed = await deployAgent(
        tx,
        f.organization.id,
        f.workflow.applicationId,
        f.environmentId,
        "reuse"
      )
      const start = () =>
        startNestedAgentExecution(tx, {
          workspaceId: f.organization.id,
          parentExecutionId: f.parent.id,
          nodeId: "run-agent",
          agentId: deployed.agent.id,
          input: { topic: "a" },
        })
      const first = await start()
      if (first.outcome !== "created") throw new Error(first.outcome)
      expect(first.execution.agentVersionId).toBe(deployed.version.id)
      expect(first.execution.agentContractRevisionId).toBe(deployed.contract.id)
      expect(first.execution.parentExecutionId).toBe(f.parent.id)
      const newVersion = await createAgentVersion(
        tx,
        f.organization.id,
        deployed.agent.id,
        {
          definition,
          agentContractRevisionId: deployed.contract.id,
        }
      )
      if (newVersion.outcome !== "created") throw new Error("Version failed")
      await publishAgentVersion(
        tx,
        f.organization.id,
        deployed.agent.id,
        newVersion.version.id
      )
      await putEnvironmentAgentBinding(
        tx,
        f.organization.id,
        f.environmentId,
        deployed.agent.id,
        {
          agentVersionId: newVersion.version.id,
          agentContractRevisionId: deployed.contract.id,
          enabled: true,
        }
      )
      const second = await start()
      expect(second.outcome).toBe("existing")
      if (second.outcome !== "existing") throw new Error(second.outcome)
      expect(second.execution.id).toBe(first.execution.id)
      expect(second.execution.agentVersionId).toBe(deployed.version.id)
      const page = await listWorkspaceExecutions(tx, f.organization.id)
      expect(page.executions.map((row) => row.id)).toEqual([f.parent.id])
      expect(page.total).toBe(1)
    })
  })

  it("refuses an undeployed Agent, another Application's Agent and a Contract-invalid input before creating anything", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const other = await createTestFixtures(tx)
      const otherEnvironment = await getTestDevelopmentEnvironmentId(
        tx,
        other.organization.id,
        other.workflow.id
      )
      const foreign = await deployAgent(
        tx,
        other.organization.id,
        other.workflow.applicationId,
        otherEnvironment,
        "foreign"
      )
      const undeployed = await createAgent(tx, {
        workspaceId: f.organization.id,
        applicationId: f.workflow.applicationId,
        name: "idle",
        slug: "idle",
      })
      if (!undeployed) throw new Error("Agent fixture failed")
      const strict = await deployAgent(
        tx,
        f.organization.id,
        f.workflow.applicationId,
        f.environmentId,
        "strict",
        {
          type: "object",
          required: ["topic"],
          properties: { topic: { type: "string" } },
        }
      )
      const attempt = (agentId: string, input: Record<string, unknown>) =>
        startNestedAgentExecution(tx, {
          workspaceId: f.organization.id,
          parentExecutionId: f.parent.id,
          nodeId: "n",
          agentId,
          input,
        })
      expect((await attempt(foreign.agent.id, {})).outcome).toBe(
        "agent_not_in_application"
      )
      expect((await attempt(undeployed.id, {})).outcome).toBe("not_deployed")
      expect((await attempt(strict.agent.id, {})).outcome).toBe("input_invalid")
      const children = await tx
        .select()
        .from(executions)
        .where(eq(executions.parentExecutionId, f.parent.id))
      expect(children).toEqual([])
    })
  })

  it("pauses the parent while the child is open and re-queues it only once the child finishes", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const deployed = await deployAgent(
        tx,
        f.organization.id,
        f.workflow.applicationId,
        f.environmentId,
        "wait"
      )
      const started = await startNestedAgentExecution(tx, {
        workspaceId: f.organization.id,
        parentExecutionId: f.parent.id,
        nodeId: "n",
        agentId: deployed.agent.id,
        input: {},
      })
      if (started.outcome !== "created") throw new Error(started.outcome)
      await startExecution(tx, f.parent.id, "a", new Date(Date.now() + 60_000))
      await resumeParentOfFinishedExecution(tx, started.execution.id)
      expect((await getExecutionById(tx, f.parent.id))?.status).toBe("running")
      const claim = (leasedBy: string) =>
        claimPauseForNestedAgent(
          tx,
          f.organization.id,
          f.parent.id,
          "n",
          leasedBy
        )
      expect(await claim("someone-else")).toEqual({ outcome: "lease-lost" })
      expect(await claim("a")).toEqual({ outcome: "paused" })
      await resumeParentOfFinishedExecution(tx, started.execution.id)
      expect((await getExecutionById(tx, f.parent.id))?.status).toBe("paused")
      await tx
        .update(executions)
        .set({ status: "succeeded", output: "done" })
        .where(eq(executions.id, started.execution.id))
      await resumeParentOfFinishedExecution(tx, started.execution.id)
      expect((await getExecutionById(tx, f.parent.id))?.status).toBe("queued")
      expect(await claim("a")).toEqual({ outcome: "already-decided" })
    })
  })
})
