import { Module } from '@nestjs/common'
import { PushDevicesController } from './push-devices.controller'
import { PushDevicesService } from './push-devices.service'

@Module({
  controllers: [PushDevicesController],
  providers: [PushDevicesService],
})
export class PushDevicesModule {}
