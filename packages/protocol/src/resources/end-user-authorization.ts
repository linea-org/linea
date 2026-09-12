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
  dpopNonce: z.string().min(32).max(256),
  expiresAt: timestampSchema,
})

export const createEndUserSessionSchema = z.strictObject({
  exchangeToken: z.string().startsWith("lnx_").max(256),
})

export const endUserSessionCredentialSchema = z.strictObject({
  accessToken: z.string().startsWith("lnu_"),
  tokenType: z.literal("DPoP"),
  dpopNonce: z.string().min(32).max(256),
  expiresAt: timestampSchema,
})

export const endUserSessionHeadersSchema = z.strictObject({
  authorization: z.string().startsWith("DPoP "),
  dpop: z.string().min(1).max(8192),
  origin: z.url().optional(),
})

export const createEndUserSessionHeadersSchema = z.strictObject({
  dpop: z.string().min(1).max(8192),
  origin: z.url().optional(),
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
export type CreateEndUserSession = z.infer<typeof createEndUserSessionSchema>
export type EndUserSessionCredential = z.infer<
  typeof endUserSessionCredentialSchema
>
