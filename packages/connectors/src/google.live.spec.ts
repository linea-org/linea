import { afterAll, describe, expect, it } from "vitest"
import { z } from "zod"
import {
  googleCalendarCreateEventOperation,
  googleCalendarListEventsOperation,
  googleCalendarUpdateEventOperation,
} from "./google-calendar.operations.js"
import {
  googleGmailListMessagesOperation,
  googleGmailSendMessageOperation,
} from "./google-gmail.operations.js"
import { googleApiUrl } from "./google-http.js"

function environment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for live Google smoke tests`)
  return value
}

describe("live Google smoke", () => {
  const accessToken = environment("GOOGLE_LIVE_ACCESS_TOKEN")
  const recipient = environment("GOOGLE_LIVE_GMAIL_RECIPIENT")
  const calendarId = environment("GOOGLE_LIVE_CALENDAR_ID")
  const credential = { accountId: "live", accessToken, expiresAt: null }
  let eventId: string | undefined

  afterAll(async () => {
    if (!eventId) return
    await fetch(
      googleApiUrl(
        `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
      ),
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}` },
      }
    )
  })

  it("reads Gmail and Calendar and performs consent-bound write shapes", async () => {
    const gmailRead = z
      .object({ messages: z.array(z.unknown()) })
      .parse(
        await googleGmailListMessagesOperation.execute(
          { query: "newer_than:1d", maxResults: 1 },
          credential
        )
      )
    expect(Array.isArray(gmailRead.messages)).toBe(true)
    const now = Date.now()
    const calendarRead = z.object({ events: z.array(z.unknown()) }).parse(
      await googleCalendarListEventsOperation.execute(
        {
          calendarId,
          timeMin: new Date(now - 86_400_000).toISOString(),
          timeMax: new Date(now + 86_400_000).toISOString(),
          maxResults: 1,
        },
        credential
      )
    )
    expect(Array.isArray(calendarRead.events)).toBe(true)
    const gmail = googleGmailSendMessageOperation.normalize({
      to: [recipient],
      cc: [],
      bcc: [],
      subject: "Linea Google connector live smoke",
      textBody: "Credentialed live smoke test.",
    })
    const sent = z
      .object({ messageId: z.string() })
      .parse(
        await googleGmailSendMessageOperation.execute(
          gmail.parameters,
          gmail.providerPreconditions,
          credential,
          `live-gmail-${now}`
        )
      )
    expect(sent.messageId.length).toBeGreaterThan(0)
    const event = {
      calendarId,
      summary: "Linea Google connector live smoke",
      description: "Credentialed live smoke test.",
      location: "",
      start: { dateTime: new Date(now + 3_600_000).toISOString() },
      end: { dateTime: new Date(now + 7_200_000).toISOString() },
      attendees: [],
    }
    const create = googleCalendarCreateEventOperation.normalize(event)
    const created = z
      .object({ eventId: z.string(), etag: z.string() })
      .parse(
        await googleCalendarCreateEventOperation.execute(
          create.parameters,
          create.providerPreconditions,
          credential,
          `live-calendar-${now}`
        )
      )
    eventId = created.eventId
    const update = googleCalendarUpdateEventOperation.normalize({
      ...event,
      eventId,
      expectedEtag: created.etag,
      summary: "Linea Google connector live smoke updated",
    })
    const updated = z
      .object({ summary: z.string() })
      .parse(
        await googleCalendarUpdateEventOperation.execute(
          update.parameters,
          update.providerPreconditions,
          credential,
          `live-calendar-update-${now}`
        )
      )
    expect(updated.summary).toBe("Linea Google connector live smoke updated")
  }, 30_000)
})
