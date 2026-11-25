import { AssistantOutputError } from './assistant-output-error'
import {
  checkAssistantReply,
  findAnswer,
  parseAssistantReply,
} from './assistant-reply'

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

  it('reads an answer that proposes the edited draft', () => {
    expect(parseAssistantReply('{"reply":"Built","graph":"draft"}')).toEqual({
      reply: 'Built',
      graph: 'draft',
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

describe('the answer tool', () => {
  const call = { id: '1', name: 'answer', arguments: { reply: 'Done' } }

  it('answers without a graph', () => {
    expect(checkAssistantReply(call.arguments)).toEqual({
      reply: 'Done',
      graph: null,
    })
  })

  it('counts only when it is the one call', () => {
    expect(findAnswer([call])).toBe(call)
    expect(findAnswer([call, { ...call, name: 'edit_draft' }])).toBeUndefined()
    expect(findAnswer([{ ...call, name: 'edit_draft' }])).toBeUndefined()
    expect(findAnswer(undefined)).toBeUndefined()
  })
})
