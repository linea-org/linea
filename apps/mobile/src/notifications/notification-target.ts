import { z } from "zod"

const notificationTargetSchema = z.discriminatedUnion("screen", [
  z.object({
    screen: z.literal("execution"),
    workspaceId: z.string(),
    executionId: z.string(),
  }),
  z.object({
    screen: z.literal("approval"),
    workspaceId: z.string(),
    approvalId: z.string(),
  }),
  z.object({
    screen: z.literal("signal"),
    workspaceId: z.string(),
    signalId: z.string(),
  }),
])

export type NotificationTarget = z.infer<typeof notificationTargetSchema>

export function parseNotificationTarget(
  data: unknown
): NotificationTarget | undefined {
  const result = notificationTargetSchema.safeParse(data)
  return result.success ? result.data : undefined
}
