import { describe, expect, it } from "vitest"

import {
  filterMentions,
  findMentionTrigger,
  insertMention,
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

describe("insertMention", () => {
  it("replaces the typed query with the reference and a space", () => {
    const text = "why did @ru"
    const trigger = { start: 8, query: "ru" }
    expect(insertMention(text, text.length, trigger, run)).toEqual({
      text: `why did @run:${RUN_ID} `,
      caret: `why did @run:${RUN_ID} `.length,
    })
  })

  it("keeps the text after the caret and puts the caret before it", () => {
    const text = "@wo and more"
    const result = insertMention(text, 3, { start: 0, query: "wo" }, workflow)
    expect(result.text).toBe(`@workflow:${workflow.id}  and more`)
    expect(result.text.slice(result.caret)).toBe(" and more")
  })

  it("inserts the full id, which is what get_run accepts", () => {
    expect(mentionReference(run)).toBe(`@run:${RUN_ID}`)
    expect(mentionReference(application)).toBe(`@application:${application.id}`)
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
