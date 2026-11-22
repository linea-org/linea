import { describe, expect, it } from "vitest"

import {
  filterMentions,
  findMentionTrigger,
  mentionLabel,
  parseMentions,
  serializeSegments,
  mentionReference,
  type MentionCandidate,
} from "./mention-text"

const RUN_ID = "045f759c-1b2a-4c3d-8e4f-5a6b7c8d9e0f"

const run: MentionCandidate = {
  kind: "run",
  id: RUN_ID,
  label: "Summarize tickets",
  detail: "failed",
}
const workflow: MentionCandidate = {
  kind: "workflow",
  id: "11111111-1111-4111-8111-111111111111",
  label: "Summarize tickets",
  detail: "summarize-tickets",
}
const application: MentionCandidate = {
  kind: "application",
  id: "22222222-2222-4222-8222-222222222222",
  label: "Support desk",
  detail: "support-desk",
}
const candidates = [run, workflow, application]

describe("findMentionTrigger", () => {
  it("finds an @ typed at the start or after whitespace", () => {
    expect(findMentionTrigger("@", 1)).toEqual({ start: 0, query: "" })
    expect(findMentionTrigger("why did @ru", 11)).toEqual({
      start: 8,
      query: "ru",
    })
    expect(findMentionTrigger("line\n@wor", 9)).toEqual({
      start: 5,
      query: "wor",
    })
  })

  it("keeps a kind prefix in the query", () => {
    expect(findMentionTrigger("@run:045f", 9)).toEqual({
      start: 0,
      query: "run:045f",
    })
  })

  it("keeps the picker open for names in any script", () => {
    expect(findMentionTrigger("ask @客户", 7)).toEqual({
      start: 4,
      query: "客户",
    })
    expect(findMentionTrigger("@équipe", 7)).toEqual({
      start: 0,
      query: "équipe",
    })
    expect(findMentionTrigger("@team_2", 7)).toEqual({
      start: 0,
      query: "team_2",
    })
  })

  it("ignores an @ inside a word, such as an email address", () => {
    expect(findMentionTrigger("write to bob@example", 20)).toBeNull()
  })

  it("closes once the word ends or the caret leaves it", () => {
    expect(findMentionTrigger("@run ", 5)).toBeNull()
    expect(findMentionTrigger("@run later", 4)).toEqual({
      start: 0,
      query: "run",
    })
    expect(findMentionTrigger("@run later", 10)).toBeNull()
    expect(findMentionTrigger("no mention", 10)).toBeNull()
  })
})

describe("mentionReference", () => {
  it("uses the full id, which is what get_run accepts", () => {
    expect(mentionReference(run)).toBe(`@run:${RUN_ID}`)
    expect(mentionReference(application)).toBe(`@application:${application.id}`)
  })
})

describe("parseMentions and serializeSegments", () => {
  it("round-trips a message with references", () => {
    const text = `why did @run:${RUN_ID} fail in @workflow:${workflow.id}?\nthanks`
    expect(parseMentions(text)).toEqual([
      { type: "text", text: "why did " },
      { type: "mention", kind: "run", id: RUN_ID },
      { type: "text", text: " fail in " },
      { type: "mention", kind: "workflow", id: workflow.id },
      { type: "text", text: "?\nthanks" },
    ])
    expect(serializeSegments(parseMentions(text))).toBe(text)
  })

  it("keeps text without references as one run", () => {
    expect(parseMentions("no mention here")).toEqual([
      { type: "text", text: "no mention here" },
    ])
    expect(serializeSegments([])).toBe("")
  })

  it("leaves a malformed or embedded reference as plain text", () => {
    for (const text of [
      "@run:045f759c",
      `x@run:${RUN_ID}`,
      `@other:${RUN_ID}`,
      `@run:${RUN_ID}0`,
    ]) {
      expect(parseMentions(text)).toEqual([{ type: "text", text }])
    }
  })

  it("sets a reference off with spaces so it stays one token", () => {
    expect(
      serializeSegments([
        { type: "text", text: "see" },
        { type: "mention", kind: "run", id: RUN_ID },
        { type: "text", text: "now" },
      ])
    ).toBe(`see @run:${RUN_ID} now`)
    expect(
      serializeSegments([{ type: "mention", kind: "run", id: RUN_ID }])
    ).toBe(`@run:${RUN_ID}`)
  })
})

describe("mentionLabel", () => {
  it("shows the short id for a run and the name for the rest", () => {
    expect(mentionLabel(run, "Summarize tickets")).toBe("run 045f759c")
    expect(mentionLabel(workflow, "Summarize tickets")).toBe(
      "Summarize tickets"
    )
    expect(mentionLabel(workflow)).toBe("workflow 11111111")
  })
})

describe("filterMentions", () => {
  it("lists everything for a bare @, runs first", () => {
    expect(filterMentions(candidates, "")).toEqual(candidates)
  })

  it("matches label, id and kind, ignoring case", () => {
    expect(filterMentions(candidates, "SUPPORT")).toEqual([application])
    expect(filterMentions(candidates, "045f")).toEqual([run])
    expect(filterMentions(candidates, "app")).toEqual([application])
  })

  it("narrows to one kind with a kind prefix", () => {
    expect(filterMentions(candidates, "workflow:")).toEqual([workflow])
    expect(filterMentions(candidates, "run:summ")).toEqual([run])
    expect(filterMentions(candidates, "run:support")).toEqual([])
  })

  it("treats an unknown prefix as plain text", () => {
    expect(filterMentions(candidates, "other:x")).toEqual([])
  })

  it("shows at most eight of each kind", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...run,
      id: `run-${index}`,
    }))
    expect(filterMentions([...many, workflow], "")).toHaveLength(9)
  })
})
