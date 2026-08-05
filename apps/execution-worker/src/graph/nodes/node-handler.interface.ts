export type NodeExecutionContext = {
  workspaceId: string
}

export interface NodeHandler {
  execute(
    config: Record<string, unknown>,
    input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown>
}
