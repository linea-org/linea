# Treat behavior analysis as an agentic-graph capability, not the wedge

Identity attribution (`triggeredByUserId`/`externalSubjectId` on executions and schedules), a dual-axis
conversation judge (`user_experience` and `agent_behaviour`, independently scored with confidence and
evidence), and a Regression suite that reruns automatically on every Workflow publish are shipped.
PR #98 validated the analyzer against six real-provider scenarios. PR #99 exposed complete Findings,
evidence, and analysis metadata through an authenticated API and the product, with distinct labels for
the curated Flag categories.

Competitive research found that identity attribution is commodity, multi-axis conversation judging is
common as a configurable evaluator, and publish-triggered automatic regression is the least-matched
piece. The combination remains interesting, but the absence of an exact competitor is not evidence
that customers will choose Linea for it.

**Decision:** retain behavior analysis as a supporting platform capability, not a current or next wedge.
Its strongest expected application is to a future agentic-graph capabilities workstream containing
dynamic runtime decisions such as tool selection, loops, parallel branches, subworkflows, and MCP tools.
That workstream is not roadmap Phase 2, which is the Code escape hatch and OTel ingest.

**Why:** real-provider validation and a complete product surface establish that the capability works and
is usable. They do not establish demand. Linea has no customers yet, and the broader strategy review
found that architecture-derived wedge candidates repeatedly lacked demand evidence. The current pitch
therefore remains the hosted execution and checkpoint-backed fix loop described in `docs/strategy.md`.

A human-authored static graph is comparatively predictable. Behavior analysis becomes more valuable
when a graph chooses tools, loops, branches, or delegates at runtime, because those decisions create
more opportunity for hallucination, repetition, instruction drift, and hard-to-attribute failures. That
is a reason to preserve the capability and design future agentic execution around it, not a reason to
market it before users demonstrate the need.

## Considered and rejected

- **Claim it now.** Rejected: technical validation is complete, but there is no customer demand evidence.
- **Lead with a single sharpest piece** (replay, or the judge alone, or attribution alone) instead of
  the combination. Rejected: each individual piece is independently matched by some competitor per the
  research above, and combining matched pieces does not itself prove a wedge.
- **Promote cost/reliability enforcement instead.** Rejected: no such capability exists. Claim-leasing
  and cost-sampling in the conversation analyzer are internal safeguards against Linea double-billing
  itself, not a customer-facing spend cap or kill-switch. Nothing here changed the actual gap.
- **Remove behavior analysis because it is not the wedge.** Rejected: it is a shipped part of the
  operations layer and becomes more useful as execution grows more agentic.
- **Bind the agentic-graph work to Phase 2.** Rejected: Phase 2 already means the Code escape hatch and
  OTel ingest in `docs/roadmap.md`. The agentic-graph workstream needs its own roadmap placement when it
  is scheduled.

## Consequences

- Product positioning continues to lead with the fix-loop mechanism, not behavior-analysis uniqueness.
- Future agentic nodes must preserve identity, step evidence, and execution provenance so the existing
  analyzer and Findings surface can explain their runtime decisions.
- No additional behavior-analysis scope is justified solely by competitive whitespace. Real client use
  should determine the next categories, controls, and agentic integrations.
