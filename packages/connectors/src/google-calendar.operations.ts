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

const emailSchema = z.string().email().max(320)
const dateTimeSchema = z.strictObject({
  dateTime: z.string().datetime({ offset: true }),
  timeZone: z.string().min(1).max(100).optional(),
})
const providerDateTimeSchema = z
  .object({
    date: z.string().max(20).optional(),
    dateTime: z.string().max(100).optional(),
    timeZone: z.string().max(100).optional(),
  })
  .strip()
const eventInputShape = {
  summary: z.string().min(1).max(1000),
  description: z.string().max(10_000).default(""),
  location: z.string().max(1000).default(""),
  start: dateTimeSchema,
  end: dateTimeSchema,
  attendees: z.array(emailSchema).max(100).default([]),
}
const providerEventSchema = z
  .object({
    id: z.string().min(1).max(1024),
    etag: z.string().min(1).max(1024),
    status: z.string().max(100).default("confirmed"),
    htmlLink: z.string().url().max(2000).optional(),
    summary: z.string().max(1000).default(""),
    description: z.string().max(10_000).default(""),
    location: z.string().max(1000).default(""),
    start: providerDateTimeSchema,
    end: providerDateTimeSchema,
    attendees: z
      .array(z.object({ email: emailSchema }).strip())
      .max(100)
      .default([]),
    updated: z.string().max(100).optional(),
  })
  .strip()
const eventResultSchema = z.strictObject({
  eventId: z.string().min(1).max(1024),
  etag: z.string().min(1).max(1024),
  status: z.string().max(100),
  htmlLink: z.string().url().max(2000).nullable(),
  summary: z.string().max(1000),
  start: z.string().max(100),
  end: z.string().max(100),
  updated: z.string().max(100).nullable(),
})
const calendarListInputSchema = z
  .object({
    calendarId: z.string().min(1).max(1024).default("primary"),
    timeMin: z.string().datetime({ offset: true }),
    timeMax: z.string().datetime({ offset: true }),
    maxResults: z.number().int().min(1).max(100).default(25),
    pageToken: z.string().min(1).max(2000).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const minimum = Date.parse(input.timeMin)
    const maximum = Date.parse(input.timeMax)
    if (minimum >= maximum || maximum - minimum > 366 * 86_400_000) {
      context.addIssue({
        code: "custom",
        message: "Calendar read range must be positive and at most 366 days",
      })
    }
  })
const calendarListResponseSchema = z
  .object({
    items: z.array(providerEventSchema).max(100).default([]),
    nextPageToken: z.string().max(2000).optional(),
  })
  .strip()
const calendarListOutputSchema = z.strictObject({
  events: z.array(eventResultSchema).max(100),
  nextPageToken: z.string().max(2000).nullable(),
})
const calendarCreateInputSchema = z
  .object({ calendarId: z.string().min(1).max(1024), ...eventInputShape })
  .strict()
const calendarCreateParametersSchema = calendarCreateInputSchema
const calendarCreatePreconditionsSchema = z.strictObject({})
const calendarUpdateInputSchema = z
  .object({
    calendarId: z.string().min(1).max(1024),
    eventId: z.string().min(1).max(1024),
    expectedEtag: z.string().min(1).max(1024),
    ...eventInputShape,
  })
  .strict()
const calendarUpdateParametersSchema = z.strictObject({
  calendarId: z.string().min(1).max(1024),
  eventId: z.string().min(1).max(1024),
  ...eventInputShape,
})
const calendarUpdatePreconditionsSchema = z.strictObject({
  expectedEtag: z.string().min(1).max(1024),
})

function eventTime(value: z.infer<typeof providerDateTimeSchema>): string {
  return value.dateTime ?? value.date ?? ""
}

function eventResult(event: z.infer<typeof providerEventSchema>) {
  return {
    eventId: event.id,
    etag: event.etag,
    status: event.status,
    htmlLink: event.htmlLink ?? null,
    summary: event.summary,
    start: eventTime(event.start),
    end: eventTime(event.end),
    updated: event.updated ?? null,
  }
}

function eventBody(parameters: z.infer<typeof calendarCreateParametersSchema>) {
  return {
    summary: parameters.summary,
    description: parameters.description,
    location: parameters.location,
    start: parameters.start,
    end: parameters.end,
    attendees: parameters.attendees.map((email) => ({ email })),
  }
}

