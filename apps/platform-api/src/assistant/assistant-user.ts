import { ForbiddenException } from '@nestjs/common'

/** Chats belong to a signed-in member; an API key has no one to own them. */
export function requireUserId(userId: string | undefined): string {
  if (!userId) {
    throw new ForbiddenException('A signed-in session is required')
  }
  return userId
}
