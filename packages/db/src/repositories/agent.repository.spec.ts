import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import {
  agents,
  applications,
  environments,
  organizations,
} from "../schema/index.js"
import {
  createTestFixtures,
  getTestDevelopmentEnvironmentId,
  withRollback,
} from "./test-utils.js"
import {
  createAgent,
  createAgentVersion,
  getAgentById,
  getAgentVersionById,
  listAgents,
  publishAgentVersion,
} from "./agent.repository.js"
import {
  createAgentContractRevision,
  getAgentContractRevision,
} from "./agent-contract.repository.js"
import {
  listEnvironmentAgentBindings,
  putEnvironmentAgentBinding,
  type PutEnvironmentAgentBindingInput,
} from "./environment-agent-binding.repository.js"
import type { DbClient } from "./types.js"

const definition = {
  version: 1,
  instructions: "Resolve the requested GitHub task",
  model: "gpt-5",
  tools: [],
  maxIterations: 4,
}

async function createFixture(client: DbClient) {
  const fixture = await client.transaction((tx) => createTestFixtures(tx))
  const agent = await createAgent(client, {
    workspaceId: fixture.organization.id,
    applicationId: fixture.workflow.applicationId,
    name: "Task agent",
    slug: "task-agent",
  })
  if (!agent) throw new Error("Agent fixture creation failed")
  const contract = await createAgentContractRevision(
    client,
    fixture.organization.id,
    agent.id,
    { inputSchema: { type: "object" }, outputSchema: { type: "string" } }
  )
  if (contract.outcome !== "created")
    throw new Error("Agent Contract fixture creation failed")
  const result = await createAgentVersion(
    client,
    fixture.organization.id,
    agent.id,
    { definition, agentContractRevisionId: contract.revision.id }
  )
  if (result.outcome !== "created")
    throw new Error("Agent version fixture creation failed")
  const environmentId = await getTestDevelopmentEnvironmentId(
    client,
    fixture.organization.id,
    fixture.workflow.id
  )
  return {
    ...fixture,
    agent,
    contract: contract.revision,
    agentVersion: result.version,
    environmentId,
  }
}

