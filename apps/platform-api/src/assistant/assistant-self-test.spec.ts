import { AssistantSelfTest } from './assistant-self-test'

const scope = { workspaceId: 'w', applicationId: 'a', userId: 'u' }

function graphWith(node: Record<string, unknown>) {
  return {
    version: 1,
    trigger: { type: 'manual' },
    entryNodeId: 'start',
    nodes: [
      { id: 'start', type: 'start', config: { triggerType: 'manual' } },
      { id: 'step', ...node },
      { id: 'end', type: 'end', config: {} },
    ],
    edges: [
      { from: 'start', to: 'step' },
      { from: 'step', to: 'end' },
    ],
  }
}

describe('AssistantSelfTest', () => {
  const selfTest = new AssistantSelfTest()

  it('reports an invalid graph to the model without running it', async () => {
    const outcome = await selfTest.run(scope, { graph: { version: 1 } })
    expect(outcome.action).toBeNull()
    expect(outcome.content).toContain('Not run, the graph is invalid')
  })

  it.each([
    [
      { type: 'http', config: { url: 'https://x.dev', method: 'POST' } },
      'not GET',
    ],
    [
      {
        type: 'wait',
        config: { mode: 'duration', amount: 1, unit: 'seconds' },
      },
      'wait',
    ],
    [
      {
        type: 'ai',
        config: {
          tools: [{ name: 'save', url: 'https://x.dev', method: 'POST' }],
        },
      },
      'not GET',
    ],
    [
      {
        type: 'http',
        config: {
          url: 'https://x.dev',
          headers: { authorization: 'Bearer {{ secrets.CRM_KEY }}' },
        },
      },
      'sends a secret',
    ],
    [
      {
        type: 'ai',
        config: {
          mcpServers: [
            { name: 'x', url: 'https://x.dev', headers: { key: 'CRM_KEY' } },
          ],
        },
      },
      'connects to an MCP server',
    ],
    [{ type: 'agent', config: {} }, 'runs an Agent'],
  ])('refuses a draft whose run could have side effects', async (node, why) => {
    const outcome = await selfTest.run(scope, { graph: graphWith(node) })
    expect(outcome.action).toBeNull()
    expect(outcome.content).toContain(why)
  })

  it('refuses an input that is not a JSON object', async () => {
    const graph = graphWith({ type: 'http', config: { url: 'https://x.dev' } })
    const outcome = await selfTest.run(scope, { graph, input: [1, 2] })
    expect(outcome.content).toBe('Not run: input must be a JSON object.')
  })
})
