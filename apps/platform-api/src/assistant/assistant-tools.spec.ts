import type { AssistantSelfTest } from './assistant-self-test'
import { AssistantTools, assistantTools } from './assistant-tools'

const scope = { workspaceId: 'w', applicationId: 'a', userId: 'u' }
const selfTest = { run: jest.fn() } as unknown as AssistantSelfTest

describe('AssistantTools', () => {
  it('always offers the self-test, and the web tool only when switched on', () => {
    expect(assistantTools({ web: false }).map((tool) => tool.name)).toEqual([
      'test_run_draft',
    ])
    expect(assistantTools({ web: true }).map((tool) => tool.name)).toEqual([
      'test_run_draft',
      'fetch_url',
    ])
  })

  it('rejects a call to a tool it does not have', async () => {
    const outcome = await new AssistantTools(selfTest).run(
      { id: '1', name: 'delete_everything', arguments: {} },
      { ...scope, web: true },
    )
    expect(outcome.action).toBeNull()
    expect(outcome.content).toContain('test_run_draft, fetch_url')
  })

  it('refuses to fetch while the web tool is switched off', async () => {
    const outcome = await new AssistantTools(selfTest).run(
      { id: '1', name: 'fetch_url', arguments: { url: 'https://example.com' } },
      { ...scope, web: false },
    )
    expect(outcome.action).toBeNull()
    expect(outcome.content).toContain('not valid')
  })
})