function sameEvent(
  event: z.infer<typeof providerEventSchema>,
  parameters: z.infer<typeof calendarCreateParametersSchema>
): boolean {
  return (
    event.summary === parameters.summary &&
    event.description === parameters.description &&
    event.location === parameters.location &&
    eventTime(event.start) === parameters.start.dateTime &&
    (event.start.timeZone ?? "") === (parameters.start.timeZone ?? "") &&
    eventTime(event.end) === parameters.end.dateTime &&
    (event.end.timeZone ?? "") === (parameters.end.timeZone ?? "") &&
    event.attendees
      .map(({ email }) => email)
      .sort()
      .join("\0") === [...parameters.attendees].sort().join("\0")
  )
}

function calendarEventUrl(calendarId: string, eventId?: string): URL {
  const suffix = eventId ? `/events/${encodeURIComponent(eventId)}` : "/events"
  return googleApiUrl(
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}${suffix}`
  )
}

async function getEvent(
  calendarId: string,
  eventId: string,
  accessToken: string,
  signal?: AbortSignal
) {
  return googleJson(
    calendarEventUrl(calendarId, eventId),
    providerEventSchema,
    { accessToken, signal }
  )
}

async function reconcileEvent(
  calendarId: string,
  eventId: string,
  parameters: z.infer<typeof calendarCreateParametersSchema>,
  accessToken: string
) {
  let event: z.infer<typeof providerEventSchema>
  try {
    event = await getEvent(
      calendarId,
      eventId,
      accessToken,
      AbortSignal.timeout(5_000)
    )
  } catch {
    throw new GoogleProviderError(undefined, true)
  }
  if (!sameEvent(event, parameters)) {
    throw new GoogleProviderError(undefined, true)
  }
  return eventResult(event)
}

function deterministicEventId(idempotencyKey: string): string {
  return createHash("sha256").update(idempotencyKey).digest("hex")
}

function createParameters(envelope: ActionIntentEnvelope) {
  return calendarCreateParametersSchema.parse(envelope.parameters)
}

function updateParameters(envelope: ActionIntentEnvelope) {
  return calendarUpdateParametersSchema.parse(envelope.parameters)
}

export const googleCalendarListEventsOperation: ConnectorReadOperation =
  Object.freeze<ConnectorReadOperation>({
    id: "google.calendar.list_events",
    provider: "google",
    actionFamily: "calendar_read",
    classification: "read",
    requiredScopes: Object.freeze([GOOGLE_ACTION_SCOPES.calendar_read]),
    providerErrorMessage: "Google Calendar read failed",
    inputSchema: calendarListInputSchema,
    outputSchema: calendarListOutputSchema,
    async execute(rawInput, credential, signal) {
      const input = calendarListInputSchema.parse(rawInput)
      const url = calendarEventUrl(input.calendarId)
      url.searchParams.set("timeMin", input.timeMin)
      url.searchParams.set("timeMax", input.timeMax)
      url.searchParams.set("maxResults", String(input.maxResults))
      url.searchParams.set("singleEvents", "true")
      url.searchParams.set("orderBy", "startTime")
      if (input.pageToken) url.searchParams.set("pageToken", input.pageToken)
      const response = await googleJson(url, calendarListResponseSchema, {
        accessToken: credential.accessToken,
        signal,
      })
      return {
        events: response.items.map(eventResult),
        nextPageToken: response.nextPageToken ?? null,
      }
    },
  })

export const googleCalendarCreateEventOperation: ConnectorSideEffectOperation =
  Object.freeze<ConnectorSideEffectOperation>({
    id: "google.calendar.create_event",
    revision: "1",
    provider: "google",
    actionFamily: "calendar_create",
    classification: "side_effect",
    requiredScopes: Object.freeze([GOOGLE_ACTION_SCOPES.calendar_create]),
    inputSchema: calendarCreateInputSchema,
    parametersSchema: calendarCreateParametersSchema,
    preconditionsSchema: calendarCreatePreconditionsSchema,
    resultSchema: eventResultSchema,
    providerErrorSchema: googleProviderErrorSchema,
    retrySafety: "provider_idempotency",
    normalize(rawInput) {
      const input = calendarCreateInputSchema.parse(rawInput)
      return {
        target: { calendarId: input.calendarId },
        parameters: input,
        providerPreconditions: {},
      }
    },
    display(envelope) {
      const parameters = createParameters(envelope)
      return Object.freeze({
        title: "Create Google Calendar event",
        details: Object.freeze({
          Calendar: escapeSafeDisplayText(parameters.calendarId),
          Event: escapeSafeDisplayText(parameters.summary),
          Start: parameters.start.dateTime,
          End: parameters.end.dateTime,
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
      const parameters = calendarCreateParametersSchema.parse(rawParameters)
      const eventId = deterministicEventId(invocationIdempotencyKey)
      try {
        const event = await googleJson(
          calendarEventUrl(parameters.calendarId),
          providerEventSchema,
          {
            accessToken: credential.accessToken,
            method: "POST",
            body: { id: eventId, ...eventBody(parameters) },
            signal,
          }
        )
        return eventResult(event)
      } catch (error) {
        if (
          error instanceof GoogleProviderError &&
          (error.status === 409 || (error.outcomeUnknown && !signal?.aborted))
        ) {
          return reconcileEvent(
            parameters.calendarId,
            eventId,
            parameters,
            credential.accessToken
          )
        }
        throw error
      }
    },
    normalizeProviderError: normalizeGoogleProviderError,
  })

export const googleCalendarUpdateEventOperation: ConnectorSideEffectOperation =
  Object.freeze<ConnectorSideEffectOperation>({
    id: "google.calendar.update_event",
    revision: "1",
    provider: "google",
    actionFamily: "calendar_update",
    classification: "side_effect",
    requiredScopes: Object.freeze([GOOGLE_ACTION_SCOPES.calendar_update]),
    inputSchema: calendarUpdateInputSchema,
    parametersSchema: calendarUpdateParametersSchema,
    preconditionsSchema: calendarUpdatePreconditionsSchema,
    resultSchema: eventResultSchema,
    providerErrorSchema: googleProviderErrorSchema,
    retrySafety: "none",
    normalize(rawInput) {
      const input = calendarUpdateInputSchema.parse(rawInput)
      return {
        target: { calendarId: input.calendarId, eventId: input.eventId },
        parameters: {
          calendarId: input.calendarId,
          eventId: input.eventId,
          summary: input.summary,
          description: input.description,
          location: input.location,
          start: input.start,
          end: input.end,
          attendees: input.attendees,
        },
        providerPreconditions: { expectedEtag: input.expectedEtag },
      }
    },
    display(envelope) {
      const parameters = updateParameters(envelope)
      return Object.freeze({
        title: "Update Google Calendar event",
        details: Object.freeze({
          Calendar: escapeSafeDisplayText(parameters.calendarId),
          Event: escapeSafeDisplayText(parameters.summary),
          Start: parameters.start.dateTime,
          End: parameters.end.dateTime,
        }),
      })
    },
    async revalidateProviderPreconditions(
      rawParameters,
      rawPreconditions,
      credential,
      signal
    ) {
      const parameters = calendarUpdateParametersSchema.parse(rawParameters)
      const preconditions =
        calendarUpdatePreconditionsSchema.parse(rawPreconditions)
      const event = await getEvent(
        parameters.calendarId,
        parameters.eventId,
        credential.accessToken,
        signal
      )
      return event.etag === preconditions.expectedEtag
    },
    async execute(
      rawParameters,
      rawPreconditions,
      credential,
      _invocationIdempotencyKey,
      signal
    ) {
      const parameters = calendarUpdateParametersSchema.parse(rawParameters)
      const preconditions =
        calendarUpdatePreconditionsSchema.parse(rawPreconditions)
      try {
        const event = await googleJson(
          calendarEventUrl(parameters.calendarId, parameters.eventId),
          providerEventSchema,
          {
            accessToken: credential.accessToken,
            method: "PATCH",
            headers: { "if-match": preconditions.expectedEtag },
            body: eventBody(parameters),
            signal,
          }
        )
        return eventResult(event)
      } catch (error) {
        if (
          error instanceof GoogleProviderError &&
          error.outcomeUnknown &&
          !signal?.aborted
        ) {
          return reconcileEvent(
            parameters.calendarId,
            parameters.eventId,
            parameters,
            credential.accessToken
          )
        }
        throw error
      }
    },
    normalizeProviderError: normalizeGoogleProviderError,
  })
