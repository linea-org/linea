import { Body, Controller, Delete, Post } from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import type { auth } from '@linea/auth'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import {
  registerPushDeviceSchema,
  type RegisterPushDeviceDto,
  unregisterPushDeviceSchema,
  type UnregisterPushDeviceDto,
} from './dto/push-device.dto'
import { PushDevicesService } from './push-devices.service'

@Controller('push-devices')
export class PushDevicesController {
  constructor(private readonly pushDevices: PushDevicesService) {}

  @Post()
  register(
    @Session() session: UserSession<typeof auth>,
    @Body(new ZodValidationPipe(registerPushDeviceSchema))
    body: RegisterPushDeviceDto,
  ) {
    return this.pushDevices.register(session.user.id, session.session.id, body)
  }

  @Delete()
  unregister(
    @Session() session: UserSession<typeof auth>,
    @Body(new ZodValidationPipe(unregisterPushDeviceSchema))
    body: UnregisterPushDeviceDto,
  ) {
    return this.pushDevices.unregister(
      session.user.id,
      session.session.id,
      body,
    )
  }
}
