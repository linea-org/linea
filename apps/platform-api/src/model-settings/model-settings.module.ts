import { Module } from '@nestjs/common'
import { ModelSettingsController } from './model-settings.controller'
import { ModelSettingsService } from './model-settings.service'

@Module({
  controllers: [ModelSettingsController],
  providers: [ModelSettingsService],
})
export class ModelSettingsModule {}
