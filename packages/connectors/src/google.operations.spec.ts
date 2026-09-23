import { createServer, type IncomingMessage, type Server } from "node:http"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"
import { googleCalendarCreateEventOperation } from "./google-calendar.operations.js"
import { googleCalendarListEventsOperation } from "./google-calendar.operations.js"
import { googleCalendarUpdateEventOperation } from "./google-calendar.operations.js"
import {
  googleGmailListMessagesOperation,
  googleGmailSendMessageOperation,
} from "./google-gmail.operations.js"
import {
  GoogleRefreshInvalidGrantError,
  refreshGoogleCredential,
} from "./google-credential-refresh.js"
import { googleApiUrl, googleJson, GoogleProviderError } from "./google-http.js"
import {
  GOOGLE_ACTION_SCOPES,
  normalizeGoogleGrantedScopes,
} from "./google-scopes.js"

const credential = {
  accountId: "google-account",
  accessToken: "private-google-access-token",
  expiresAt: null,
  scopes: Object.values(GOOGLE_ACTION_SCOPES),
}
const eventInput = {
  calendarId: "primary",
  summary: "Planning",
  description: "Private agenda",
  location: "Room 1",
  start: { dateTime: "2026-10-01T10:00:00.000Z" },
  end: { dateTime: "2026-10-01T11:00:00.000Z" },
  attendees: ["guest@example.com"],
}

type StoredEvent = Omit<typeof eventInput, "attendees"> & {
  attendees: Array<{ email: string }>
  id: string
  etag: string
  status: string
  htmlLink: string
  updated: string
}

function requestText(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    request.on("error", reject)
  })
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
  return JSON.parse(await requestText(request)) as unknown
}

