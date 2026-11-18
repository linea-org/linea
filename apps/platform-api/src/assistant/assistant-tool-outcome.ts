import type { AssistantMessageAction } from '@linealabs/db'

export type AssistantAction = AssistantMessageAction

export type ToolOutcome = {
  content: string
  action: AssistantAction | null
}
