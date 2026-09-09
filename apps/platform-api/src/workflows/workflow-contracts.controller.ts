import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { RequireRole } from '../auth/require-role.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  createWorkflowContractSchema,
  type CreateWorkflowContractDto,
} from './dto/create-workflow-contract.dto'
import { WorkflowContractsService } from './workflow-contracts.service'

@Controller('workflows/:workflowId/contracts')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('admin')
export class WorkflowContractsController {
  constructor(private readonly contracts: WorkflowContractsService) {}

  @Post()
  create(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Body(new ZodValidationPipe(createWorkflowContractSchema))
    body: CreateWorkflowContractDto,
  ) {
    return this.contracts.create(workspaceId, workflowId, body)
  }

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
  ) {
    return this.contracts.list(workspaceId, workflowId)
  }

  @Get(':contractRevisionId')
  get(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Param('contractRevisionId', ParseUUIDPipe) contractRevisionId: string,
  ) {
    return this.contracts.get(workspaceId, workflowId, contractRevisionId)
  }
}
