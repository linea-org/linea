import { fetchPage, toPageText } from './assistant-web-fetch'

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

describe('fetchPage', () => {
  it('refuses a url that is not public https, and says so', async () => {
    const outcome = await fetchPage('http://169.254.169.254/latest/meta-data')
    expect(outcome.action).toMatchObject({ kind: 'fetch', status: null })
    expect(outcome.content).toContain('Could not fetch')
  })
})
