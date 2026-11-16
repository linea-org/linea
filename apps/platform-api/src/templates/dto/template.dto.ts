import { z } from 'zod'

export const listTemplatesSchema = z.object({
  scope: z.enum(['workspace', 'public']).default('public'),
  q: z.string().trim().max(100).default(''),
  sort: z.enum(['stars', 'used', 'new']).default('stars'),
  page: z.coerce.number().int().min(1).default(1),
})

export const publishTemplateSchema = z.object({
  workflowId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  visibility: z.enum(['workspace', 'public']),
})

export const starTemplateSchema = z.object({ starred: z.boolean() })

export type ListTemplatesDto = z.infer<typeof listTemplatesSchema>
export type PublishTemplateDto = z.infer<typeof publishTemplateSchema>