describe("Google Connector Operations", () => {
  let server: Server
  let gmailRaw = ""
  let sentMessageId = ""
  let gmailSendAmbiguous = true
  let gmailMalformedResponse = false
  let gmailReconciliationFailure = false
  let gmailReadCount = 0
  let calendarCreateAmbiguous = true
  let calendarPatchCount = 0
  let redirectToken = false
  let redirectGmail = false
  let redirectedRequests = 0
  let lastCalendarPatch: unknown
  const events = new Map<string, StoredEvent>()

  beforeAll(async () => {
    server = createServer((request, response) => {
      const run = async (): Promise<void> => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1")
        if (url.pathname === "/credential-leak") {
          redirectedRequests += 1
          response.writeHead(200).end()
          return
        }
        if (request.method === "POST" && url.pathname === "/token") {
          if (redirectToken) {
            response.writeHead(307, { location: "/credential-leak" }).end()
            return
          }
          const input = new URLSearchParams(await requestText(request))
          if (input.get("refresh_token") === "invalid") {
            response
              .writeHead(400, { "content-type": "application/json" })
              .end(JSON.stringify({ error: "invalid_grant" }))
            return
          }
          response.writeHead(200, { "content-type": "application/json" }).end(
            JSON.stringify({
              access_token: "rotated-access-token",
              refresh_token: "rotated-refresh-token",
              expires_in: 3600,
              scope: "scope:one scope:two",
            })
          )
          return
        }
        if (
          request.headers.authorization !== `Bearer ${credential.accessToken}`
        ) {
          response.writeHead(401).end()
          return
        }
        if (
          request.method === "GET" &&
          url.pathname === "/gmail/v1/users/me/messages"
        ) {
          if (redirectGmail) {
            response.writeHead(307, { location: "/credential-leak" }).end()
            return
          }
          gmailReadCount += 1
          if (gmailReconciliationFailure) {
            response.writeHead(401).end()
            return
          }
          const messages = sentMessageId
            ? [{ id: "gmail-message", threadId: "gmail-thread" }]
            : [{ id: "read-message", threadId: "read-thread" }]
          response.writeHead(200, { "content-type": "application/json" }).end(
            JSON.stringify({
              messages,
              nextPageToken: "next-page",
              resultSizeEstimate: messages.length,
              rawSecret: credential.accessToken,
            })
          )
          return
        }
        if (
          request.method === "POST" &&
          url.pathname === "/gmail/v1/users/me/messages/send"
        ) {
          const body = (await requestBody(request)) as { raw?: unknown }
          gmailRaw = Buffer.from(String(body.raw), "base64url").toString("utf8")
          sentMessageId = gmailRaw.match(/Message-ID: ([^\r]+)/)?.[1] ?? ""
          if (gmailSendAmbiguous) {
            gmailSendAmbiguous = false
            response.writeHead(504).end()
            return
          }
          if (gmailMalformedResponse) {
            gmailMalformedResponse = false
            response
              .writeHead(200, { "content-type": "application/json" })
              .end(JSON.stringify({ malformed: true }))
            return
          }
          response.writeHead(200, { "content-type": "application/json" }).end(
            JSON.stringify({
              id: "gmail-message",
              threadId: "gmail-thread",
              labelIds: ["SENT"],
              rawSecret: credential.accessToken,
            })
          )
          return
        }
        const calendarMatch = url.pathname.match(
          /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/
        )
        if (calendarMatch) {
          const eventId = calendarMatch[2]
            ? decodeURIComponent(calendarMatch[2])
            : undefined
          if (request.method === "GET" && !eventId) {
            response.writeHead(200, { "content-type": "application/json" }).end(
              JSON.stringify({
                items: [...events.values()],
                nextPageToken: "calendar-next",
                rawSecret: credential.accessToken,
              })
            )
            return
          }
          if (request.method === "GET" && eventId) {
            const event = events.get(eventId)
            response
              .writeHead(event ? 200 : 404, {
                "content-type": "application/json",
              })
              .end(event ? JSON.stringify(event) : JSON.stringify({}))
            return
          }
          if (request.method === "POST" && !eventId) {
            const body = (await requestBody(request)) as Omit<
              StoredEvent,
              "etag" | "status" | "htmlLink" | "updated"
            >
            const event: StoredEvent = {
              ...body,
              etag: '"v1"',
              status: "confirmed",
              htmlLink: `https://calendar.example/events/${body.id}`,
              updated: "2026-10-01T09:00:00.000Z",
            }
            if (events.has(body.id)) {
              response.writeHead(409).end()
              return
            }
            events.set(
              body.id,
              calendarCreateAmbiguous
                ? {
                    ...event,
                    start: { dateTime: "2026-10-01T06:00:00-04:00" },
                    end: { dateTime: "2026-10-01T07:00:00-04:00" },
                    attendees: event.attendees.map(({ email }) => ({
                      email: email.toUpperCase(),
                    })),
                  }
                : event
            )
            if (calendarCreateAmbiguous) {
              calendarCreateAmbiguous = false
              response.writeHead(504).end()
              return
            }
            response
              .writeHead(200, { "content-type": "application/json" })
              .end(JSON.stringify(event))
            return
          }
          if (request.method === "PATCH" && eventId) {
            calendarPatchCount += 1
            const current = events.get(eventId)
            if (!current || request.headers["if-match"] !== current.etag) {
              response.writeHead(412).end()
              return
            }
            const patch = (await requestBody(request)) as Pick<
              StoredEvent,
              | "summary"
              | "description"
              | "location"
              | "start"
              | "end"
              | "attendees"
            >
            lastCalendarPatch = patch
            const event = {
              ...current,
              ...patch,
              etag: '"v2"',
              updated: "2026-10-01T09:30:00.000Z",
            }
            events.set(eventId, event)
            response
              .writeHead(200, { "content-type": "application/json" })
              .end(JSON.stringify(event))
            return
          }
        }
        response.writeHead(404).end()
      }
      void run().catch(() => response.writeHead(500).end())
    })
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })
    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("Test Google API did not bind a TCP port")
    }
    process.env.GOOGLE_CONNECTOR_API_BASE_URL = `http://127.0.0.1:${address.port}`
    process.env.GOOGLE_CONNECTOR_TOKEN_URL = `http://127.0.0.1:${address.port}/token`
    process.env.GOOGLE_CONNECTOR_CLIENT_ID = "test-client"
    process.env.GOOGLE_CONNECTOR_CLIENT_SECRET = "test-secret"
  })

  afterAll(async () => {
    delete process.env.GOOGLE_CONNECTOR_API_BASE_URL
    delete process.env.GOOGLE_CONNECTOR_TOKEN_URL
    delete process.env.GOOGLE_CONNECTOR_CLIENT_ID
    delete process.env.GOOGLE_CONNECTOR_CLIENT_SECRET
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it("bounds and normalizes Gmail and Calendar reads", async () => {
    expect(() =>
      googleGmailListMessagesOperation.inputSchema.parse({ maxResults: 101 })
    ).toThrow()
    expect(() =>
      googleCalendarListEventsOperation.inputSchema.parse({
        calendarId: "primary",
        timeMin: "2026-01-01T00:00:00.000Z",
        timeMax: "2028-01-01T00:00:00.000Z",
      })
    ).toThrow()
    const gmail = await googleGmailListMessagesOperation.execute(
      { query: "is:unread", maxResults: 10 },
      credential
    )
    expect(gmail).toEqual({
      messages: [{ id: "read-message", threadId: "read-thread" }],
      nextPageToken: "next-page",
      resultSizeEstimate: 1,
    })
    events.set("read-event", {
      ...eventInput,
      attendees: eventInput.attendees.map((email) => ({ email })),
      id: "read-event",
      etag: '"read-v1"',
      status: "confirmed",
      htmlLink: "https://calendar.example/events/read-event",
      updated: "2026-10-01T08:00:00.000Z",
    })
    events.set("large-event", {
      ...eventInput,
      description: "x".repeat(11_000),
      attendees: Array.from({ length: 101 }, (_, index) => ({
        email: `guest-${index}@example.com`,
      })),
      id: "large-event",
      etag: '"large-v1"',
      status: "confirmed",
      htmlLink: "https://calendar.example/events/large-event",
      updated: "2026-10-01T08:00:00.000Z",
    })
    const calendar = await googleCalendarListEventsOperation.execute(
      {
        calendarId: "primary",
        timeMin: "2026-10-01T00:00:00.000Z",
        timeMax: "2026-10-02T00:00:00.000Z",
        maxResults: 10,
      },
      credential
    )
    expect(JSON.stringify(calendar)).not.toContain(credential.accessToken)
    expect(calendar).toEqual(
      expect.objectContaining({ nextPageToken: "calendar-next" })
    )
    const listed = z
      .object({ events: z.array(z.object({ eventId: z.string() })) })
      .parse(calendar)
    expect(listed.events.map(({ eventId }) => eventId)).toContain("large-event")
    events.delete("large-event")
  })

  it("rotates Google access and refresh tokens and rejects invalid grants", async () => {
    expect(
      normalizeGoogleGrantedScopes(
        "openid https://www.googleapis.com/auth/userinfo.email email"
      )
    ).toEqual(["email", "openid"])
    const current = {
      accountId: "google-account",
      accountLabel: "account@example.com",
      accessToken: "expired-access-token",
      refreshToken: "current-refresh-token",
      expiresAt: "2000-01-01T00:00:00.000Z",
      grantedScopes: ["scope:one", "scope:two"],
    }
    await expect(refreshGoogleCredential(current)).resolves.toEqual(
      expect.objectContaining({
        accountId: current.accountId,
        accessToken: "rotated-access-token",
        refreshToken: "rotated-refresh-token",
        grantedScopes: ["scope:one", "scope:two"],
      })
    )
    await expect(
      refreshGoogleCredential({ ...current, refreshToken: "invalid" })
    ).rejects.toBeInstanceOf(GoogleRefreshInvalidGrantError)
  })

  it("rejects remote HTTP endpoints and credential-bearing redirects", async () => {
    const apiBaseUrl = process.env.GOOGLE_CONNECTOR_API_BASE_URL
    const tokenUrl = process.env.GOOGLE_CONNECTOR_TOKEN_URL
    if (!apiBaseUrl || !tokenUrl)
      throw new Error("Google test provider is missing")
    const current = {
      accountId: "google-account",
      accountLabel: "account@example.com",
      accessToken: "expired-access-token",
      refreshToken: "current-refresh-token",
      expiresAt: "2000-01-01T00:00:00.000Z",
      grantedScopes: ["scope:one"],
    }
    try {
      process.env.GOOGLE_CONNECTOR_API_BASE_URL = "http://google.example.test"
      expect(() => googleApiUrl("/gmail/v1/users/me/messages")).toThrow(
        "Google endpoint must use HTTPS"
      )
      process.env.GOOGLE_CONNECTOR_TOKEN_URL =
        "http://google.example.test/token"
      await expect(refreshGoogleCredential(current)).rejects.toThrow(
        "Google endpoint must use HTTPS"
      )
      process.env.GOOGLE_CONNECTOR_API_BASE_URL = apiBaseUrl
      process.env.GOOGLE_CONNECTOR_TOKEN_URL = tokenUrl
      redirectToken = true
      await expect(refreshGoogleCredential(current)).rejects.toThrow()
      redirectToken = false
      redirectGmail = true
      await expect(
        googleJson(googleApiUrl("/gmail/v1/users/me/messages"), z.unknown(), {
          accessToken: credential.accessToken,
        })
      ).rejects.toBeInstanceOf(GoogleProviderError)
      expect(redirectedRequests).toBe(0)
    } finally {
      redirectToken = false
      redirectGmail = false
      process.env.GOOGLE_CONNECTOR_API_BASE_URL = apiBaseUrl
      process.env.GOOGLE_CONNECTOR_TOKEN_URL = tokenUrl
    }
  })

  it("sends the exact Gmail intent and reconciles an ambiguous response", async () => {
    const input = {
      to: ["to@example.com"],
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
      subject: "Exact subject",
      textBody: "Exact private body",
    }
    const normalized = googleGmailSendMessageOperation.normalize(input)
    const result = await googleGmailSendMessageOperation.execute(
      normalized.parameters,
      normalized.providerPreconditions,
      credential,
      "gmail-invocation",
      undefined
    )
    expect(result).toEqual({
      messageId: "gmail-message",
      threadId: "gmail-thread",
      labelIds: [],
    })
    expect(gmailRaw).toContain("To: to@example.com")
    expect(gmailRaw).toContain("Cc: cc@example.com")
    expect(gmailRaw).toContain("Bcc: bcc@example.com")
    expect(gmailRaw).toContain(Buffer.from(input.textBody).toString("base64"))
    const display = googleGmailSendMessageOperation.display({
      version: 1,
      operationRevision: "1",
      connectionId: "connection",
      connector: "google",
      operation: googleGmailSendMessageOperation.id,
      target: normalized.target,
      parameters: normalized.parameters,
      providerPreconditions: normalized.providerPreconditions,
    })
    expect(display).toEqual({
      title: "Send Gmail message",
      details: {
        To: "to@example.com",
        Cc: "cc@example.com",
        Bcc: "bcc@example.com",
        Subject: "Exact subject",
      },
    })
    expect(JSON.stringify(display)).not.toContain(input.textBody)
    gmailMalformedResponse = true
    await expect(
      googleGmailSendMessageOperation.execute(
        normalized.parameters,
        normalized.providerPreconditions,
        credential,
        "gmail-malformed-response",
        undefined
      )
    ).resolves.toEqual(expect.objectContaining({ messageId: "gmail-message" }))
    gmailSendAmbiguous = true
    gmailReconciliationFailure = true
    await expect(
      googleGmailSendMessageOperation.execute(
        normalized.parameters,
        normalized.providerPreconditions,
        credential,
        "gmail-unreconciled-response",
        undefined
      )
    ).rejects.toMatchObject({ outcomeUnknown: true })
    gmailReconciliationFailure = false
    gmailSendAmbiguous = true
    const readCount = gmailReadCount
    await expect(
      googleGmailSendMessageOperation.execute(
        normalized.parameters,
        normalized.providerPreconditions,
        { ...credential, scopes: [GOOGLE_ACTION_SCOPES.gmail_send] },
        "gmail-send-only",
        undefined
      )
    ).rejects.toMatchObject({ outcomeUnknown: true })
    expect(gmailReadCount).toBe(readCount)
  })

  it("reconciles Calendar creates with a deterministic provider id", async () => {
    const normalized = googleCalendarCreateEventOperation.normalize(eventInput)
    const result = await googleCalendarCreateEventOperation.execute(
      normalized.parameters,
      normalized.providerPreconditions,
      credential,
      "calendar-create-invocation",
      undefined
    )
    expect(result).toEqual(
      expect.objectContaining({ summary: eventInput.summary, etag: '"v1"' })
    )
    expect(events.size).toBe(2)
  })

  it("revalidates Calendar versions and sends If-Match on updates", async () => {
    const eventId = "read-event"
    const input = { ...eventInput, eventId, expectedEtag: '"read-v1"' }
    const normalized = googleCalendarUpdateEventOperation.normalize(input)
    await expect(
      googleCalendarUpdateEventOperation.revalidateProviderPreconditions(
        normalized.parameters,
        normalized.providerPreconditions,
        credential
      )
    ).resolves.toBe(true)
    events.set(eventId, { ...events.get(eventId)!, etag: '"stale"' })
    await expect(
      googleCalendarUpdateEventOperation.revalidateProviderPreconditions(
        normalized.parameters,
        normalized.providerPreconditions,
        credential
      )
    ).resolves.toBe(false)
    expect(calendarPatchCount).toBe(0)
    const current = events.get(eventId)
    if (!current) throw new Error("Expected Calendar event")
    const currentInput = {
      ...input,
      summary: "Updated planning",
      expectedEtag: current.etag,
    }
    const currentNormalized =
      googleCalendarUpdateEventOperation.normalize(currentInput)
    const result = await googleCalendarUpdateEventOperation.execute(
      currentNormalized.parameters,
      currentNormalized.providerPreconditions,
      credential,
      "calendar-update-invocation",
      undefined
    )
    expect(result).toEqual(
      expect.objectContaining({ summary: "Updated planning", etag: '"v2"' })
    )
    expect(calendarPatchCount).toBe(1)
    const summaryOnly = googleCalendarUpdateEventOperation.normalize({
      calendarId: "primary",
      eventId,
      expectedEtag: '"v2"',
      summary: "Summary only",
    })
    await googleCalendarUpdateEventOperation.execute(
      summaryOnly.parameters,
      summaryOnly.providerPreconditions,
      credential,
      "calendar-summary-only",
      undefined
    )
    expect(lastCalendarPatch).toEqual({ summary: "Summary only" })
    expect(events.get(eventId)).toMatchObject({
      summary: "Summary only",
      description: eventInput.description,
      location: eventInput.location,
      attendees: eventInput.attendees.map((email) => ({ email })),
    })
    expect(() =>
      googleCalendarUpdateEventOperation.normalize({
        calendarId: "primary",
        eventId,
        expectedEtag: '"v2"',
      })
    ).toThrow()
  })

  it("redacts provider failures and marks ambiguous outcomes honestly", () => {
    expect(
      googleCalendarCreateEventOperation.normalizeProviderError(
        new Error(`private response ${credential.accessToken}`)
      )
    ).toEqual({
      code: "provider_failed",
      message: "Google provider request failed",
      outcomeUnknown: false,
    })
    expect(
      googleGmailSendMessageOperation.normalizeProviderError(
        new GoogleProviderError(undefined, true)
      )
    ).toEqual({
      code: "outcome_unknown",
      message: "Google operation outcome could not be reconciled",
      outcomeUnknown: true,
    })
  })
})
