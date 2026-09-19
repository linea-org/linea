import { z } from 'zod'

export const expoPushTokenSchema = z
  .string()
  .max(4096)
  .regex(/^Expo(?:nent)?PushToken\[[^\]]+\]$/)

export const registerPushDeviceSchema = z.object({
  token: expoPushTokenSchema,
  platform: z.enum(['android', 'ios']),
})

export const unregisterPushDeviceSchema = z.object({
  token: expoPushTokenSchema,
})

export type RegisterPushDeviceDto = z.infer<typeof registerPushDeviceSchema>
export type UnregisterPushDeviceDto = z.infer<typeof unregisterPushDeviceSchema>
