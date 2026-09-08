# Scope the next wedge candidate to agentic-graph behavior analysis, and don't claim it yet

Identity attribution (`triggeredByUserId`/`externalSubjectId` on executions and schedules), a dual-axis
conversation judge (`user_experience` and `agent_behaviour`, independently scored with confidence and
evidence), and an eval suite that reruns automatically on every workflow publish are all shipped
(PRs #67–#74). Competitive research checked this specific three-part combination against Langfuse,
LangSmith, Braintrust, Maxim, Galileo, Latitude, HoneyHive, Arize, Helicone, Traceloop, W&B Weave, and
PromptLayer: identity attribution alone is commodity, multi-axis conversation judging is common as a
configurable single-purpose evaluator but not as a fixed two-axis taxonomy, and publish-triggered
automatic regression (versus CI-wired or continuous-monitoring approximations) is the least-matched
piece. No competitor offers the combination.

**Decision:** treat this combination as the sharpest current wedge candidate, but do not claim it yet,
and scope it specifically to Phase 2's agentic-graph work (the Agent tool-calling loop, Loop/Parallel/
Subworkflow, MCP tool node) rather than to static workflows in general.

**Why:** none of the judge's output reaches the product today — only four curated categories
(`user_frustration`, `hallucination_suspected`, `repetition_loop`, `inappropriate_refusal`) leak into a
generic flag label indistinguishable from any other flag type; the rest of the finding (axis, category,
confidence, rationale, evidence) is invisible outside Postgres. The judge has also never been run
against a real conversation with a real model call and checked by a human — it's covered by unit tests
against mocked responses, which prove the concurrency/claim-leasing/sampling logic doesn't race or
double-bill, and prove nothing about whether its judgments are actually good. A capability that exists
but isn't visible and isn't validated is infrastructure, not a pitch.

The Phase 2 scoping is deliberate, not a hedge. A human-authored, static DAG is predictable enough that
attribution and behavior-judging add comparatively little. A graph that's making its own runtime
decisions (which tool to call, whether to loop, when to hand off to a subworkflow) is exactly where
hallucination, repetition, and instruction-drift findings matter, and exactly where knowing who ran it
matters for making sense of a pattern. The wedge claim rides on Phase 2 existing, not on the ops-loop
existing in the abstract.

## Considered and rejected

- **Claim it now.** Rejected: no product surface exists for any of it beyond a generic flag label, and
  it's unvalidated against a real model call.
- **Lead with a single sharpest piece** (replay, or the judge alone, or attribution alone) instead of
  the combination. Rejected: each individual piece is independently matched by some competitor per the
  research above; only the specific three-part combination, attributed to a real identity, is
  undefended.
- **Promote cost/reliability enforcement instead.** Rejected: no such capability exists. Claim-leasing
  and cost-sampling in the conversation analyzer are internal safeguards against Linea double-billing
  itself, not a customer-facing spend cap or kill-switch. Nothing here changed the actual gap.
- **Claim the ops-loop generically, independent of graph shape.** Rejected: the value concentrates
  specifically where the graph is agentic and dynamic (Phase 2), not on a static DAG a human already
  fully specified.

## Consequences

- Phase 2 now carries strategic weight beyond its engineering scope: it's the substrate the wedge claim
  depends on, not just "the escape hatch and OTel ingest phase."
- Before any external or customer-facing claim: (1) one real validation run of the conversation analyzer
  against an actual model call on a realistic conversation, checked by a human, and (2) only after that
  passes, a UI surface for findings. The validation run is cheap and comes first; building a screen for
  an unproven judge is the expensive way to find out it isn't good.
- Validation is dev-first: Linea's own technical-builder users are the ones who exercise this in real
  workflows before it's ever pitched to their own end-customers, matching the existing "technical
  builders first" sequencing in `product-vision.md`.
