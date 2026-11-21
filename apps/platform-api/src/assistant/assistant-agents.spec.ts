import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { db, pool, repositories, schema } from '@linealabs/db'
import { workflowGraphSchema } from '@linealabs/runtime'
import { assertAgentsDeployed, listAgents } from './assistant-agents'
import { AssistantOutputError } from './assistant-output-error'

afterAll(async () => {
  await pool.end()
})

const contract = {
  inputSchema: { type: 'object', properties: { ticket: { type: 'string' } } },
  outputSchema: { type: 'object' },
}

async function applicationFixture() {
  const [workspace] = await db
    .insert(schema.organizations)
    .values({ name: 'Agents', slug: randomUUID(), createdAt: new Date() })
    .returning()
  const application = await repositories.application.createApplication(db, {
    workspaceId: workspace.id,
    name: 'Agents',
    slug: 'agents',
  })
  const environments = await repositories.environment.listEnvironments(
    db,
    workspace.id,
    application.id,
  )
  const dev = environments.find((item) => item.environment === 'dev')
  if (!dev) throw new Error('No Development Environment')
  return {
    workspaceId: workspace.id,
    applicationId: application.id,
    environmentId: dev.id,
  }
}

async function addAgent(
  scope: Awaited<ReturnType<typeof applicationFixture>>,
  name: string,
  deploy: boolean,
) {
  const agent = await repositories.agent.createAgent(db, {
    workspaceId: scope.workspaceId,
    applicationId: scope.applicationId,
    name,
    slug: randomUUID(),
    description: `${name} agent`,
  })
  if (!agent) throw new Error('Agent not created')
  const revision = await repositories.agentContract.createAgentContractRevision(
    db,
    scope.workspaceId,
    agent.id,
    contract,
  )
  if (revision.outcome !== 'created') throw new Error(revision.outcome)
  if (!deploy) return { agentId: agent.id, revisionId: revision.revision.id }
  const version = await repositories.agent.createAgentVersion(
    db,
    scope.workspaceId,
    agent.id,
    {
      definition: { version: 1, instructions: 'Triage', model: 'gpt-5' },
      agentContractRevisionId: revision.revision.id,
    },
  )
  if (version.outcome !== 'created') throw new Error(version.outcome)
  await repositories.agent.publishAgentVersion(
    db,
    scope.workspaceId,
    agent.id,
    version.version.id,
  )
  const binding =
    await repositories.environmentAgentBinding.putEnvironmentAgentBinding(
      db,
      scope.workspaceId,
      scope.environmentId,
      agent.id,
      {
        agentVersionId: version.version.id,
        agentContractRevisionId: revision.revision.id,
        enabled: true,
      },
    )
  if (binding.outcome !== 'updated') throw new Error(binding.outcome)
  return { agentId: agent.id, revisionId: revision.revision.id }
}

function graphWithAgent(config: Record<string, unknown>) {
  return workflowGraphSchema.parse({
    version: 1,
    trigger: { type: 'manual' },
    entryNodeId: 'start',
    nodes: [
      { id: 'start', type: 'start', config: { triggerType: 'manual' } },
      { id: 'triage', type: 'agent', config },
    ],
    edges: [{ from: 'start', to: 'triage' }],
  })
}

describe('assistant agents', () => {
  it('lists deployed Agents with the config and contract an agent node needs', async () => {
    const scope = await applicationFixture()
    const triage = await addAgent(scope, 'Triage', true)
    await addAgent(scope, 'Draft', false)
    const outcome = await listAgents(scope)
    expect(outcome.content).toContain(
      `{"agentId": "${triage.agentId}", "agentContractRevisionId": "${triage.revisionId}"}`,
    )
    expect(outcome.content).toContain('"ticket"')
    expect(outcome.content).toContain(
      '"Draft": Draft agent\n  Not deployed in Development',
    )
    expect(outcome.action).toEqual({ kind: 'list_agents', count: 2 })
  })

  it('accepts a graph using the deployed Contract revision', async () => {
    const scope = await applicationFixture()
    const triage = await addAgent(scope, 'Triage', true)
    const graph = graphWithAgent({
      agentId: triage.agentId,
      agentContractRevisionId: triage.revisionId,
    })
    await expect(assertAgentsDeployed(graph, scope)).resolves.toBeUndefined()
  })

  it('rejects an Agent that is not deployed, guessed, or from another Application', async () => {
    const scope = await applicationFixture()
    const other = await applicationFixture()
    const draft = await addAgent(scope, 'Draft', false)
    const foreign = await addAgent(other, 'Foreign', true)
    for (const agent of [draft, foreign]) {
      const graph = graphWithAgent({
        agentId: agent.agentId,
        agentContractRevisionId: agent.revisionId,
      })
      await expect(assertAgentsDeployed(graph, scope)).rejects.toThrow(
        AssistantOutputError,
      )
    }
  })
})
