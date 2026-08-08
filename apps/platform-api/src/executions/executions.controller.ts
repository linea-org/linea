import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  listWorkspaceExecutionsSchema,
  type ListWorkspaceExecutionsDto,
} from './dto/list-workspace-executions.dto'
import {
  triggerExecutionSchema,
  type TriggerExecutionDto,
} from './dto/trigger-execution.dto'
import { ExecutionsService } from './executions.service'

@Controller()
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class ExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Post('workflows/:workflowId/executions')
  trigger(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(triggerExecutionSchema))
    body: TriggerExecutionDto,
  ) {
    return this.executions.trigger(workspaceId, workflowId, body)
  }

  @Get('workflows/:workflowId/executions')
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.executions.list(workspaceId, workflowId)
  }

  @Get('executions')
  listWorkspace(
    @CurrentWorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(listWorkspaceExecutionsSchema))
    query: ListWorkspaceExecutionsDto,
  ) {
    return this.executions.listWorkspace(workspaceId, query)
  }

  @Get('executions/:id')
  get(@CurrentWorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.executions.get(workspaceId, id)
  }
}
