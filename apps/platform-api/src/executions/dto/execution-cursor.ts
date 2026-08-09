import { z } from 'zod'

// `${createdAt.toISOString()}_${id}` — neither an ISO timestamp nor a uuid contains an
// underscore, so splitting on the first one unambiguously recovers both parts.
export const executionCursorSchema = z.string().transform((value, ctx) => {
  const separatorIndex = value.indexOf('_')
  const createdAt =
    separatorIndex === -1 ? undefined : new Date(value.slice(0, separatorIndex))
  const id = separatorIndex === -1 ? undefined : value.slice(separatorIndex + 1)
  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) {
    ctx.addIssue({ code: 'custom', message: 'Invalid cursor' })
    return z.NEVER
  }
  return { createdAt, id }
})
