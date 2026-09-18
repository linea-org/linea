import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { CurrentUserId } from '../auth/current-user-id.decorator'
import { WorkspaceAuthGuard } from '../auth/workspace-auth.guard'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  registerPushDeviceSchema,
  type RegisterPushDeviceDto,
  unregisterPushDeviceSchema,
  type UnregisterPushDeviceDto,
} from './dto/push-device.dto'
import { PushDevicesService } from './push-devices.service'

@Controller('push-devices')
@OptionalAuth()
@UseGuards(WorkspaceAuthGuard)
export class PushDevicesController {
  constructor(private readonly pushDevices: PushDevicesService) {}

  @Post()
  register(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(registerPushDeviceSchema))
    body: RegisterPushDeviceDto,
  ) {
    return this.pushDevices.register(userId, body)
  }

  @Delete()
  unregister(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(unregisterPushDeviceSchema))
    body: UnregisterPushDeviceDto,
  ) {
    return this.pushDevices.unregister(userId, body)
  }
}
