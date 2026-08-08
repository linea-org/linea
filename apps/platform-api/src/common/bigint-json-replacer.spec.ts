import { bigIntJsonReplacer } from './bigint-json-replacer'

describe('bigIntJsonReplacer', () => {
  it('stringifies bigint values, including zero, so JSON.stringify does not throw', () => {
    const payload = {
      costMicros: 0n,
      tokensInput: 5,
      nested: { costMicros: 1_500_000n },
    }

    expect(() => JSON.stringify(payload, bigIntJsonReplacer)).not.toThrow()
    expect(JSON.parse(JSON.stringify(payload, bigIntJsonReplacer))).toEqual({
      costMicros: '0',
      tokensInput: 5,
      nested: { costMicros: '1500000' },
    })
  })

  it('leaves non-bigint values untouched', () => {
    const payload = { name: 'test', count: 3, active: true, meta: null }

    expect(JSON.parse(JSON.stringify(payload, bigIntJsonReplacer))).toEqual(
      payload,
    )
  })
})
