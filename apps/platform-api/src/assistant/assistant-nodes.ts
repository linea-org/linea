/**
 * Node types the assistant may use: the ones that run without Connections, approvals or memory
 * already set up, plus "agent", which it checks against the Agents deployed in Development.
 */
export const ASSISTANT_NODE_TYPES = [
  'start',
  'agent',
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
