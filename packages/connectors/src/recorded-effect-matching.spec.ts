import { describe, expect, it } from "vitest"
import {
  createRecordedEffectMatcher,
  type EffectCall,
  type RecordedEffect,
} from "./recorded-effect-matching.js"

const now = new Date("2026-11-01T00:00:00Z")
const scope = { environmentId: "env-1", externalSubjectId: "subject-1" }

function recording(
  sequence: number,
  parameters: unknown,
  overrides: Partial<RecordedEffect> = {}
): RecordedEffect {
  return {
    operationId: "github.issues.list",
    operationVersion: "1",
    parameters,
    environmentId: "env-1",
    externalSubjectId: "subject-1",
    connectionId: "connection-1",
    sequence,
    outcome: "succeeded",
    executed: true,
    result: { sequence },
    contentComplete: true,
    expiresAt: new Date("2026-12-01T00:00:00Z"),
    erasedAt: null,
    ...overrides,
  }
}

function call(
  parameters: unknown,
  overrides: Partial<EffectCall> = {}
): EffectCall {
  return {
    operationId: "github.issues.list",
    operationVersion: "1",
    parameters,
    connectionId: "connection-1",
    ...overrides,
  }
}

describe("recorded-effect matching", () => {
  it("answers calls in recorded order and ignores object key order and number spelling", () => {
    const matcher = createRecordedEffectMatcher(
      [
        recording(2, { repo: "a/b", page: 2 }),
        recording(1, { repo: "a/b", page: 1 }),
      ],
      scope
    )
    expect(matcher.start(now)).toBeUndefined()
    expect(matcher.match(call({ page: 1.0, repo: "a/b" }), now)).toEqual({
      status: "recorded",
      outcome: "succeeded",
      result: { sequence: 1 },
      sequence: 1,
    })
    expect(matcher.match(call({ repo: "a/b", page: 2 }), now)).toMatchObject({
      sequence: 2,
    })
    expect(matcher.finish(now)).toEqual({ status: "completed", unconsumed: [] })
  })

  it("makes identical repeated calls consume successive recordings, never one twice", () => {
    const same = { repo: "a/b" }
    const matcher = createRecordedEffectMatcher(
      [
        recording(1, same, { result: "x" }),
        recording(2, same, { result: "x" }),
      ],
      scope
    )
    expect(matcher.match(call(same), now)).toMatchObject({ sequence: 1 })
    expect(matcher.match(call(same), now)).toMatchObject({ sequence: 2 })
    expect(matcher.match(call(same), now)).toMatchObject({
      status: "unavailable",
      reason: "unrecorded_call",
    })
  })

  it("reports a call made earlier or later than recorded as reordered", () => {
    const recordings = [recording(1, { page: 1 }), recording(2, { page: 2 })]
    const later = createRecordedEffectMatcher(recordings, scope)
    expect(later.match(call({ page: 2 }), now)).toMatchObject({
      status: "unavailable",
      reason: "reordered_call",
    })
    const earlier = createRecordedEffectMatcher(recordings, scope)
    earlier.match(call({ page: 1 }), now)
    expect(earlier.match(call({ page: 1 }), now)).toMatchObject({
      reason: "reordered_call",
    })
  })

  it.each([
    ["a changed value", { labels: ["bug", "p1"], state: "closed" }],
    ["reordered array elements", { labels: ["p1", "bug"], state: "open" }],
    ["an added member", { labels: ["bug", "p1"], state: "open", page: 1 }],
  ])("reports %s as a changed request", (_name, parameters) => {
    const matcher = createRecordedEffectMatcher(
      [recording(1, { labels: ["bug", "p1"], state: "open" })],
      scope
    )
    expect(matcher.match(call(parameters), now)).toMatchObject({
      status: "unavailable",
      reason: "changed_request",
    })
  })

  it.each([
    ["NaN", { page: Number.NaN }],
    ["an infinity", { page: Number.POSITIVE_INFINITY }],
    ["a lone surrogate", { title: "\uD800" }],
  ])("matches nothing for parameters holding %s", (_name, parameters) => {
    const matcher = createRecordedEffectMatcher(
      [recording(1, { page: 1 })],
      scope
    )
    expect(matcher.match(call(parameters), now)).toMatchObject({
      status: "unavailable",
      reason: "unrecorded_call",
    })
  })

  it.each([
    ["another operation", { operationId: "github.issues.create" }],
    ["another operation version", { operationVersion: "2" }],
    ["another Connection", { connectionId: "connection-2" }],
  ])("does not match %s", (_name, overrides) => {
    const matcher = createRecordedEffectMatcher(
      [recording(1, { page: 1 })],
      scope
    )
    expect(matcher.match(call({ page: 1 }, overrides), now)).toMatchObject({
      status: "unavailable",
      reason: "unrecorded_call",
    })
  })

  it("reports a call beyond the recordings as unrecorded and stays unavailable", () => {
    const matcher = createRecordedEffectMatcher(
      [recording(1, { page: 1 })],
      scope
    )
    matcher.match(call({ page: 1 }), now)
    const extra = call({ page: 9 })
    expect(matcher.match(extra, now)).toEqual({
      status: "unavailable",
      reason: "unrecorded_call",
      call: extra,
    })
    expect(matcher.match(call({ page: 1 }), now)).toMatchObject({
      reason: "unrecorded_call",
      call: extra,
    })
    expect(matcher.finish(now)).toMatchObject({ status: "unavailable" })
  })

  it("lists unconsumed recordings as differences rather than a pass", () => {
    const recordings = [recording(1, { page: 1 }), recording(2, { page: 2 })]
    const matcher = createRecordedEffectMatcher(recordings, scope)
    matcher.match(call({ page: 1 }), now)
    expect(matcher.finish(now)).toEqual({
      status: "completed",
      unconsumed: [recordings[1]],
    })
  })

  it.each([
    [
      "another Environment",
      { environmentId: "env-2", externalSubjectId: "subject-1" },
      "wrong_environment",
    ],
    [
      "another subject",
      { environmentId: "env-1", externalSubjectId: "subject-2" },
      "wrong_subject",
    ],
    [
      "no subject",
      { environmentId: "env-1", externalSubjectId: null },
      "wrong_subject",
    ],
  ])("refuses %s before any call", (_name, otherScope, reason) => {
    const matcher = createRecordedEffectMatcher(
      [recording(1, { page: 1 })],
      otherScope
    )
    expect(matcher.start(now)).toEqual({ status: "unavailable", reason })
    expect(matcher.match(call({ page: 1 }), now)).toMatchObject({ reason })
  })

  it("refuses erased and expired recordings before any call", () => {
    const erased = createRecordedEffectMatcher(
      [recording(1, { page: 1 }, { erasedAt: now })],
      scope
    )
    expect(erased.start(now)).toMatchObject({ reason: "erased" })
    const expired = createRecordedEffectMatcher(
      [recording(1, { page: 1 }, { expiresAt: now })],
      scope
    )
    expect(expired.start(now)).toMatchObject({ reason: "expired" })
  })

  it("honours an expiry that passes between two calls of one run", () => {
    const expiresAt = new Date("2026-11-01T00:10:00Z")
    const matcher = createRecordedEffectMatcher(
      [
        recording(1, { page: 1 }, { expiresAt }),
        recording(2, { page: 2 }, { expiresAt }),
      ],
      scope
    )
    expect(matcher.start(now)).toBeUndefined()
    expect(matcher.match(call({ page: 1 }), now)).toMatchObject({
      status: "recorded",
    })
    expect(matcher.match(call({ page: 2 }), expiresAt)).toMatchObject({
      status: "unavailable",
      reason: "expired",
    })
  })

  it("refuses a leftover recording that expired before the run finished", () => {
    const expiresAt = new Date("2026-11-01T00:10:00Z")
    const matcher = createRecordedEffectMatcher(
      [recording(1, { page: 1 }), recording(2, { page: 2 }, { expiresAt })],
      scope
    )
    expect(matcher.start(now)).toBeUndefined()
    expect(matcher.match(call({ page: 1 }), now)).toMatchObject({
      status: "recorded",
    })
    expect(matcher.finish(expiresAt)).toEqual({
      status: "unavailable",
      reason: "expired",
    })
  })

  it.each([
    [
      "an unknown outcome",
      { outcome: "unknown" as const },
      "uncertain_outcome",
    ],
    ["a write that never executed", { executed: false }, "not_executed"],
    ["a redacted or truncated result", { contentComplete: false }, "redacted"],
    [
      "a recording without a version",
      { operationVersion: null },
      "legacy_recording",
    ],
  ])("reports %s as unavailable", (_name, overrides, reason) => {
    const matcher = createRecordedEffectMatcher(
      [recording(1, { page: 1 }, overrides)],
      scope
    )
    expect(matcher.match(call({ page: 1 }), now)).toMatchObject({
      status: "unavailable",
      reason,
    })
  })

  it("returns a recorded failure as a failure", () => {
    const matcher = createRecordedEffectMatcher(
      [recording(1, { page: 1 }, { outcome: "failed", result: { code: 404 } })],
      scope
    )
    expect(matcher.match(call({ page: 1 }), now)).toMatchObject({
      status: "recorded",
      outcome: "failed",
      result: { code: 404 },
    })
  })

  describe("an identity recorded twice with different results", () => {
    const same = { repo: "a/b" }
    const recordings = [
      recording(1, same, { result: ["first"] }),
      recording(2, same, { result: ["second"] }),
      recording(3, { repo: "c/d" }),
    ]

    it("is answered in order when the run makes exactly the recorded calls", () => {
      const matcher = createRecordedEffectMatcher(recordings, scope)
      expect(matcher.match(call(same), now)).toMatchObject({
        result: ["first"],
      })
      expect(matcher.match(call(same), now)).toMatchObject({
        result: ["second"],
      })
      matcher.match(call({ repo: "c/d" }), now)
      expect(matcher.finish(now)).toEqual({
        status: "completed",
        unconsumed: [],
      })
    })

    it("is ambiguous when the run makes fewer calls and moves on", () => {
      const matcher = createRecordedEffectMatcher(recordings, scope)
      matcher.match(call(same), now)
      expect(matcher.match(call({ repo: "c/d" }), now)).toMatchObject({
        status: "unavailable",
        reason: "ambiguous_match",
      })
    })

    it("is ambiguous when the run makes fewer calls and ends", () => {
      const matcher = createRecordedEffectMatcher(recordings.slice(0, 2), scope)
      matcher.match(call(same), now)
      expect(matcher.finish(now)).toEqual({
        status: "unavailable",
        reason: "ambiguous_match",
      })
    })

    it("is ambiguous when the run makes more calls", () => {
      const matcher = createRecordedEffectMatcher(recordings, scope)
      matcher.match(call(same), now)
      matcher.match(call(same), now)
      expect(matcher.match(call(same), now)).toMatchObject({
        status: "unavailable",
        reason: "ambiguous_match",
      })
    })
  })
})
