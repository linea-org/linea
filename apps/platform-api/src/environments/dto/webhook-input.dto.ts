import { z } from 'zod'

export const webhookUrlSchema = z
  .url()
  .max(2_048)
  .refine((value) => {
    const url = new URL(value)
    if (url.username || url.password) return false
    if (url.protocol === 'https:') return true
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return (
      process.env.NODE_ENV === 'development' &&
      url.protocol === 'http:' &&
      (hostname === 'localhost' ||
        hostname === '::1' ||
        /^127(?:\.\d{1,3}){3}$/.test(hostname))
    )
  }, 'Webhook URL must use HTTPS and contain no credentials')

export const createWebhookSchema = z.strictObject({ url: webhookUrlSchema })
export const updateWebhookSchema = z.strictObject({ url: webhookUrlSchema })

export type CreateWebhookDto = z.infer<typeof createWebhookSchema>
export type UpdateWebhookDto = z.infer<typeof updateWebhookSchema>
