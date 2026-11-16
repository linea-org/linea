import { NotFoundException } from '@nestjs/common'
import { branchUpTo } from './assistant-branch'

const messages = [
  { id: 'a', parentId: null },
  { id: 'b', parentId: 'a' },
  { id: 'c', parentId: 'b' },
  { id: 'b2', parentId: 'a' },
  { id: 'c2', parentId: 'b2' },
]

describe('branchUpTo', () => {
  it('follows the branch that holds the named message', () => {
    expect(branchUpTo(messages, 'c').map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('defaults to the branch of the latest message', () => {
    expect(branchUpTo(messages, undefined).map((m) => m.id)).toEqual([
      'a',
      'b2',
      'c2',
    ])
  })

  it('is empty for a new branch at the top', () => {
    expect(branchUpTo(messages, null)).toEqual([])
  })

  it('rejects a message from another chat', () => {
    expect(() => branchUpTo(messages, 'zzz')).toThrow(NotFoundException)
  })
})
