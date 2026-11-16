import { AssistantOutputError } from './assistant-output-error'
import { parseAssistantReply } from './assistant-reply'

describe('parseAssistantReply', () => {
  it('reads a plain JSON answer', () => {
    expect(parseAssistantReply('{"reply":"Done","graph":null}')).toEqual({
      reply: 'Done',
      graph: null,
    })
  })

  it('reads an answer wrapped in a code fence and prose', () => {
    const text = 'Here you go:\n```json\n{"reply":"Built","graph":{"a":1}}\n```'
    expect(parseAssistantReply(text)).toEqual({
      reply: 'Built',
      graph: { a: 1 },
    })
  })

  it('treats text with no JSON as a plain reply', () => {
    expect(parseAssistantReply('Sure, here is the answer.')).toEqual({
      reply: 'Sure, here is the answer.',
      graph: null,
    })
  })

  it.each([
    ['broken json', '{"reply": "x", "graph": }'],
    ['wrong shape', '{"message":"x"}'],
    ['empty reply', '{"reply":"","graph":null}'],
    ['empty text', '   '],
  ])('rejects %s', (_name, text) => {
    expect(() => parseAssistantReply(text)).toThrow(AssistantOutputError)
  })
})
