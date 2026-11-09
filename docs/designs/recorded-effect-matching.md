# Recorded-effect matching for diagnostic runs

Specifies how a diagnostic run (Agent Replay, and later Regression) finds the
recorded result for an external effect, as required by
[ADR 0024](../adr/0024-use-recorded-effects-in-diagnostic-runs.md) before any
diagnostic dispatch is enabled (#207). Access and retention policy is in
[ADR 0026](../adr/0026-scope-agent-diagnostics-to-admins-and-source-retention.md).
This is a target specification; nothing here is implemented yet.

## Principles

1. A diagnostic run never contacts a provider, resolves a live Connection, or
   creates an Action Intent, approval, or other persistent product effect.
2. Matching is deterministic and strict. When the answer is not exactly one
   recording, the run is **unavailable**. It is never "passed" and never falls
   back to a live call.
3. A reused result is evidence of what happened before, not proof that the
   changed Agent is correct.

## What is recorded

A Recorded Effect is derived from a completed Connector step of the source
Agent Execution (`execution_steps` with `node_type = connector`). Each carries:

| Field                 | Source                                                                  |
| --------------------- | ----------------------------------------------------------------------- |
| `operationId`         | the registered Connector Operation id                                   |
| `operationVersion`    | the registry version of the operation's request contract at record time |
| `parameters`          | the operation `input`, canonicalized (below)                            |
| `parametersHash`      | SHA-256 of the canonical bytes                                          |
| `environmentId`       | source Environment                                                      |
| `externalSubjectId`   | source subject record, when the Execution had one                       |
| `connectionId`        | the Connection the call named (identity only, never credentials)        |
| `sequence`            | the step's order within the source Execution                            |
| `outcome`             | `succeeded`, `failed`, or `unknown`                                     |
| `result`              | the recorded response body, bounded and redacted as in run detail       |
| `recordedAt` / expiry | per ADR 0026                                                            |

Executions recorded before `operationVersion` existed have no usable recording:
every call against them is unavailable (`legacy_recording`).

## Canonicalization

Parameters are canonicalized with RFC 8785 JSON Canonicalization, the same
canonicalizer ADR 0018 uses for Action Intents. Rules that matter for matching:

- Object key order is irrelevant; array order is significant.
- Numbers use the RFC 8785 form, so `1` and `1.0` are equal; `NaN`, infinities
  and values outside the I-JSON range reject the call as unmatched.
- Credentials and the `connectionId` are not part of the hash. The Connection
  is compared separately by identity.
- Duplicate object members are a parse error, not a last-one-wins merge.

## Call identity and occurrence

Call identity is the tuple `(operationId, operationVersion, parametersHash,
connectionId)`. Because changed instructions change turn numbers, the
`agent:tool:<iteration>:<index>` node id is **not** part of the identity.

Matching is strictly sequential over the source Execution's recorded effects,
ordered by `sequence`:

1. The diagnostic run keeps a cursor starting at the first recorded effect.
2. For its next effect call, the run computes the identity and compares it with
   the recording at the cursor. If equal, that recording answers the call and
   the cursor advances by one.
3. If the identity differs from the recording at the cursor, the run is
   **unavailable** (`changed_request` when only parameters differ,
   `reordered_call` when the identity equals a later recording, otherwise
   `unrecorded_call`). The run stops at that call.
4. If the run makes more effect calls than there are recordings, the extra call
   is `unrecorded_call`.
5. If the run finishes with unconsumed recordings, the result is **completed
   with differences** and lists them. It is not a pass.

Repeated identical calls therefore consume successive recordings in order and
cannot reuse one response arbitrarily.

An ordinal alone cannot say which occurrence a changed run meant when it makes
fewer repeated calls than the source. So when an identity was recorded more than
once with results that are not byte-identical, the run must make exactly the
recorded number of calls with that identity. Fewer or more is `ambiguous_match`
for that identity, and the run is unavailable rather than reusing the earlier
occurrence's response for a call that may have meant a later one.

## Recorded outcomes

| Recorded outcome | Diagnostic behaviour                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| `succeeded`      | return the recorded result, labeled `recorded`                         |
| `failed`         | return the recorded failure, labeled `recorded`                        |
| `unknown`        | unavailable (`uncertain_outcome`); never treated as success or retried |

A side-effecting operation (writes) behaves the same: the recorded result is
returned and nothing is dispatched. The Action Intent and approval of the source
run are not recreated. A recording of a write that never reached the provider
(rejected or pending consent) is unavailable (`not_executed`).

## Scope and eligibility

A recording is usable only when all hold at run time:

- its `contentComplete` is true. A redacted or truncated response is
  unavailable (`redacted`) because the rerun would reason over a replacement
  rather than what the source Agent saw;
- same source `environmentId` and, where recorded, same `externalSubjectId`;
- same `connectionId`;
- not expired under the source Environment's retention window;
- not erased (subject erasure, or explicit deletion of recorded content);
- the caller is a signed-in workspace admin or owner authorized in that
  Environment. Workspace API keys and End Users are denied (ADR 0026).

Authorization is checked before a run exists: a denied caller receives an
authorization error and no diagnostic record is created. Every other failure
here is unavailable with `expired`, `erased`, `redacted`, `wrong_environment`
or `wrong_subject`. Expiry is checked at run time, before the purge job runs,
and again when each recording is read so an expiry during a long run is honored.

## Result contract

A diagnostic run ends in exactly one of:

- `unavailable` with a reason from the list above and, when a call stopped it,
  that call. A failure found before any call (for example the initial expiry or
  erasure check) is unavailable with no call;
- `completed`, carrying the changed output and trajectory, the source output
  for comparison, every reused recording labeled `recorded`, any unconsumed
  recordings, and the model usage of the rerun.

There is no `passed` state for a replay. A changed output that looks better is
reported next to the source output and is never described as an improvement.

## Isolation from the source Execution

A diagnostic run has its own record. It reads the source Execution, steps, and
recordings and writes none of them: the source status, approvals, checkpoints,
Action Intents, tool-call ledger and costs are unchanged. Cost and tokens of
the rerun belong to the diagnostic record only.

## Required tests

Each is a named test before diagnostic dispatch is enabled:

- identical repeated calls consume recordings in order and cannot reuse one;
- a call that appears earlier or later than recorded is unavailable, with no
  provider call;
- parameter changes, including reordered array elements and duplicate members,
  are unavailable or rejected rather than matched;
- another Environment, subject, or Connection cannot read the recording;
- expired and erased recordings are unavailable, including expiry between two
  calls of one run;
- an `unknown` recording, a never-executed write, and a redacted or truncated
  response are unavailable;
- two recordings with the same identity and different results make a run with
  fewer or more calls of that identity unavailable (`ambiguous_match`);
- the source Execution row, steps, approvals and Action Intents are unchanged
  after a run;
- API keys and End Users are denied; a non-admin member is denied;
- a recorded result appears labeled in the trace and the response.
