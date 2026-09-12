import { z } from "zod"
import { identifierSchema } from "../shared/identifier"
import { timestampSchema } from "../shared/timestamp"

const authorizationCodeSchema = z.string().min(20).max(4096)

export const startEndUserAuthorizationSchema = z.strictObject({
  applicationId: identifierSchema,
  redirectUri: z.url().max(2000),
  codeChallenge: z
    .string()
    .length(43)
    .regex(/^[A-Za-z0-9_-]+$/),
})

export const endUserAuthorizationResponseSchema = z.strictObject({
  authorizationUrl: z.url(),
})

export const exchangeEndUserAuthorizationSchema = z.strictObject({
  applicationId: identifierSchema,
  redirectUri: z.url().max(2000),
  code: authorizationCodeSchema,
  state: z
    .string()
    .length(43)
    .regex(/^[A-Za-z0-9_-]+$/),
  codeVerifier: z
    .string()
    .min(43)
    .max(128)
    .regex(/^[A-Za-z0-9._~-]+$/),
})

export const endUserIdentityExchangeSchema = z.strictObject({
  applicationId: identifierSchema,
  externalSubjectId: identifierSchema,
  exchangeToken: z.string().startsWith("lnx_"),
  expiresAt: timestampSchema,
})

export type StartEndUserAuthorization = z.infer<
  typeof startEndUserAuthorizationSchema
>
export type ExchangeEndUserAuthorization = z.infer<
  typeof exchangeEndUserAuthorizationSchema
>
export type EndUserAuthorizationResponse = z.infer<
  typeof endUserAuthorizationResponseSchema
>
export type EndUserIdentityExchange = z.infer<
  typeof endUserIdentityExchangeSchema
>
