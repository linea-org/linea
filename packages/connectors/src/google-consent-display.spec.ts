import { describe, expect, it } from "vitest"
import {
  googleCalendarCreateEventOperation,
  googleCalendarUpdateEventOperation,
} from "./google-calendar.operations.js"
import { googleGmailSendMessageOperation } from "./google-gmail.operations.js"
import type { ConnectorSideEffectOperation } from "./connector-side-effect-operation.js"
import { validateSafeDisplay } from "./safe-display.js"

function display(operation: ConnectorSideEffectOperation, input: unknown) {
  const normalized = operation.normalize(input)
  return validateSafeDisplay(
    operation.display({
      version: 1,
      operationRevision: operation.revision,
      connectionId: "connection",
      connector: operation.provider,
      operation: operation.id,
      ...normalized,
    })
  )
}

const event = {
  calendarId: "primary",
  summary: "Meeting",
  description: "Full agenda",
  location: "Room 1",
  start: { dateTime: "2026-11-12T10:00:00.000Z", timeZone: "Europe/London" },
  end: { dateTime: "2026-11-12T11:00:00.000Z", timeZone: "Europe/London" },
  attendees: ["guest@example.com"],
}

describe("Google Action Consent", () => {
  it("displays the complete Gmail body and refuses an oversized display", () => {
    const input = {
      to: ["guest@example.com"],
      subject: "Message",
      textBody: "Complete message",
    }
    expect(display(googleGmailSendMessageOperation, input).details?.Body).toBe(
      input.textBody
    )
    expect(() =>
      display(googleGmailSendMessageOperation, {
        ...input,
        textBody: "x".repeat(9_000),
      })
    ).toThrow("8 KiB")
  })
  it("makes each Calendar create field visible to the approver", () => {
    const original = display(googleCalendarCreateEventOperation, event)
    const changes = [
      { calendarId: "another-calendar" },
      { summary: "Another meeting" },
      { description: "Another agenda" },
      { location: "Room 2" },
      { attendees: ["another@example.com"] },
      { start: { ...event.start, timeZone: "Europe/Paris" } },
      { end: { ...event.end, timeZone: "Europe/Paris" } },
      { start: { ...event.start, dateTime: "2026-11-12T09:00:00.000Z" } },
      { end: { ...event.end, dateTime: "2026-11-12T12:00:00.000Z" } },
    ]
    for (const change of changes)
      expect(
        display(googleCalendarCreateEventOperation, { ...event, ...change })
      ).not.toEqual(original)
  })
  it("identifies the event and every changed Calendar field including removals", () => {
    const input = {
      calendarId: "primary",
      eventId: "event-1",
      expectedEtag: '"v1"',
    }
    for (const change of [
      { description: "" },
      { location: "" },
      { attendees: [] },
      { attendees: ["guest@example.com"] },
    ]) {
      const approval = display(googleCalendarUpdateEventOperation, {
        ...input,
        ...change,
      })
      expect(approval.details).toMatchObject({
        "Event ID": "event-1",
        "Expected version": "&quot;v1&quot;",
      })
      expect(Object.keys(approval.details ?? {})).toHaveLength(4)
    }
    expect(
      display(googleCalendarUpdateEventOperation, { ...input, attendees: [] })
        .details?.Attendees
    ).toBe("Remove all attendees")
  })
})
