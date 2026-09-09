import { z } from 'zod'

function isOriginOnly(value: string): boolean {
  const url = new URL(value)
  return (
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    (!url.pathname || url.pathname === '/')
  )
}

function canonicalOrigin(value: string): string {
  const url = new URL(value)
  return url.origin === 'null' ? `${url.protocol}//${url.host}` : url.origin
}

const originSchema = z
  .url()
  .refine(isOriginOnly, 'Must be an origin without a path, query, or fragment')
  .transform(canonicalOrigin)

const browserOriginSchema = originSchema.refine((value) => {
  const protocol = new URL(value).protocol
  return protocol === 'http:' || protocol === 'https:'
}, 'Browser origins must use http or https')

const applicationTrustConfigurationSchema = z.strictObject({
  allowedBrowserOrigins: z
    .array(browserOriginSchema)
    .min(1)
    .max(20)
    .transform((origins) => [...new Set(origins)]),
  allowedRedirectOrigins: z
    .array(originSchema)
    .min(1)
    .max(20)
    .transform((origins) => [...new Set(origins)]),
  oidcIssuer: z.url(),
  oidcClientId: z.string().trim().min(1).max(500),
  oidcAudience: z.string().trim().min(1).max(500),
  oidcJwksUrl: z.url(),
  oidcSubjectClaim: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._:-]+$/)
    .default('sub'),
})

function addProductionTrustIssues(
  trust: z.infer<typeof applicationTrustConfigurationSchema>,
  context: z.RefinementCtx,
): void {
  if (new URL(trust.oidcIssuer).protocol !== 'https:') {
    context.addIssue({
      code: 'custom',
      path: ['oidcIssuer'],
      message: 'Production OIDC issuers must use https',
    })
  }
  if (new URL(trust.oidcJwksUrl).protocol !== 'https:') {
    context.addIssue({
      code: 'custom',
      path: ['oidcJwksUrl'],
      message: 'Production JWKS URLs must use https',
    })
  }
  for (const [field, origins] of [
    ['allowedBrowserOrigins', trust.allowedBrowserOrigins],
    ['allowedRedirectOrigins', trust.allowedRedirectOrigins],
  ] as const) {
    origins.forEach((origin, index) => {
      if (new URL(origin).protocol === 'http:') {
        context.addIssue({
          code: 'custom',
          path: [field, index],
          message: 'Production origins cannot use http',
        })
      }
    })
  }
}

const productionApplicationTrustSchema =
  applicationTrustConfigurationSchema.superRefine(addProductionTrustIssues)

const applicationProfileShape = {
  displayName: z.string().trim().min(1).max(100),
  logoUrl: z.url().nullable().default(null),
  contentRetentionDays: z.number().int().min(1).max(3650).default(30),
}

export const createApplicationSchema = z.discriminatedUnion('environment', [
  z.strictObject({
    ...applicationProfileShape,
    environment: z.literal('dev'),
    trust: applicationTrustConfigurationSchema,
  }),
  z.strictObject({
    ...applicationProfileShape,
    environment: z.literal('production'),
    trust: productionApplicationTrustSchema,
  }),
])

export const updateApplicationProfileSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(100).optional(),
    logoUrl: z.url().nullable().optional(),
    contentRetentionDays: z.number().int().min(1).max(3650).optional(),
  })
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    {
      message: 'At least one profile field is required',
    },
  )

export const replaceApplicationTrustSchema = applicationTrustConfigurationSchema

export function validateProductionApplicationTrust(
  trust: ReplaceApplicationTrustDto,
): ReplaceApplicationTrustDto {
  return productionApplicationTrustSchema.parse(trust)
}

export type CreateApplicationDto = z.infer<typeof createApplicationSchema>
export type UpdateApplicationProfileDto = z.infer<
  typeof updateApplicationProfileSchema
>
export type ReplaceApplicationTrustDto = z.infer<
  typeof replaceApplicationTrustSchema
>
