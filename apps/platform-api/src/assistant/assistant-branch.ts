import { NotFoundException } from '@nestjs/common'

type Linked = { id: string; parentId: string | null }

/** The messages from the chat's first to `parentId`, following the branch it sits on. */
export function branchUpTo<T extends Linked>(
  messages: T[],
  parentId: string | null | undefined,
): T[] {
  const latest = messages.at(-1)?.id ?? null
  let cursor = parentId === undefined ? latest : parentId
  const byId = new Map(messages.map((message) => [message.id, message]))
  const branch: T[] = []
  while (cursor !== null) {
    const message = byId.get(cursor)
    if (!message) throw new NotFoundException('Message not found')
    branch.unshift(message)
    cursor = message.parentId
  }
  return branch
}
