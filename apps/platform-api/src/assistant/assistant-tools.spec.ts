import type { AssistantSelfTest } from './assistant-self-test'
import { GraphDraft } from './assistant-graph-draft'
import { AssistantTools, assistantTools } from './assistant-tools'

const scope = {
  workspaceId: 'w',
  applicationId: 'a',
  userId: 'u',
  workflowId: null,
  environmentId: 'e',
  web: false,
}
const selfTest = { run: jest.fn() } as unknown as AssistantSelfTest
const names = (on: Parameters<typeof assistantTools>[0]) =>
  assistantTools(on).map((tool) => tool.name)

describe('AssistantTools', () => {
  it('offers run history inside a workflow and the web tool when switched on', () => {
    expect(names({ web: false, workflowId: null })).toEqual([
      'edit_draft',
      'test_run_draft',
      'list_agents',
      'get_run',
    ])
    expect(names({ web: true, workflowId: 'wf' })).toEqual([
      'edit_draft',
      'test_run_draft',
      'list_agents',
      'get_recent_runs',
      'get_run',
      'fetch_url',
    ])
  })

  it('rejects a call to a tool it does not have', async () => {
    const outcome = await new AssistantTools(selfTest).run(
      { id: '1', name: 'delete_everything', arguments: {} },
      { ...scope, web: true },
      GraphDraft.from(undefined),
    )
    expect(outcome.action).toBeNull()
    expect(outcome.content).toContain(
      'Available tools: edit_draft, test_run_draft, list_agents, get_run, fetch_url',
    )
  })

  it.each(['fetch_url', 'get_recent_runs'])(
    'refuses %s when it was not offered',
    async (name) => {
      const outcome = await new AssistantTools(selfTest).run(
        { id: '1', name, arguments: { url: 'https://example.com' } },
        scope,
        GraphDraft.from(undefined),
      )
      expect(outcome.content).toContain('not valid')
    },
  )
})
