import type { ToolDefinition } from '@linealabs/ai'
import { db, repositories } from '@linealabs/db'
import type { WorkflowGraph } from '@linealabs/runtime'
import { AssistantOutputError } from './assistant-output-error'
import type { AssistantToolScope, ToolOutcome } from './assistant-tool-contract'

export const AGENTS_TOOL: ToolDefinition = {
  name: 'list_agents',
  description:
    'List this Application\'s Agents with the ids, input schema and output schema an "agent" node needs.',
  parameters: { type: 'object', properties: {} },
}

type AgentScope = Pick<
  AssistantToolScope,
  'workspaceId' | 'applicationId' | 'environmentId'
>

/** A draft uses an Agent only via its Contract revision deployed and enabled in Development. */
async function deployedAgents(scope: AgentScope) {
  const [agents, bindings] = await Promise.all([
    repositories.agent.listAgents(db, scope.workspaceId, scope.applicationId),
    repositories.environmentAgentBinding.listEnvironmentAgentBindings(
      db,
      scope.workspaceId,
      scope.environmentId,
    ),
  ])
  return agents
    .filter((agent) => !agent.archivedAt)
    .map((agent) => ({
      agent,
      binding: bindings.find(
        (item) => item.agentId === agent.id && item.enabled,
      ),
    }))
}

export async function listAgents(scope: AgentScope): Promise<ToolOutcome> {
  const agents = await deployedAgents(scope)
  const lines = await Promise.all(
    agents.map(async ({ agent, binding }) => {
      const description = agent.description ? `: ${agent.description}` : ''
      const title = `- "${agent.name}"${description}`
      if (!binding) {
        return `${title}\n  Not deployed in Development, so it cannot be used yet.`
      }
      const contract =
        await repositories.agentContract.getAgentContractRevision(
          db,
          scope.workspaceId,
          agent.id,
          binding.agentContractRevisionId,
        )
      if (!contract) {
        throw new Error(`Deployed Contract revision of ${agent.id} is missing`)
      }
      return [
        title,
        `  config: {"agentId": "${agent.id}", "agentContractRevisionId": "${contract.id}"}`,
        `  input schema: ${JSON.stringify(contract.inputSchema)}`,
        `  output schema: ${JSON.stringify(contract.outputSchema)}`,
      ].join('\n')
    }),
  )
  return {
    content: lines.length
      ? lines.join('\n')
      : 'This Application has no Agents.',
    action: { kind: 'list_agents', count: lines.length },
  }
}

export async function assertAgentsDeployed(
  graph: WorkflowGraph,
  scope: AgentScope,
): Promise<void> {
  const steps = graph.nodes.filter((node) => node.type === 'agent')
  if (steps.length === 0) return
  const agents = await deployedAgents(scope)
  for (const step of steps) {
    const usable = agents.some(
      ({ agent, binding }) =>
        binding &&
        step.config.agentId === agent.id &&
        step.config.agentContractRevisionId === binding.agentContractRevisionId,
    )
    if (!usable) {
      throw new AssistantOutputError(
        `Node "${step.id}" must use an agentId and agentContractRevisionId exactly as list_agents gives them, for an Agent deployed in Development.`,
      )
    }
  }
}
