import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type {
  RegisterPushDeviceDto,
  UnregisterPushDeviceDto,
} from './dto/push-device.dto'

@Injectable()
export class PushDevicesService {
  async register(
    userId: string,
    sessionId: string,
    input: RegisterPushDeviceDto,
  ) {
    const registration = await repositories.pushNotification.registerPushDevice(
      db,
      {
        ...input,
        userId,
        sessionId,
      },
    )
    return {
      id: registration.id,
      platform: registration.platform,
      registeredAt: registration.registeredAt,
      lastSeenAt: registration.lastSeenAt,
    }
  }

  async unregister(
    userId: string,
    sessionId: string,
    input: UnregisterPushDeviceDto,
  ) {
    const registration =
      await repositories.pushNotification.unregisterPushDevice(
        db,
        userId,
        sessionId,
        input.token,
      )
    if (!registration) throw new NotFoundException('Push device not found')
    return { removed: true }
  }
}