describe("Agent definitions", () => {
  it("isolates Agents, Contracts and versions by workspace and Application", async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx)
      const other = await createTestFixtures(tx)
      expect(
        await getAgentById(tx, other.organization.id, fixture.agent.id)
      ).toBeUndefined()
      expect(
        await listAgents(
          tx,
          fixture.organization.id,
          other.workflow.applicationId
        )
      ).toEqual([])
      expect(
        await getAgentVersionById(
          tx,
          other.organization.id,
          fixture.agent.id,
          fixture.agentVersion.id
        )
      ).toBeUndefined()
      expect(
        await getAgentContractRevision(
          tx,
          other.organization.id,
          fixture.agent.id,
          fixture.contract.id
        )
      ).toBeUndefined()
      expect(
        await createAgentVersion(tx, other.organization.id, fixture.agent.id, {
          definition,
          agentContractRevisionId: fixture.contract.id,
        })
      ).toEqual({ outcome: "agent_not_found" })
      expect(
        await createAgent(tx, {
          workspaceId: fixture.organization.id,
          applicationId: fixture.agent.applicationId,
          name: "Duplicate",
          slug: fixture.agent.slug,
        })
      ).toBeUndefined()
    })
  })
  it("requires an explicit Contract belonging to the same Agent", async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx)
      const otherAgent = await createAgent(tx, {
        workspaceId: fixture.organization.id,
        applicationId: fixture.agent.applicationId,
        name: "Other",
        slug: "other",
      })
      expect(otherAgent).toBeDefined()
      if (!otherAgent) throw new Error("Agent fixture missing")
      expect(
        await createAgentVersion(tx, fixture.organization.id, otherAgent.id, {
          definition,
          agentContractRevisionId: fixture.contract.id,
        })
      ).toEqual({ outcome: "contract_revision_not_found" })
    })
  })
  it("binds only published versions with the exact Contract in the same Application", async () => {
    await withRollback(async (tx) => {
      const f = await createFixture(tx)
      const input = {
        agentVersionId: f.agentVersion.id,
        agentContractRevisionId: f.contract.id,
        enabled: true,
      }
      expect(
        await putEnvironmentAgentBinding(
          tx,
          f.organization.id,
          f.environmentId,
          f.agent.id,
          input
        )
      ).toEqual({ outcome: "version_not_found" })
      await publishAgentVersion(
        tx,
        f.organization.id,
        f.agent.id,
        f.agentVersion.id
      )
      const binding = await putEnvironmentAgentBinding(
        tx,
        f.organization.id,
        f.environmentId,
        f.agent.id,
        input
      )
      expect(binding.outcome).toBe("updated")
      const next = await createAgentContractRevision(
        tx,
        f.organization.id,
        f.agent.id,
        { inputSchema: { type: "string" }, outputSchema: {} }
      )
      if (next.outcome !== "created")
        throw new Error("Contract fixture missing")
      expect(
        await putEnvironmentAgentBinding(
          tx,
          f.organization.id,
          f.environmentId,
          f.agent.id,
          { ...input, agentContractRevisionId: next.revision.id }
        )
      ).toEqual({ outcome: "version_not_found" })
      const other = await createFixture(tx)
      expect(
        await putEnvironmentAgentBinding(
          tx,
          other.organization.id,
          other.environmentId,
          f.agent.id,
          input
        )
      ).toEqual({ outcome: "agent_not_found" })
      const [application] = await tx
        .insert(applications)
        .values({
          workspaceId: f.organization.id,
          name: "Other app",
          slug: "other-app",
        })
        .returning()
      const otherAgent = await createAgent(tx, {
        workspaceId: f.organization.id,
        applicationId: application.id,
        name: "Other",
        slug: "other",
      })
      if (!otherAgent) throw new Error("Agent fixture missing")
      expect(
        await putEnvironmentAgentBinding(
          tx,
          f.organization.id,
          f.environmentId,
          otherAgent.id,
          input
        )
      ).toEqual({ outcome: "agent_not_found" })
      expect(
        await listEnvironmentAgentBindings(
          tx,
          f.organization.id,
          f.environmentId
        )
      ).toHaveLength(1)
      expect(
        await listEnvironmentAgentBindings(
          tx,
          other.organization.id,
          f.environmentId
        )
      ).toEqual([])
    })
  })
  it("publishes idempotently without silently rebinding an Environment", async () => {
    await withRollback(async (tx) => {
      const f = await createFixture(tx)
      const first = await publishAgentVersion(
        tx,
        f.organization.id,
        f.agent.id,
        f.agentVersion.id
      )
      expect(first?.publishedAt).toBeInstanceOf(Date)
      expect(
        await publishAgentVersion(
          tx,
          f.organization.id,
          f.agent.id,
          f.agentVersion.id
        )
      ).toEqual(first)
      expect(
        await publishAgentVersion(
          tx,
          randomUUID(),
          f.agent.id,
          f.agentVersion.id
        )
      ).toBeUndefined()
      await putEnvironmentAgentBinding(
        tx,
        f.organization.id,
        f.environmentId,
        f.agent.id,
        {
          agentVersionId: f.agentVersion.id,
          agentContractRevisionId: f.contract.id,
          enabled: true,
        }
      )
      const next = await createAgentVersion(tx, f.organization.id, f.agent.id, {
        definition: { ...definition, instructions: "Updated instructions" },
        agentContractRevisionId: f.contract.id,
      })
      if (next.outcome !== "created") throw new Error("Version fixture missing")
      await publishAgentVersion(
        tx,
        f.organization.id,
        f.agent.id,
        next.version.id
      )
      expect(
        await listEnvironmentAgentBindings(
          tx,
          f.organization.id,
          f.environmentId
        )
      ).toMatchObject([{ agentVersionId: f.agentVersion.id }])
      await tx
        .update(agents)
        .set({ archivedAt: new Date() })
        .where(eq(agents.id, f.agent.id))
      expect(
        await publishAgentVersion(
          tx,
          f.organization.id,
          f.agent.id,
          next.version.id
        )
      ).toBeUndefined()
      expect(
        await putEnvironmentAgentBinding(
          tx,
          f.organization.id,
          f.environmentId,
          f.agent.id,
          {
            agentVersionId: next.version.id,
            agentContractRevisionId: f.contract.id,
            enabled: true,
          }
        )
      ).toEqual({ outcome: "agent_not_found" })
    })
  })
  it("disables an archived Agent's existing binding without allowing new deployments", async () => {
    await withRollback(async (tx) => {
      const f = await createFixture(tx)
      const input = {
        agentVersionId: f.agentVersion.id,
        agentContractRevisionId: f.contract.id,
        enabled: false,
      }
      const bind = (value: PutEnvironmentAgentBindingInput) =>
        putEnvironmentAgentBinding(
          tx,
          f.organization.id,
          f.environmentId,
          f.agent.id,
          value
        )
      await publishAgentVersion(
        tx,
        f.organization.id,
        f.agent.id,
        f.agentVersion.id
      )
      expect(await bind({ ...input, enabled: true })).toMatchObject({
        outcome: "updated",
        binding: { ...input, enabled: true },
      })
      const contract = await createAgentContractRevision(
        tx,
        f.organization.id,
        f.agent.id,
        { inputSchema: {}, outputSchema: {} }
      )
      if (contract.outcome !== "created")
        throw new Error("Contract fixture missing")
      const next = await createAgentVersion(tx, f.organization.id, f.agent.id, {
        definition,
        agentContractRevisionId: contract.revision.id,
      })
      if (next.outcome !== "created") throw new Error("Version fixture missing")
      await publishAgentVersion(
        tx,
        f.organization.id,
        f.agent.id,
        next.version.id
      )
      await tx
        .update(agents)
        .set({ archivedAt: new Date() })
        .where(eq(agents.id, f.agent.id))
      expect(await bind(input)).toMatchObject({
        outcome: "updated",
        binding: input,
      })
      expect(await bind(input)).toMatchObject({ outcome: "updated" })
      expect(await bind({ ...input, enabled: true })).toEqual({
        outcome: "agent_not_found",
      })
      expect(
        await bind({
          ...input,
          agentVersionId: next.version.id,
          agentContractRevisionId: contract.revision.id,
        })
      ).toEqual({ outcome: "agent_not_found" })
      expect(
        await bind({ ...input, agentContractRevisionId: contract.revision.id })
      ).toEqual({ outcome: "agent_not_found" })
      expect(await bind({ ...input, agentVersionId: next.version.id })).toEqual(
        { outcome: "agent_not_found" }
      )
      const [production] = await tx
        .insert(environments)
        .values({
          workspaceId: f.organization.id,
          applicationId: f.agent.applicationId,
          environment: "production",
          displayName: "Production",
        })
        .returning()
      expect(
        await putEnvironmentAgentBinding(
          tx,
          f.organization.id,
          production.id,
          f.agent.id,
          input
        )
      ).toEqual({ outcome: "agent_not_found" })
      expect(
        await listEnvironmentAgentBindings(tx, f.organization.id, production.id)
      ).toEqual([])
      expect(
        await listEnvironmentAgentBindings(
          tx,
          f.organization.id,
          f.environmentId
        )
      ).toMatchObject([input])
    })
  })
  it("serializes concurrent version and Contract numbering", async () => {
    const f = await createFixture(db)
    try {
      const versions = await Promise.all(
        Array.from({ length: 4 }, () =>
          createAgentVersion(db, f.organization.id, f.agent.id, {
            definition,
            agentContractRevisionId: f.contract.id,
          })
        )
      )
      expect(
        versions
          .map((result) =>
            result.outcome === "created" ? result.version.version : undefined
          )
          .sort()
      ).toEqual([2, 3, 4, 5])
      const contracts = await Promise.all(
        Array.from({ length: 4 }, () =>
          createAgentContractRevision(db, f.organization.id, f.agent.id, {
            inputSchema: {},
            outputSchema: {},
          })
        )
      )
      expect(
        contracts
          .map((result) =>
            result.outcome === "created" ? result.revision.revision : undefined
          )
          .sort()
      ).toEqual([2, 3, 4, 5])
    } finally {
      await db
        .delete(organizations)
        .where(eq(organizations.id, f.organization.id))
    }
  })
  it("enforces immutability and ownership even through direct SQL", async () => {
    const f = await createFixture(db)
    try {
      await expect(
        pool.query(
          "UPDATE agent_contract_revisions SET input_schema = '{}' WHERE id = $1",
          [f.contract.id]
        )
      ).rejects.toThrow(/immutable/i)
      await expect(
        pool.query("DELETE FROM agent_contract_revisions WHERE id = $1", [
          f.contract.id,
        ])
      ).rejects.toThrow(/immutable/i)
      await expect(
        pool.query(
          "UPDATE agent_versions SET definition = '{}' WHERE id = $1",
          [f.agentVersion.id]
        )
      ).rejects.toThrow(/immutable/i)
      await expect(
        pool.query(
          "UPDATE agent_versions SET agent_contract_revision_id = $1 WHERE id = $2",
          [randomUUID(), f.agentVersion.id]
        )
      ).rejects.toThrow(/immutable/i)
      await expect(
        pool.query("DELETE FROM agent_versions WHERE id = $1", [
          f.agentVersion.id,
        ])
      ).rejects.toThrow(/immutable/i)
      await publishAgentVersion(
        db,
        f.organization.id,
        f.agent.id,
        f.agentVersion.id
      )
      await expect(
        pool.query(
          "UPDATE agent_versions SET published_at = NULL WHERE id = $1",
          [f.agentVersion.id]
        )
      ).rejects.toThrow(/immutable/i)
      await expect(
        pool.query(
          "INSERT INTO agents (workspace_id, application_id, name, slug) VALUES ($1, $2, 'Invalid', 'invalid')",
          [randomUUID(), f.agent.applicationId]
        )
      ).rejects.toThrow(/agents_application_fkey/)
      await expect(
        pool.query(
          "INSERT INTO environment_agent_bindings (workspace_id, environment_id, application_id, agent_version_id, agent_id, agent_contract_revision_id) VALUES ($1, $2, $3, $4, $5, $6)",
          [
            f.organization.id,
            f.environmentId,
            f.agent.applicationId,
            f.agentVersion.id,
            f.agent.id,
            randomUUID(),
          ]
        )
      ).rejects.toThrow(
        /environment_agent_bindings_(version|contract_revision)_fkey/
      )
    } finally {
      await db
        .delete(organizations)
        .where(eq(organizations.id, f.organization.id))
    }
  })
})
