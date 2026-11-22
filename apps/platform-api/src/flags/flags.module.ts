import { Module } from '@nestjs/common'
import { FlagsController } from './flags.controller'

@Module({ controllers: [FlagsController] })
export class FlagsModule {}
