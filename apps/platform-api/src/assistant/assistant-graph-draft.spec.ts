import { GraphDraft } from './assistant-graph-draft'

const canvas = {
  version: 1,
  trigger: { type: 'manual' },
  entryNodeId: 'start',
  nodes: [
    { id: 'start', type: 'start', config: { triggerType: 'manual' } },
    { id: 'end', type: 'end', config: {}, position: { x: 1, y: 2 } },
  ],
  edges: [{ from: 'start', to: 'end' }],
}

describe('GraphDraft', () => {
  it('keeps the canvas layout when only config changes', () => {
    const draft = GraphDraft.from(canvas)
    draft.edit({ operations: [{ op: 'update_node', id: 'end', config: {} }] })
    expect(draft.current?.nodes[1].position).toEqual({ x: 1, y: 2 })
  })

  it('starts from the canvas and keeps what it does not touch', () => {
    const draft = GraphDraft.from(canvas)
    const result = draft.edit({
      operations: [
        { op: 'disconnect', from: 'start', to: 'end' },
        {
          op: 'add_node',
          id: 'pick',
          type: 'transform',
          config: { expression: 'a' },
        },
        { op: 'connect', from: 'start', to: 'pick' },
        { op: 'connect', from: 'pick', to: 'end' },
      ],
    })
    expect(result).toBe('Applied 4 operations. The draft is valid.')
    // Re-laid out by the builder, so no node keeps a position that the new one could overlap.
    expect(draft.current?.nodes[1]).toEqual({
      id: 'end',
      type: 'end',
      config: {},
    })
    expect(draft.current?.edges).toEqual([
      { from: 'start', to: 'pick' },
      { from: 'pick', to: 'end' },
    ])
  })

  it('applies nothing when one operation fails', () => {
    const draft = GraphDraft.from(canvas)
    const result = draft.edit({
      operations: [
        { op: 'remove_node', id: 'end' },
        { op: 'connect', from: 'start', to: 'ghost' },
      ],
    })
    expect(result).toBe(
      'Nothing applied: operation 2 (connect) failed because there is no node "ghost".',
    )
    expect(draft.current?.nodes).toHaveLength(2)
  })

  it('keeps an unfinished draft and says why it is not valid yet', () => {
    const draft = GraphDraft.from(undefined)
    const result = draft.edit({
      operations: [{ op: 'add_node', id: 'lost', type: 'end' }],
    })
    expect(result).toContain('Applied 1 operations. The draft is not valid yet')
    expect(draft.current?.nodes).toHaveLength(2)
  })

  it('moves the trigger and the start node together', () => {
    const draft = GraphDraft.from(canvas)
    draft.edit({
      operations: [
        {
          op: 'set_trigger',
          trigger: { type: 'schedule', cron: '0 9 * * *', timezone: 'UTC' },
        },
      ],
    })
    expect(draft.current?.nodes[0].config).toEqual({
      triggerType: 'schedule',
      cron: '0 9 * * *',
      timezone: 'UTC',
    })
  })

  it('refuses to remove the start node or add an unknown type', () => {
    const draft = GraphDraft.from(canvas)
    expect(
      draft.edit({ operations: [{ op: 'remove_node', id: 'start' }] }),
    ).toContain('the start node cannot be removed')
    expect(
      draft.edit({ operations: [{ op: 'add_node', id: 'x', type: 'magic' }] }),
    ).toContain('Nothing applied')
  })

  it('cannot edit a canvas graph it could not read', () => {
    const draft = GraphDraft.from({ nodes: 'broken' })
    expect(draft.current).toBeNull()
    expect(draft.edit({ operations: [] })).toContain('could not be read')
  })
})
