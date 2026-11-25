import { findLiteralCredentials } from './template-credentials'

const graphWith = (config: unknown) => ({ nodes: [{ id: 'call', config }] })

describe('findLiteralCredentials', () => {
  it('finds credentials in headers, bodies and urls', () => {
    expect(
      findLiteralCredentials(
        graphWith({ headers: { Authorization: 'Bearer abc' } }),
      ),
    ).toEqual(['call.headers.Authorization'])
    expect(
      findLiteralCredentials(graphWith({ body: { apiKey: 'sk-123' } })),
    ).toEqual(['call.body.apiKey'])
    expect(
      findLiteralCredentials(
        graphWith({ url: 'https://api.example.com/v1?api_key=abc123' }),
      ),
    ).toEqual(['call.url'])
    expect(
      findLiteralCredentials(
        graphWith({ url: 'https://user:hunter2@example.com/x' }),
      ),
    ).toEqual(['call.url'])
  })

  it.each([
    ['an OpenAI-style key', 'Use sk-proj-abcdefghijklmnop1234 for this'],
    ['a GitHub token', 'ghp_abcdefghijklmnopqrstuvwxyz0123'],
    ['a Slack token', 'xoxb-1234567890-abcdefghij'],
    ['an AWS key id', 'AKIAIOSFODNN7EXAMPLE'],
    ['a JWT', 'eyJhbGciOiJI.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4fw'],
    ['a private key', '-----BEGIN RSA PRIVATE KEY-----'],
    ['an inline bearer token', 'Authorization: Bearer abcdefghijklmnop1234'],
  ])('finds %s whatever the field is called', (_name, value) => {
    expect(findLiteralCredentials(graphWith({ note: value }))).toEqual([
      'call.note',
    ])
  })

  it('allows a secret by name but not beside a literal one', () => {
    const headers = {
      Authorization: 'Bearer {{secrets.CRM_KEY}}',
      'x-api-key': '{{ secrets.CRM_KEY }}',
    }
    expect(findLiteralCredentials(graphWith({ headers }))).toEqual([])
    expect(
      findLiteralCredentials(
        graphWith({ headers: { Authorization: 'abc123 {{secrets.A}}' } }),
      ),
    ).toEqual(['call.headers.Authorization'])
  })

  it('leaves ordinary configuration alone', () => {
    expect(
      findLiteralCredentials(
        graphWith({
          url: 'https://example.com/health',
          method: 'GET',
          headers: { Authorization: '' },
          prompt: 'Summarise the tokens in this text',
          id: '0f95c222-b9c4-4fb5-91c3-66276b29a85b',
          note: 'The sky-blue theme and a Basic plan',
        }),
      ),
    ).toEqual([])
  })
})
