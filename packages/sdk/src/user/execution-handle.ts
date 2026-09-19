import type { PublicExecution } from "@linea/protocol/resources"

export class LineaExecutionHandle {
  readonly id: string
  private execution: PublicExecution

  constructor(
    execution: PublicExecution,
    private readonly read: (executionId: string) => Promise<PublicExecution>
  ) {
    this.id = execution.id
    this.execution = execution
  }

  get current(): PublicExecution {
    return this.execution
  }

  async refresh(): Promise<PublicExecution> {
    this.execution = await this.read(this.id)
    return this.execution
  }
}
