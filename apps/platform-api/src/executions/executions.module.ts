import { Module } from '@nestjs/common'
import { ExecutionsController } from './executions.controller'
import { ExecutionsService } from './executions.service'

@Module({
  controllers: [ExecutionsController],
  providers: [ExecutionsService],
  exports: [ExecutionsService],
})
export class ExecutionsModule {}
