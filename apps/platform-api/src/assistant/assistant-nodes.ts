/**
 * Node types the assistant may use: the ones that run without an Application's Agents,
 * Connections, approvals or memory already set up.
 */
export const ASSISTANT_NODE_TYPES = [
  'start',
  'end',
  'ai',
  'http',
  'transform',
  'branch',
  'extract',
  'filter',
  'merge',
  'variables',
  'datetime',
  'wait',
] as const

export type AssistantNodeType = (typeof ASSISTANT_NODE_TYPES)[number]
