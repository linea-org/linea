import { repositories } from '@linea/db'
import { PushDevicesService } from './push-devices.service'
import { registerPushDeviceSchema } from './dto/push-device.dto'

jest.mock('@linea/db', () => ({
  db: {},
  repositories: {
    pushNotification: {
      registerPushDevice: jest.fn(),
      unregisterPushDevice: jest.fn(),
    },
  },
}))

const register = jest.mocked(repositories.pushNotification.registerPushDevice)
const unregister = jest.mocked(
  repositories.pushNotification.unregisterPushDevice,
)

it('uses the authenticated session and strips client ownership fields', async () => {
  const input = registerPushDeviceSchema.parse({
    token: 'ExponentPushToken[device]',
    platform: 'ios',
    userId: 'victim',
    sessionId: 'victim-session',
  })
  register.mockResolvedValue({
    id: 'device',
    userId: 'owner',
    sessionId: 'authenticated-session',
    ...input,
    registeredAt: new Date(),
    lastSeenAt: new Date(),
  })
  const response = await new PushDevicesService().register(
    'owner',
    'authenticated-session',
    input,
  )
  expect(register).toHaveBeenCalledWith(expect.anything(), {
    token: 'ExponentPushToken[device]',
    platform: 'ios',
    userId: 'owner',
    sessionId: 'authenticated-session',
  })
  expect(response).not.toHaveProperty('token')
  expect(response).not.toHaveProperty('sessionId')
})

it('scopes unregister to the authenticated session', async () => {
  unregister.mockResolvedValue(undefined)
  await expect(
    new PushDevicesService().unregister('owner', 'authenticated-session', {
      token: 'ExponentPushToken[device]',
    }),
  ).rejects.toThrow('Push device not found')
  expect(unregister).toHaveBeenCalledWith(
    expect.anything(),
    'owner',
    'authenticated-session',
    'ExponentPushToken[device]',
  )
})
