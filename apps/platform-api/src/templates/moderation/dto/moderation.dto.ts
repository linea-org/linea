import { z } from 'zod'
import { templateAppealTypeIds } from '@linealabs/db'

const note = z.string().trim().max(500).optional()

export const reportTemplateSchema = z.object({
  reason: z.enum([
    'credentials',
    'malicious',
    'spam',
    'inappropriate',
    'other',
  ]),
  details: z.string().trim().max(500).optional(),
})

export const appealTemplateSchema = z.object({
  type: z.enum(templateAppealTypeIds),
  message: z.string().trim().max(1000).optional(),
})

export const listAppealsSchema = z.object({
  status: z.enum(['open', 'upheld', 'rejected']).default('open'),
  page: z.coerce.number().int().min(1).default(1),
})

export const rejectAppealSchema = z.object({
  // The author reads this, so a rejection always explains itself.
  note: z.string().trim().min(1).max(500),
})

export const listReportsSchema = z.object({
  status: z.enum(['open', 'dismissed', 'actioned']).default('open'),
  page: z.coerce.number().int().min(1).default(1),
})

export const listModerationTemplatesSchema = z.object({
  status: z.enum(['active', 'hidden']).optional(),
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).default(1),
})

export const moderationNoteSchema = z.object({ note })

export type AppealTemplateDto = z.infer<typeof appealTemplateSchema>
export type ListAppealsDto = z.infer<typeof listAppealsSchema>
export type ReportTemplateDto = z.infer<typeof reportTemplateSchema>
export type ListReportsDto = z.infer<typeof listReportsSchema>
export type ListModerationTemplatesDto = z.infer<
  typeof listModerationTemplatesSchema
>
