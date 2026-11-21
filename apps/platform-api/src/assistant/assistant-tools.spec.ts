import type { AssistantSelfTest } from './assistant-self-test'
import { AssistantTools, assistantTools } from './assistant-tools'

const scope = {
  workspaceId: 'w',
  applicationId: 'a',
  userId: 'u',
  workflowId: null,
  web: false,
}
const selfTest = { run: jest.fn() } as unknown as AssistantSelfTest
const names = (on: Parameters<typeof assistantTools>[0]) =>
  assistantTools(on).map((tool) => tool.name)

describe('AssistantTools', () => {
  it('offers run history inside a workflow and the web tool when switched on', () => {
    expect(names({ web: false, workflowId: null })).toEqual(['test_run_draft'])
    expect(names({ web: true, workflowId: 'wf' })).toEqual([
      'test_run_draft',
      'get_recent_runs',
      'get_run',
      'fetch_url',
    ])
  })

  it('rejects a call to a tool it does not have', async () => {
    const outcome = await new AssistantTools(selfTest).run(
      { id: '1', name: 'delete_everything', arguments: {} },
      { ...scope, web: true },
    )
    expect(outcome.action).toBeNull()
    expect(outcome.content).toContain(
      'Available tools: test_run_draft, fetch_url',
    )
  })

  it.each(['fetch_url', 'get_run'])(
    'refuses %s when it was not offered',
    async (name) => {
      const outcome = await new AssistantTools(selfTest).run(
        { id: '1', name, arguments: { url: 'https://example.com' } },
        scope,
      )
      expect(outcome.content).toContain('not valid')
    },
  )
})
