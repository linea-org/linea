import type { ToolCall, ToolDefinition } from '@linealabs/ai'
import { z } from 'zod'
import { AssistantOutputError } from './assistant-output-error'

const replySchema = z.object({
  reply: z.string().min(1),
  /** "draft" proposes the graph built with edit_draft. */
  graph: z
    .union([z.record(z.string(), z.unknown()), z.literal('draft')])
    .nullable()
    .default(null),
  title: z.string().trim().max(80).optional(),
})

/** Some models call a tool to answer when they are given tools, so there is one to call. */
export const ANSWER_TOOL: ToolDefinition = {
  name: 'answer',
  description: 'Give the user your final answer.',
  parameters: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'Plain text, short and direct' },
      graph: {
        anyOf: [{ type: 'object' }, { type: 'string' }, { type: 'null' }],
        description: 'A complete workflow graph, "draft" or null',
      },
      title: {
        type: 'string',
        description: 'A short name for the workflow, at most 60 characters',
      },
    },
    required: ['reply'],
  },
}

/** The call that answers; beside other calls it doesn't count, because their results come first. */
export function findAnswer(calls: ToolCall[] | undefined) {
  const [call] = calls ?? []
  return calls?.length === 1 && call.name === ANSWER_TOOL.name
    ? call
    : undefined
}

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
  return checkAssistantReply(json)
}

export function checkAssistantReply(value: unknown): AssistantReply {
  const result = replySchema.safeParse(value)
  if (!result.success) {
    throw new AssistantOutputError(
      'The answer must be {"reply": string, "graph": object | "draft" | null}.',
    )
  }
  return result.data
}
