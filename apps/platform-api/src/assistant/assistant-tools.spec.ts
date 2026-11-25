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
  mentions: true,
}
const selfTest = { run: jest.fn() } as unknown as AssistantSelfTest
const names = (on: Parameters<typeof assistantTools>[0]) =>
  assistantTools(on).map((tool) => tool.name)

describe('AssistantTools', () => {
  it('offers run history inside a workflow and the web tool when switched on', () => {
    expect(names({ web: false, workflowId: null, mentions: false })).toEqual([
      'answer',
      'edit_draft',
      'test_run_draft',
      'list_agents',
      'get_run',
    ])
    expect(names({ web: true, workflowId: 'wf', mentions: true })).toEqual([
      'answer',
      'edit_draft',
      'test_run_draft',
      'list_agents',
      'get_recent_runs',
      'get_run',
      'get_workflow',
      'get_application',
      'fetch_url',
    ])
  })

  it('offers the record tools only when assistantMentions is on', () => {
    const on = names({ web: false, workflowId: null, mentions: true })
    expect(on).toEqual(
      expect.arrayContaining(['get_workflow', 'get_application']),
    )
    expect(
      names({ web: false, workflowId: null, mentions: false }),
    ).not.toEqual(expect.arrayContaining(['get_workflow']))
  })

  it('rejects a call to a tool it does not have', async () => {
    const outcome = await new AssistantTools(selfTest).run(
      { id: '1', name: 'delete_everything', arguments: {} },
      { ...scope, web: true },
      GraphDraft.from(undefined),
    )
    expect(outcome.action).toBeNull()
    expect(outcome.content).toContain(
      'Available tools: answer, edit_draft, test_run_draft, list_agents, get_run, get_workflow, get_application, fetch_url',
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

  it.each([
    ['get_workflow', { workflowId: '045f759c' }, 'No Workflow'],
    ['get_application', { applicationId: '045f759c' }, 'No Application'],
    ['get_run', { executionId: '045f759c' }, 'No run'],
  ])('routes %s and refuses a shortened id', async (name, args, refusal) => {
    const outcome = await new AssistantTools(selfTest).run(
      { id: '1', name, arguments: args },
      scope,
      GraphDraft.from(undefined),
    )
    expect(outcome.content).toContain(refusal)
  })
})
