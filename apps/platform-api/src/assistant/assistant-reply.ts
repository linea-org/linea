import { z } from 'zod'
import { AssistantOutputError } from './assistant-output-error'

const replySchema = z.object({
  reply: z.string().min(1),
  /** "draft" proposes the graph built with edit_draft. */
  graph: z
    .union([z.record(z.string(), z.unknown()), z.literal('draft')])
    .nullable(),
  title: z.string().trim().min(1).max(80).optional(),
})

export type AssistantReply = z.infer<typeof replySchema>

export function parseAssistantReply(text: string): AssistantReply {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1) {
    const reply = text.trim()
    if (!reply) throw new AssistantOutputError('The answer was empty.')
    return { reply, graph: null }
  }
  if (end <= start) {
    throw new AssistantOutputError('The answer was not a JSON object.')
  }
  let json: unknown
  try {
    json = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new AssistantOutputError('The answer was not valid JSON.')
  }
  const result = replySchema.safeParse(json)
  if (!result.success) {
    throw new AssistantOutputError(
      'The answer must be {"reply": string, "graph": object | "draft" | null}.',
    )
  }
  return result.data
}
