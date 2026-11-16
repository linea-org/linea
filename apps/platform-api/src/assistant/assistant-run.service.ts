import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type { TestRunDto } from '../executions/dto/test-run.dto'
import { ExecutionsService } from '../executions/executions.service'

/** Runs a proposal the member chose to run, on the application's hidden scratch workflow. */
@Injectable()
export class AssistantRunService {
  constructor(private readonly executions: ExecutionsService) {}

  async run(
    workspaceId: string,
    userId: string,
    applicationId: string,
    input: TestRunDto,
  ) {
    const application = await repositories.application.getApplicationById(
      db,
      workspaceId,
      applicationId,
    )
    if (!application) throw new NotFoundException('Application not found')
    const scratch = await repositories.workflow.findOrCreateScratchWorkflow(
      db,
      workspaceId,
      applicationId,
    )
    return this.executions.testRun(workspaceId, scratch.id, input, userId)
  }
}
