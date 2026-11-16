import { cursorParam, encodeCursor } from './assistant-conversation-cursor'

const cursor = {
  updatedAt: '2026-11-14 21:47:28.141234+00',
  id: '0f95c222-b9c4-4fb5-91c3-66276b29a85b',
}

describe('conversation cursor', () => {
  it('round-trips a cursor it issued', () => {
    expect(cursorParam.parse(encodeCursor(cursor))).toEqual(cursor)
  })

  it('rejects text it did not issue', () => {
    expect(cursorParam.safeParse('not-a-cursor').success).toBe(false)
    const forged = Buffer.from(
      JSON.stringify({ ...cursor, updatedAt: "1'; drop table x" }),
    ).toString('base64url')
    expect(cursorParam.safeParse(forged).success).toBe(false)
  })
})
