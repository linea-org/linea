# Validation

Runs in parallel with Phase 0. Its job is to test one specific claim before
Phase 1 spends four months building on it.

**The claim: technical builders will pick Linea because it can replay a single
step of a past run against the exact input it saw.**

`roadmap.md` makes this a gate. Phase 1 does not start until this doc's
"decision" section is filled in.

## What has to be true for the claim to hold

Three things, in order. Any one of them failing kills the wedge, and they get
cheaper to test in this order:

1. People operating agents today have a debugging problem they describe
   unprompted, without us naming it first.
2. That problem is specifically "I changed one step and had to re-run the
   whole expensive thing to find out if it helped", not something else.
3. Solving it is worth moving execution onto someone else's platform. This is
   the tallest hurdle: a tracing tool is a side-by-side install, Linea is a
   migration.

Hurdle 3 is where this pitch is most likely to fail, and it is worth asking
about directly rather than hoping. It also has a structural answer rather than
only a persuasive one: OTel ingest in Phase 2 makes the monitoring product
work before migration, so the ask drops from "move your execution" to "point
your traces at us". Track B should test whether that smaller ask lands, since
it is the one that will actually be made.

## Who we are actually competing with

Two different fields, and the answer differs for each.

**Execution platforms** (hosted agent-framework platforms, durable-execution
services like Temporal and Inngest, the workflow products the major hosting
platforms now ship, and open-source workflow tools like n8n and Windmill).
They run your code. Most treat observability as a status page rather than a
product. Our answer: they show you that step 4 failed, we let you fix step 4
without re-running steps 1 through 3.

**Observability vendors** (LangSmith, Langfuse, Braintrust, Weave, Phoenix,
Helicone, Latitude). They have better trace UIs than we will have for a while,
and several are open source. The real comparison, stated carefully because
the sloppy version of it is wrong:

- Several of them can already act on a failure, not just display it — some
  dispatch a coding agent with the failure context and open a pull request.
  "They can only show you traces" understates the category and isn't a claim
  worth making.
- What they cannot do is replay one step from the middle of a graph, because
  that needs the checkpoint, which needs having executed the run. Session-
  level replay against your own endpoint is available to them and is shipping.
- And their fix loop necessarily runs through the customer's codebase: PR,
  merge, deploy, regression test. Ours runs through the workflow: replay,
  change, publish a version. That difference is the pitch, and it only matters
  to someone for whom a deploy cycle is the bottleneck.

Flaggers, signals, monitors, and signal-generated evals (see `roadmap.md`) are
a common shape across this category. Linea's version leans on graph-level
facts — checkpoints, per-step inputs — that a trace-only tool never has access
to, which is where the differentiated half of that work lives.

This landscape moves quickly, and this section was written 2026-08-05.
Re-check specifics before repeating any of it as current fact.

## Track A: dogfood

The cheapest signal available, and the only user research that also produces
working software. Fill this table in before Phase 0 week 3.

| #   | Workflow | What it replaces today | Runs on Linea since |
| --- | -------- | ---------------------- | ------------------- |
| 1   |          |                        |                     |
| 2   |          |                        |                     |
| 3   |          |                        |                     |

Rules that keep this honest:

- It has to be something whose failure we would actually notice. A workflow
  built to fill a row here is not a signal.
- If we cannot name three, that is itself the finding, and it is worth more
  than three fabricated rows.
- These three are Phase 0's third exit criterion. They run unattended for a
  week before the phase closes.

One addition now that observability is the wedge: **log every time one of the
three breaks and what debugging it took.** We are the first user of the thing
we are selling, and our own frustration is the most detailed evidence
available about whether the trace records the right fields.

## Track B: ten conversations

Target: technical builders and technical founders who already run something
unattended. Not people who might want to. People who do.

Where to find them: existing network first, then the communities around the
tools listed above, then anyone who has publicly complained about operating an
agent in production.

### Interview script

Structured around what they run today, not around our demo. Do not show the
demo until question 11. The goal is to hear the problem in their words before
they have heard it in ours.

1. Walk me through something you have running unattended right now. What does
   it do, and what triggers it?
2. How is it built and where does it run?
3. When did it last break? What actually happened?
4. How did you find out it broke?
5. What did fixing it involve? Did it have to redo work it had already done?
6. Once you had a theory about the fix, how did you check whether it worked?
7. What did that cost you, in time or in API spend?
8. What do you use to see what a run did? What is missing from it?
9. What parts of what you built do you wish you had not had to build?
10. What would have to be true for you to move it off what it runs on now?
11. (Show the crash-and-resume and trace demo.) What is your reaction?
12. If it could take your traces without you moving anything, would you point
    them at it?
13. What is the first thing you would try to build with it, and what would
    stop you?

Questions 6 and 7 are the ones that matter most. They test hurdle 2 without
naming replay, so a yes is real rather than agreeable. Question 10 tests
hurdle 3, and its answer is the one most likely to be uncomfortable. Question
12 tests the smaller version of the same ask, the one OTel ingest makes
possible; a no there is much worse news than a no to 10, because it means even
the free option is not wanted.

Record answers verbatim where possible. The specific words people use for
their pain are the copy for the landing page.

### What counts as signal

- **Strong.** Their answer to question 6 describes re-running the whole thing
  to test a one-step change, before we have mentioned replay. And question 10
  names a condition we could actually meet.
- **Weak.** They like the demo but their answer to 6 was "I just read the
  logs" and to 10 was vague. Politeness reads as enthusiasm and is the most
  common false positive here.
- **Negative.** Question 10 gets "nothing, it works fine", or their answer
  names a feature we will not build.

Log every conversation. Five strong signals is a confirmed wedge. A majority
of weak ones means the framing changes rather than the code, and the likeliest
alternative framings are durability on its own, or a specific vertical
workflow shape that keeps coming up.

## Track C: the page

A single page, live by the end of Phase 0, with the demo at the centre of it.
It is a signal instrument, not a launch.

Draft copy, to be rewritten with the actual words from Track B:

> **Re-run step 4. Not steps 1 through 4.**
>
> Linea runs your agents and workflows, and records every step: what went in,
> what came out, what it cost, where it broke. Then it lets you change one
> step and replay it against the exact input it saw the first time.
>
> Tracing tools can show you the failure. They never ran the workflow, so
> that is all they can do.
>
> [30 second demo: a six step workflow, a worker killed mid-run, the run
>
> > finishing anyway, then one step replayed with a changed prompt.]
>
> Early access. We are looking for a small number of technical builders with
> something already running unattended.

Measure: signups, and what fraction leave a description of what they would
run. The descriptions matter more than the count. Ten signups with specific
workflows beat two hundred with none.

Two rules. Do not publish until the demo actually works, because a page that
overstates Phase 0 costs more credibility than it buys attention. And the
replay half of that demo is Phase 1, so either the page waits for it or the
copy is honest about what is live today.

## Decision

Filled in at the end of Phase 0. Phase 1 does not start until it is.

**Did the replay claim hold?**

**Evidence, by hurdle (1, 2, 3):**

**What Phase 1 builds first as a result:**

**What we are explicitly not building because of it:**

**If the evidence was weak, what changes instead of the code:**
