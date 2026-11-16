type Linked = { id: string; parentId: string | null }

/** The messages on the branch that ends at `leafId`, first to last. */
export function branchTo<T extends Linked>(
  messages: T[],
  leafId: string | null
): T[] {
  const byId = new Map(messages.map((message) => [message.id, message]))
  const branch: T[] = []
  let cursor = leafId
  while (cursor !== null) {
    const message = byId.get(cursor)
    if (!message) throw new Error(`Message ${cursor} is not in this chat`)
    branch.unshift(message)
    cursor = message.parentId
  }
  return branch
}

/** The messages that share this one's parent, oldest first (it included). */
export function siblingsOf<T extends Linked>(messages: T[], message: T): T[] {
  return messages.filter((other) => other.parentId === message.parentId)
}

/** Follows the newest reply down from `id` to the end of its branch. */
export function latestLeafFrom<T extends Linked>(
  messages: T[],
  id: string
): string {
  let leaf = id
  for (;;) {
    const children = messages.filter((message) => message.parentId === leaf)
    const newest = children.at(-1)
    if (!newest) return leaf
    leaf = newest.id
  }
}
