import { createHash } from "node:crypto"
import { z } from "zod"
import type { ConnectorReadOperation } from "./connector-read-operation.js"
import type {
  ActionIntentEnvelope,
  ConnectorSideEffectOperation,
} from "./connector-side-effect-operation.js"
import {
  GoogleProviderError,
  googleApiUrl,
  googleJson,
  googleProviderErrorSchema,
  normalizeGoogleProviderError,
} from "./google-http.js"
import { GOOGLE_ACTION_SCOPES } from "./google-scopes.js"
import { escapeSafeDisplayText } from "./safe-display.js"

const emailSchema = z
  .string()
  .email()
  .max(320)
  .refine((value) => !/[\r\n]/.test(value))
const gmailListInputSchema = z
  .object({
    query: z.string().max(500).optional(),
    maxResults: z.number().int().min(1).max(100).default(25),
    pageToken: z.string().min(1).max(2000).optional(),
  })
  .strict()
const gmailListResponseSchema = z
  .object({
    messages: z
      .array(
        z.object({ id: z.string().max(200), threadId: z.string().max(200) })
      )
      .max(100)
      .default([]),
    nextPageToken: z.string().max(2000).optional(),
    resultSizeEstimate: z.number().int().nonnegative().optional(),
  })
  .strip()
const gmailListOutputSchema = z.strictObject({
  messages: z.array(
    z.strictObject({ id: z.string().max(200), threadId: z.string().max(200) })
  ),
  nextPageToken: z.string().max(2000).nullable(),
  resultSizeEstimate: z.number().int().nonnegative(),
})
const gmailSendInputSchema = z
  .object({
    to: z.array(emailSchema).min(1).max(20),
    cc: z.array(emailSchema).max(20).default([]),
    bcc: z.array(emailSchema).max(20).default([]),
    subject: z
      .string()
      .min(1)
      .max(500)
      .refine((value) => !/[\r\n]/.test(value)),
    textBody: z.string().min(1).max(100_000),
  })
  .strict()
const gmailSendParametersSchema = gmailSendInputSchema
const gmailSendPreconditionsSchema = z.strictObject({})
const gmailSendResponseSchema = z
  .object({
    id: z.string().min(1).max(200),
    threadId: z.string().min(1).max(200),
    labelIds: z.array(z.string().max(100)).max(100).default([]),
  })
  .strip()
const gmailSendResultSchema = z.strictObject({
  messageId: z.string().min(1).max(200),
  threadId: z.string().min(1).max(200),
  labelIds: z.array(z.string().max(100)).max(100),
})

function gmailMessageId(idempotencyKey: string): string {
  return `<linea-${createHash("sha256").update(idempotencyKey).digest("hex")}@linea.invalid>`
}

function mimeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`
}

function mimeMessage(
  parameters: z.infer<typeof gmailSendParametersSchema>,
  messageId: string
): string {
  const headers = [
    `To: ${parameters.to.join(", ")}`,
    ...(parameters.cc.length ? [`Cc: ${parameters.cc.join(", ")}`] : []),
    ...(parameters.bcc.length ? [`Bcc: ${parameters.bcc.join(", ")}`] : []),
    `Subject: ${mimeSubject(parameters.subject)}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ]
  return `${headers.join("\r\n")}\r\n\r\n${Buffer.from(parameters.textBody).toString("base64")}`
}

function sendResult(response: z.infer<typeof gmailSendResponseSchema>) {
  return {
    messageId: response.id,
    threadId: response.threadId,
    labelIds: response.labelIds,
  }
}

async function reconcileGmailSend(
  accessToken: string,
  messageId: string,
  signal?: AbortSignal
) {
  const url = googleApiUrl("/gmail/v1/users/me/messages")
  url.searchParams.set("q", `rfc822msgid:${messageId} in:sent`)
  url.searchParams.set("maxResults", "1")
  try {
    const found = await googleJson(url, gmailListResponseSchema, {
      accessToken,
      signal,
    })
    const message = found.messages[0]
    if (!message) throw new GoogleProviderError(undefined, true)
    return { messageId: message.id, threadId: message.threadId, labelIds: [] }
  } catch {
    throw new GoogleProviderError(undefined, true)
  }
}

