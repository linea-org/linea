import {
  containsRedactionPlaceholder,
  REDACTED,
  redactRecord,
  redactText,
  redactValue,
} from './trace-redaction'

const none = new Map<string, string>()

describe('trace redaction', () => {
  it('redacts string values under credential-named keys at any depth', () => {
    expect(
      redactRecord(
        {
          url: 'https://api.example.com/items',
          headers: {
            Authorization: 'token abc',
            'X-Api-Key': 'k-1',
            'Set-Cookie': ['a=1', 'b=2'],
            Accept: 'application/json',
          },
          body: { accessToken: 'at-1', client_secret: 's-1', password: '' },
        },
        none,
      ),
    ).toEqual({
      url: 'https://api.example.com/items',
      headers: {
        Authorization: REDACTED,
        'X-Api-Key': REDACTED,
        'Set-Cookie': [REDACTED, REDACTED],
        Accept: 'application/json',
      },
      body: { accessToken: REDACTED, client_secret: REDACTED, password: '' },
    })
  })

  it('keeps usage counters and other non-credential values', () => {
    const usage = {
      tokensInput: 12,
      tokensOutput: 30,
      max_tokens: 4096,
      tokenizer: 'cl100k',
      secretary: 'Ada',
      text: 'The token count was 12.',
    }
    expect(redactRecord(usage, none)).toEqual(usage)
  })

  it('replaces known secret values wherever they appear, by name', () => {
    const secrets = new Map([
      ['CRM_KEY', 'crm-live-93f1c2'],
      ['PIN', '1234'],
    ])
    expect(
      redactRecord(
        { note: 'sent crm-live-93f1c2 to CRM', code: 'order 1234' },
        secrets,
      ),
    ).toEqual({ note: 'sent [secret CRM_KEY] to CRM', code: 'order 1234' })
  })

  it.each([
    ['curl -H "Authorization: Bearer abcDEF123456.xyz"', 'abcDEF123456'],
    ['Incorrect API key provided: sk-proj-abcdefghijklmnopqrstuvwx', 'sk-proj'],
    ['clone https://ci:hunter2secret@git.example.com/repo.git', 'hunter2'],
    ['ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'ghp_'],
    ['github_pat_11ABCDEFG0abcdefghijklmnop', 'github_pat_'],
    ['xoxb-1234567890-abcdefghij', 'xoxb-'],
    ['key AKIAIOSFODNN7EXAMPLE in use', 'AKIA'],
    [
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      'eyJ',
    ],
    [
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----',
      'MIIEow',
    ],
  ])('redacts the credential in %j', (text, leaked) => {
    const redacted = redactText(text, none)
    expect(redacted).toContain(REDACTED)
    expect(redacted).not.toContain(leaked)
  })

  it('keeps the shape of values that are not objects', () => {
    expect(redactValue('Bearer abcdef123456', none)).toBe(`Bearer ${REDACTED}`)
    expect(redactValue(['a', { token: 't-1' }, 3], none)).toEqual([
      'a',
      { token: REDACTED },
      3,
    ])
    expect(redactValue(42, none)).toBe(42)
    expect(redactValue(null, none)).toBeNull()
  })

  it('recognises its own placeholders in a value sent back', () => {
    expect(
      containsRedactionPlaceholder({ prompt: `use ${REDACTED} here` }),
    ).toBe(true)
    expect(containsRedactionPlaceholder({ url: 'x/[secret CRM_KEY]' })).toBe(
      true,
    )
    expect(containsRedactionPlaceholder({ prompt: 'keep it secret' })).toBe(
      false,
    )
    expect(containsRedactionPlaceholder({})).toBe(false)
  })

  it.each(['\t', '\v', '\u00a0', '\u2028', '\u3000', '\ufeff'])(
    'redacts a token after the space %j',
    (space) => {
      expect(redactText(`Bearer${space}abcdefgh1234`, none)).toBe(
        `Bearer ${REDACTED}`,
      )
    },
  )

  it.each([
    ['an unfinished token', 'eyJ-'],
    ['unfinished private keys', '-----BEGIN PRIVATE KEY-----'],
    ['unfinished URL credentials', '://a:b'],
    ['unfinished GitHub tokens', 'ghp_'],
  ])('stays fast on 1 MB of %s', (_name, part) => {
    const text = part.repeat(Math.ceil(1_000_000 / part.length))
    const started = performance.now()
    redactText(text, none)
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('leaves ordinary prose and URLs alone', () => {
    const text =
      'See https://example.com/docs?page=2 or mail ada@example.com about task-1234567890.'
    expect(redactText(text, none)).toBe(text)
  })
})
