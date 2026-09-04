import { Module } from '@nestjs/common'
import { EvalCasesController } from './eval-cases.controller'
import { EvalCasesService } from './eval-cases.service'
import { EvalRunsController } from './eval-runs.controller'
import { EvalRunsService } from './eval-runs.service'

@Module({
  controllers: [EvalCasesController, EvalRunsController],
  providers: [EvalCasesService, EvalRunsService],
})
export class EvalsModule {}
