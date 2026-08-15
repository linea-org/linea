import { z } from 'zod'

export const respondToApprovalSchema = z.object({
  approved: z.boolean(),
  comment: z.string().optional(),
})

export type RespondToApprovalDto = z.infer<typeof respondToApprovalSchema>
