import { toPageText } from './assistant-tools'
import { AssistantTools, WEB_TOOL } from './assistant-tools'

describe('toPageText', () => {
  it('strips scripts, styles and tags from html', () => {
    const html =
      '<html><style>p{}</style><script>alert(1)</script><body><p>Hello&nbsp;<b>world</b></p></body></html>'
    expect(toPageText(html, 'text/html; charset=utf-8')).toBe('Hello world')
  })

  it('keeps json and plain text as they are', () => {
    expect(toPageText('{"a": 1}', 'application/json')).toBe('{"a": 1}')
  })

  it('caps how much a page can put in front of the model', () => {
    expect(toPageText('x'.repeat(50_000), 'text/plain')).toHaveLength(12_000)
  })
})

describe('AssistantTools', () => {
  it('rejects a call that is not the web tool', async () => {
    const outcome = await new AssistantTools().run({
      id: '1',
      name: 'delete_everything',
      arguments: {},
    })
    expect(outcome.action).toBeNull()
    expect(outcome.content).toContain(WEB_TOOL.name)
  })

  it('refuses a url that is not public https, and says so', async () => {
    const outcome = await new AssistantTools().run({
      id: '1',
      name: WEB_TOOL.name,
      arguments: { url: 'http://169.254.169.254/latest/meta-data' },
    })
    expect(outcome.action?.status).toBeNull()
    expect(outcome.action?.error).toBeTruthy()
    expect(outcome.content).toContain('Could not fetch')
  })
})
