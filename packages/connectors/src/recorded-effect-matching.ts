import { createHash } from "node:crypto"
import { canonicalizeActionIntent } from "./action-intent-canonicalization.js"

// Implements docs/designs/recorded-effect-matching.md. Pure: loading recordings, authorizing the
// caller and running the Agent belong to the diagnostic runner.

export type RecordedEffect = {
  operationId: string
  /** Null on Executions recorded before operations carried a version; never matchable. */
  operationVersion: string | null
  /** The operation input, without credentials or the Connection id. */
  parameters: unknown
  environmentId: string
  externalSubjectId: string | null
  connectionId: string
  sequence: number
  outcome: "succeeded" | "failed" | "unknown"
  /** False for a write that was rejected or awaited consent and so never reached the provider. */
  executed: boolean
  result: unknown
  /** False when the stored result was redacted or truncated. */
  contentComplete: boolean
  expiresAt: Date
  erasedAt: Date | null
}

export type EffectCall = {
  operationId: string
  operationVersion: string
  parameters: unknown
  connectionId: string
}

export type DiagnosticScope = {
  environmentId: string
  externalSubjectId: string | null
}

export type UnavailableReason =
  | "ambiguous_match"
  | "changed_request"
  | "erased"
  | "expired"
  | "legacy_recording"
  | "not_executed"
  | "redacted"
  | "reordered_call"
  | "uncertain_outcome"
  | "unrecorded_call"
  | "wrong_environment"
  | "wrong_subject"

export type Unavailable = {
  status: "unavailable"
  reason: UnavailableReason
  /** Absent when the run was unavailable before any call, or at its end. */
  call?: EffectCall
}

export type RecordedResult = {
  status: "recorded"
  outcome: "succeeded" | "failed"
  result: unknown
  sequence: number
}

export type MatchingOutcome =
  Unavailable | { status: "completed"; unconsumed: RecordedEffect[] }

type Identity = { operation: string; full: string }

function sha256(text: string) {
  return createHash("sha256").update(text, "utf8").digest("base64url")
}

/** Undefined when the parameters are not I-JSON, which can match nothing. */
function identityOf(effect: {
  operationId: string
  operationVersion: string | null
  parameters: unknown
  connectionId: string
}): Identity | undefined {
  if (effect.operationVersion === null) return undefined
  const operation = JSON.stringify([
    effect.operationId,
    effect.operationVersion,
    effect.connectionId,
  ])
  let canonical: string
  try {
    canonical = canonicalizeActionIntent(effect.parameters)
  } catch {
    // Not I-JSON (NaN, an infinity, a lone surrogate): the caller reports it as unmatched.
    return undefined
  }
  return { operation, full: `${operation}:${sha256(canonical)}` }
}

function eligibility(
  recording: RecordedEffect,
  scope: DiagnosticScope,
  now: Date
): UnavailableReason | undefined {
  if (recording.environmentId !== scope.environmentId)
    return "wrong_environment"
  if (recording.externalSubjectId !== scope.externalSubjectId)
    return "wrong_subject"
  if (recording.erasedAt !== null) return "erased"
  if (recording.expiresAt.getTime() <= now.getTime()) return "expired"
  return undefined
}

/** Identities recorded more than once with differing results, where an ordinal cannot say which
 * occurrence a changed run meant. */
function ambiguousIdentities(recordings: RecordedEffect[]): Set<string> {
  const results = new Map<string, Set<string>>()
  for (const recording of recordings) {
    const identity = identityOf(recording)
    if (!identity) continue
    const seen = results.get(identity.full) ?? new Set<string>()
    seen.add(JSON.stringify([recording.outcome, recording.result]))
    results.set(identity.full, seen)
  }
  return new Set(
    [...results].filter(([, seen]) => seen.size > 1).map(([full]) => full)
  )
}

/** Answers a diagnostic run's effect calls from the source Execution's recordings, strictly in
 * recorded order. Once unavailable it stays unavailable. */
export function createRecordedEffectMatcher(
  recordings: RecordedEffect[],
  scope: DiagnosticScope
) {
  const ordered = recordings
    .slice()
    .sort((left, right) => left.sequence - right.sequence)
  const identities = ordered.map(identityOf)
  const ambiguous = ambiguousIdentities(ordered)
  let cursor = 0
  let stopped: Unavailable | undefined

  function stop(reason: UnavailableReason, call?: EffectCall): Unavailable {
    stopped = { status: "unavailable", reason, call }
    return stopped
  }

  function mismatch(call: EffectCall, identity: Identity | undefined) {
    const expected = identities[cursor]
    if (
      (identity && ambiguous.has(identity.full)) ||
      (expected && ambiguous.has(expected.full))
    )
      return stop("ambiguous_match", call)
    if (identity && identities.some((other) => other?.full === identity.full))
      return stop("reordered_call", call)
    if (identity && expected?.operation === identity.operation)
      return stop("changed_request", call)
    return stop("unrecorded_call", call)
  }

  return {
    /** Checks every recording's scope, erasure and expiry before the run makes a call. */
    start(now: Date): Unavailable | undefined {
      for (const recording of ordered) {
        const reason = eligibility(recording, scope, now)
        if (reason) return stop(reason)
      }
      return undefined
    },
    match(call: EffectCall, now: Date): RecordedResult | Unavailable {
      if (stopped) return stopped
      const recording = ordered.at(cursor)
      const identity = identityOf(call)
      if (!recording) {
        return identity && ambiguous.has(identity.full)
          ? stop("ambiguous_match", call)
          : stop("unrecorded_call", call)
      }
      const ineligible = eligibility(recording, scope, now)
      if (ineligible) return stop(ineligible, call)
      if (recording.operationVersion === null)
        return stop("legacy_recording", call)
      if (!identity || identity.full !== identities[cursor]?.full)
        return mismatch(call, identity)
      if (!recording.contentComplete) return stop("redacted", call)
      if (!recording.executed) return stop("not_executed", call)
      if (recording.outcome === "unknown")
        return stop("uncertain_outcome", call)
      cursor += 1
      return {
        status: "recorded",
        outcome: recording.outcome,
        result: recording.result,
        sequence: recording.sequence,
      }
    },
    /** Leftover recordings are differences, never a pass; an ambiguous one is unavailable. */
    finish(): MatchingOutcome {
      if (stopped) return stopped
      const unconsumed = ordered.slice(cursor)
      const leftoverAmbiguous = identities
        .slice(cursor)
        .some((identity) => identity && ambiguous.has(identity.full))
      if (leftoverAmbiguous) return stop("ambiguous_match")
      return { status: "completed", unconsumed }
    },
  }
}
