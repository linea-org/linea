import { Module } from '@nestjs/common'
import { PlatformAdminGuard } from '../auth/platform-admin.guard'
import { TemplateAppealsService } from './appeals/template-appeals.service'
import { TemplateModerationController } from './moderation/template-moderation.controller'
import { TemplateModerationService } from './moderation/template-moderation.service'
import { TemplatesController } from './templates.controller'
import { TemplatesService } from './templates.service'

@Module({
  controllers: [TemplatesController, TemplateModerationController],
  providers: [
    TemplatesService,
    TemplateAppealsService,
    TemplateModerationService,
    PlatformAdminGuard,
  ],
})
export class TemplatesModule {}