function sendParameters(envelope: ActionIntentEnvelope) {
  return gmailSendParametersSchema.parse(envelope.parameters)
}

export const googleGmailListMessagesOperation: ConnectorReadOperation =
  Object.freeze<ConnectorReadOperation>({
    id: "google.gmail.list_messages",
    provider: "google",
    actionFamily: "gmail_read",
    classification: "read",
    requiredScopes: Object.freeze([GOOGLE_ACTION_SCOPES.gmail_read]),
    providerErrorMessage: "Gmail read failed",
    inputSchema: gmailListInputSchema,
    outputSchema: gmailListOutputSchema,
    async execute(rawInput, credential, signal) {
      const input = gmailListInputSchema.parse(rawInput)
      const url = googleApiUrl("/gmail/v1/users/me/messages")
      url.searchParams.set("maxResults", String(input.maxResults))
      if (input.query) url.searchParams.set("q", input.query)
      if (input.pageToken) url.searchParams.set("pageToken", input.pageToken)
      const response = await googleJson(url, gmailListResponseSchema, {
        accessToken: credential.accessToken,
        signal,
      })
      return {
        messages: response.messages,
        nextPageToken: response.nextPageToken ?? null,
        resultSizeEstimate: response.resultSizeEstimate ?? 0,
      }
    },
  })

export const googleGmailSendMessageOperation: ConnectorSideEffectOperation =
  Object.freeze<ConnectorSideEffectOperation>({
    id: "google.gmail.send_message",
    revision: "1",
    provider: "google",
    actionFamily: "gmail_send",
    classification: "side_effect",
    requiredScopes: Object.freeze([GOOGLE_ACTION_SCOPES.gmail_send]),
    inputSchema: gmailSendInputSchema,
    parametersSchema: gmailSendParametersSchema,
    preconditionsSchema: gmailSendPreconditionsSchema,
    resultSchema: gmailSendResultSchema,
    providerErrorSchema: googleProviderErrorSchema,
    retrySafety: "none",
    normalize(rawInput) {
      const input = gmailSendInputSchema.parse(rawInput)
      return {
        target: { recipients: [...input.to, ...input.cc, ...input.bcc] },
        parameters: input,
        providerPreconditions: {},
      }
    },
    display(envelope) {
      const parameters = sendParameters(envelope)
      return Object.freeze({
        title: "Send Gmail message",
        details: Object.freeze({
          To: escapeSafeDisplayText(parameters.to.join(", ")),
          Cc: escapeSafeDisplayText(parameters.cc.join(", ")),
          Bcc: escapeSafeDisplayText(parameters.bcc.join(", ")),
          Subject: escapeSafeDisplayText(parameters.subject),
        }),
      })
    },
    async revalidateProviderPreconditions() {
      return true
    },
    async execute(
      rawParameters,
      _preconditions,
      credential,
      invocationIdempotencyKey,
      signal
    ) {
      const parameters = gmailSendParametersSchema.parse(rawParameters)
      const messageId = gmailMessageId(invocationIdempotencyKey)
      try {
        const response = await googleJson(
          googleApiUrl("/gmail/v1/users/me/messages/send"),
          gmailSendResponseSchema,
          {
            accessToken: credential.accessToken,
            method: "POST",
            body: {
              raw: Buffer.from(mimeMessage(parameters, messageId)).toString(
                "base64url"
              ),
            },
            signal,
          }
        )
        return sendResult(response)
      } catch (error) {
        if (
          !(error instanceof GoogleProviderError) ||
          !error.outcomeUnknown ||
          signal?.aborted
        ) {
          throw error
        }
        if (!credential.scopes.includes(GOOGLE_ACTION_SCOPES.gmail_read)) {
          throw new GoogleProviderError(undefined, true)
        }
        return reconcileGmailSend(
          credential.accessToken,
          messageId,
          AbortSignal.timeout(5_000)
        )
      }
    },
    normalizeProviderError: normalizeGoogleProviderError,
  })
