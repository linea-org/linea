import { Module } from '@nestjs/common'
import { RegressionCasesController } from './regression-cases.controller'
import { RegressionCasesService } from './regression-cases.service'
import { RegressionRunsController } from './regression-runs.controller'
import { RegressionRunsService } from './regression-runs.service'

@Module({
  controllers: [RegressionCasesController, RegressionRunsController],
  providers: [RegressionCasesService, RegressionRunsService],
})
export class RegressionsModule {}
