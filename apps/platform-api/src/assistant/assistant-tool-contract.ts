import type { AssistantMessageAction } from '@linealabs/db'

export type AssistantAction = AssistantMessageAction

export type ToolOutcome = {
  content: string
  action: AssistantAction | null
}

/** Who is asking and from where; workflowId is null in an Application-level chat. */
export type AssistantToolScope = {
  workspaceId: string
  applicationId: string
  userId: string
  workflowId: string | null
  /** The Development Environment, whose deployed Agents and model key the assistant uses. */
  environmentId: string
  web: boolean
}
