import { AssistantOutputError } from './assistant-output-error'
import { validateAssistantGraph } from './assistant-graph'

const start = {
  id: 'start',
  type: 'start',
  config: { triggerType: 'manual' },
}
const base = {
  version: 1,
  trigger: { type: 'manual' },
  entryNodeId: 'start',
}

describe('validateAssistantGraph', () => {
  it('accepts a valid graph', () => {
    const graph = validateAssistantGraph({
      ...base,
      nodes: [
        start,
        { id: 'answer', type: 'ai', config: { model: 'gpt-5', prompt: 'Hi' } },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'answer' },
        { from: 'answer', to: 'end' },
      ],
    })
    expect(graph.nodes).toHaveLength(3)
  })

  it('rejects a wrong shape with a readable message', () => {
    expect(() => validateAssistantGraph({ nodes: [] })).toThrow(
      /Invalid graph shape/,
    )
  })

  it('rejects a node type the assistant may not use', () => {
    expect(() =>
      validateAssistantGraph({
        ...base,
        nodes: [start, { id: 'tool', type: 'connector', config: {} }],
        edges: [{ from: 'start', to: 'tool' }],
      }),
    ).toThrow(/may not use/)
  })

  it('turns a structural error into an AssistantOutputError', () => {
    expect(() =>
      validateAssistantGraph({
        ...base,
        nodes: [start, { id: 'a', type: 'transform', config: {} }],
        edges: [
          { from: 'start', to: 'a' },
          { from: 'a', to: 'start' },
        ],
      }),
    ).toThrow(AssistantOutputError)
  })
})
