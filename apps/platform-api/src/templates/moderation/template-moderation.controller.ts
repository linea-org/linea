import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentUserId } from '../../auth/current-user-id.decorator'
import { PlatformAdminGuard } from '../../auth/platform-admin.guard'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import {
  listAppealsSchema,
  listModerationTemplatesSchema,
  listReportsSchema,
  moderationNoteSchema,
  rejectAppealSchema,
  type ListAppealsDto,
  type ListModerationTemplatesDto,
  type ListReportsDto,
} from './dto/moderation.dto'
import { TemplateModerationService } from './template-moderation.service'

type NoteBody = { note?: string }

@Controller('admin/templates')
@OptionalAuth()
@UseGuards(PlatformAdminGuard)
export class TemplateModerationController {
  constructor(private readonly moderation: TemplateModerationService) {}

  @Get('reports')
  reports(
    @Query(new ZodValidationPipe(listReportsSchema)) query: ListReportsDto,
  ) {
    return this.moderation.listReports(query)
  }

  @Get('appeals')
  appeals(
    @Query(new ZodValidationPipe(listAppealsSchema)) query: ListAppealsDto,
  ) {
    return this.moderation.listAppeals(query)
  }

  @Post('appeals/:appealId/approve')
  approveAppeal(
    @CurrentUserId() actorId: string,
    @Param('appealId', ParseUUIDPipe) appealId: string,
    @Body(new ZodValidationPipe(moderationNoteSchema)) body: NoteBody,
  ) {
    return this.moderation.decideAppeal(actorId, appealId, 'upheld', body.note)
  }

  @Post('appeals/:appealId/reject')
  rejectAppeal(
    @CurrentUserId() actorId: string,
    @Param('appealId', ParseUUIDPipe) appealId: string,
    @Body(new ZodValidationPipe(rejectAppealSchema)) body: { note: string },
  ) {
    return this.moderation.decideAppeal(
      actorId,
      appealId,
      'rejected',
      body.note,
    )
  }

  @Get()
  templates(
    @Query(new ZodValidationPipe(listModerationTemplatesSchema))
    query: ListModerationTemplatesDto,
  ) {
    return this.moderation.listTemplates(query)
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.moderation.detail(id)
  }

  @Post(':id/hide')
  hide(
    @CurrentUserId() actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moderationNoteSchema)) body: NoteBody,
  ) {
    return this.moderation.setHidden(actorId, id, true, body.note)
  }

  @Post(':id/unhide')
  unhide(
    @CurrentUserId() actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moderationNoteSchema)) body: NoteBody,
  ) {
    return this.moderation.setHidden(actorId, id, false, body.note)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUserId() actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moderationNoteSchema)) body: NoteBody,
  ) {
    return this.moderation.remove(actorId, id, body.note)
  }

  @Post('reports/:reportId/dismiss')
  @HttpCode(204)
  dismiss(
    @CurrentUserId() actorId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body(new ZodValidationPipe(moderationNoteSchema)) body: NoteBody,
  ) {
    return this.moderation.dismissReport(actorId, reportId, body.note)
  }
}
