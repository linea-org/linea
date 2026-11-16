import { assistantMessageSchema } from './assistant-message.dto'

const base = { message: 'hi' }
const file = (content: string, name = 'a.txt') => ({ name, content })

describe('assistantMessageSchema attachments', () => {
  it('defaults to no attachments', () => {
    expect(assistantMessageSchema.parse(base).attachments).toEqual([])
  })

  it('accepts a few text files', () => {
    const parsed = assistantMessageSchema.parse({
      ...base,
      attachments: [file('one'), file('two', 'b.md')],
    })
    expect(parsed.attachments).toHaveLength(2)
  })

  it('rejects more than five files', () => {
    const attachments = Array.from({ length: 6 }, () => file('x'))
    expect(
      assistantMessageSchema.safeParse({ ...base, attachments }).success,
    ).toBe(false)
  })

  it('rejects a file that is too large', () => {
    const attachments = [file('x'.repeat(100_001))]
    expect(
      assistantMessageSchema.safeParse({ ...base, attachments }).success,
    ).toBe(false)
  })

  it('rejects a set of files that is too large together', () => {
    const attachments = [1, 2, 3].map(() => file('x'.repeat(90_000)))
    expect(
      assistantMessageSchema.safeParse({ ...base, attachments }).success,
    ).toBe(false)
  })

  it('rejects a file with no name', () => {
    expect(
      assistantMessageSchema.safeParse({
        ...base,
        attachments: [file('x', ' ')],
      }).success,
    ).toBe(false)
  })
})
