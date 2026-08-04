# Product vision & scope

Companion to `repo-structure.md` and the architecture pages in Notion. Answers a different question: not how a run executes, but what Linea is, who it's for, and why someone picks it over the alternative.

## What Linea is

A platform for technical builders to design an agent or workflow once — a graph of steps — connect it to the tools and knowledge it needs, and have it run on its own from then on: triggered by a schedule, a webhook, or their own code. The graph can call integrations, call AI models, search a knowledge base, remember facts across runs, and drop into sandboxed code for the last-mile logic that doesn't fit a node.

## Who it's for

Technical builders, first. Developers and technical founders who'd otherwise write this as code, glue scripts, or an agent framework wired up by hand. They expect an SDK and public API as much as a dashboard, and expect to drop into real code when the visual builder runs out of room.

Ops-minded non-developers become a real audience eventually, once mobile and guided authoring ship — a deliberate widening rather than a repositioning, with technical builders staying primary and the SDK staying first-class. Mobile is a later, secondary surface: monitoring and approving runs on the go first, full authoring afterwards alongside that second audience.

## The wedge

**Linea is the hosted ops layer for agents: memory, knowledge, sandboxing, retries, and checkpointing, all pre-built, so a developer writes only the logic unique to their problem.**

The alternative a technical builder reaches for today is one of two things:

- **Writing it themselves** — raw API calls, cron jobs, hand-rolled retries, a vector DB wired up for memory. Linea's answer: that infra already exists and is free to use.
- **An agent framework** (LangGraph, CrewAI) — solves the agent-logic problem, not the ops problem. You still build or rent your own hosting, retry/checkpoint story, memory store, and sandbox. Linea's answer: same power, none of the infra to run yourself.

Different wedge from both neighbors: workflow tools (n8n, Zapier) compete on visual simplicity and fall over once a step needs real code or real agent reasoning. Agent frameworks compete on developer power and assume you'll operate the result yourself. Linea's bet: full developer power, but the operational half is Linea's job.

**Builder and SDK are equal entry points, not primary-plus-fallback.** Author visually or in code, same result — a real commitment, not a hedge. The workflow JSON format, node registry, and SDK all stay first-class together.

**The sharp edge of that wedge is observability, and specifically the length of the fix loop.** "Hosted ops layer" describes the category; it isn't yet a reason to switch, because several products describe themselves the same way. The concrete reason is that Linea executes the workflow and therefore holds the graph, the checkpoint after every step, and the exact input each step saw. Two things follow that a bolt-on tool can't match:

- **Step-level replay.** Re-run step 4 against the exact input it saw, without re-running steps 1 through 3. Session-level replay (re-run the whole thing against your endpoint) is available to anyone holding recorded inputs — Latitude has it. Replaying one step mid-graph needs the checkpoint, which needs having executed it.
- **A fix loop that doesn't leave the platform.** The observability tools' loop runs through your codebase: detect, dispatch a coding agent, open a PR, merge, deploy, regression-test. Linea's runs through the workflow: replay, change, publish a version. Seconds instead of a deploy cycle, and no repo required.

The honest limit on both: they only apply to workflows already running on Linea, which is a migration rather than a side-by-side install. `validation.md` treats that as the tallest hurdle, and OTel ingest (see `roadmap.md`) is the plan for attacking it.

**The code node is an escape hatch, not the default.** Integrations, transforms, AI calls, KB/memory nodes cover the common cases. This is also why sandboxing only needs to exist for that one node type — the product decision and the infra decision reinforce each other.

## The moat

Nothing stops a determined team from building this themselves. The actual moat is two things, not secrecy:

1. **Hosted convenience.** Self-hosting the ops layer is exactly the toil the product removes. Most teams capable of DIY-ing it still won't bother.
2. **Compounding data, per workspace.** Memory accumulates, KB gets richer, and once evals/observability exist, usage history becomes something Linea can act on — a fresh self-hosted setup starts without any of that.

**Open, not decided:** whether any part of the core runtime or SDK should be open source.

## Product pillars

In the order they matter to a builder deciding whether to trust Linea with something unattended:

1. **Workflow builder + runtime.** Design the graph, trigger it, get checkpoint/resume and crash safety for free. Everything else sits on top of this working — including pillar 2, since the checkpoint is also what replay reads from.
2. **Observability, evals, tuning.** The selling point, not the third thing we get to. Observability first (what a run actually did — trace, logs, cost, failures — plus step-level replay, the part a bolt-on tracer can't do). Evals next (define correct output, build datasets from real runs, catch regressions). Tuning after that, and it means something specific: surfaced failure patterns and few-shot selection from a workspace's own run history first, automated prompt optimization only once evals produce a metric worth optimizing against. The full ladder is in `roadmap.md`. This is also where the moat's "compounding data" claim becomes real.
3. **Memory and knowledge.** Agents remember facts across runs without a hand-built fact store; search a workspace's own docs or existing tools without a hand-built RAG pipeline. Owned KB is the default, connectors are additive.
4. **Distribution.** SDK, public API, embeddable chat/runner components, and mobile as an addition to this pillar rather than a separate one. Mobile ships as monitoring and approval first — watching runs and approving a paused step, which is the same checkpoint-and-resume machinery pointed at a person instead of a crash. Full mobile authoring comes later, with the non-developer audience it serves.

## Deliberately out of scope here

No dates — sequencing belongs to the roadmap doc, not here. This page is scope and positioning, meant to stay stable while dates move.

## Open questions

| Question                                                                               | Status                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open source any part of the runtime/SDK?                                               | Undecided, flagged not answered                                                                                                                                                                                            |
| Mobile: monitoring/approval, full authoring, or both?                                  | Both, in that order. Monitoring and approval first, alongside the SDK and public API. Full authoring waits for the non-developer audience it actually serves.                                                              |
| How does tuning actually work — human-surfaced patterns, automated optimization, both? | Both, sequenced. Human-surfaced patterns first (eval-driven iteration, then failure clustering), automated optimization only after those produce a metric worth optimizing against. See the tuning ladder in `roadmap.md`. |
| Does the non-developer audience become first-class eventually?                         | Yes, once mobile and guided authoring ship. A deliberate widening, not a repositioning: technical builders stay primary and the SDK stays first-class.                                                                     |
