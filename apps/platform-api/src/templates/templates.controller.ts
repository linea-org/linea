import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentWorkspaceId } from '../auth/current-workspace-id.decorator'
import { OptionalUserId } from '../auth/optional-user-id.decorator'
import { RequireRole } from '../auth/require-role.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { WorkspaceRoleGuard } from '../auth/workspace-role.guard'
import { requireUserId } from '../assistant/assistant-user'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  listTemplatesSchema,
  publishTemplateSchema,
  starTemplateSchema,
  type ListTemplatesDto,
  type PublishTemplateDto,
} from './dto/template.dto'
import { listAppealTypes } from './appeals/template-appeal-types'
import { TemplateAppealsService } from './appeals/template-appeals.service'
import {
  appealTemplateSchema,
  reportTemplateSchema,
  type AppealTemplateDto,
  type ReportTemplateDto,
} from './moderation/dto/moderation.dto'
import { TemplatesService } from './templates.service'

@Controller('templates')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard, WorkspaceRoleGuard)
@RequireRole('member')
export class TemplatesController {
  constructor(
    private readonly templates: TemplatesService,
    private readonly appeals: TemplateAppealsService,
  ) {}

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Query(new ZodValidationPipe(listTemplatesSchema)) query: ListTemplatesDto,
  ) {
    return this.templates.list(
      { workspaceId, userId: requireUserId(userId) },
      query,
    )
  }

  @Get('appeal-types')
  appealTypes() {
    return listAppealTypes()
  }

  @Post()
  publish(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Body(new ZodValidationPipe(publishTemplateSchema))
    body: PublishTemplateDto,
  ) {
    return this.templates.publish(
      { workspaceId, userId: requireUserId(userId) },
      body,
    )
  }

  @Put(':id/star')
  setStar(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(starTemplateSchema))
    body: { starred: boolean },
  ) {
    return this.templates.setStar(
      { workspaceId, userId: requireUserId(userId) },
      id,
      body.starred,
    )
  }

  @Post(':id/use')
  use(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.use(workspaceId, id)
  }

  @Post(':id/report')
  @HttpCode(204)
  report(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reportTemplateSchema)) body: ReportTemplateDto,
  ) {
    return this.templates.report(
      { workspaceId, userId: requireUserId(userId) },
      id,
      body,
    )
  }

  @Post(':id/appeal')
  appeal(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(appealTemplateSchema)) body: AppealTemplateDto,
  ) {
    return this.appeals.submit(
      { workspaceId, userId: requireUserId(userId) },
      id,
      body,
    )
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentWorkspaceId() workspaceId: string,
    @OptionalUserId() userId: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.remove(
      { workspaceId, userId: requireUserId(userId) },
      id,
    )
  }
}
