# Strategy

What Linea is, why anyone would use it, what to say about it, and what has
been tested and found false. Written 2026-09-06.

This is the document to read before pitching, planning a quarter, or
deciding whether a new capability is worth building. `product-vision.md`
covers scope and audience in more depth; `roadmap.md` covers sequencing;
`validation.md` covers how the central claim gets tested. The positioning in
this document is authoritative when another planning document has not yet
been reconciled with it.

Market claims below are sourced. They were gathered on 2026-09-06 and this
landscape moves quickly, so re-check before repeating any of them
externally.

## Philosophy

Linea executes the workflow. Not observes it, not orchestrates a call out
to something else that runs it: executes it. Everything else follows from
that.

Because Linea runs the graph, it holds the graph, the checkpoint after
every step, the exact input each step received, who triggered the run, and
which of a customer's own end users it ran for. These are not five
features. They are one data model looked at from different angles:

- The checkpoint that lets a run survive a worker crash is the same record
  that lets a single step be replayed later.
- The step that failed is the same record a Regression Case is built from.
- The flag raised on that failure is the same record a Signal groups into a
  tracked pattern.

In a stack assembled from separate vendors those are four different records
in four different products, correlated by glue the team writes and then
maintains. The bet is that being one thing is not a packaging convenience
but a capability difference, because operations become possible that
require holding all of it at once.

## What we are trying to do

Give a technical team everything an AI agent needs in order to run
unattended in production, on one substrate: durable execution,
observability, regression testing, memory, identity, and human-in-the-loop
approval.

The long-term shape of that is an operating layer for agents. That is not a
later pivot; it is a description of what the substrate already is. The fix
loop below is simply the first part of it that a customer can see and
value, because it addresses the problem teams have today.

## Who it is for

Technical builders first: developers and technical founders who would
otherwise write this as code, glue scripts, or an agent framework wired up
by hand. They expect an SDK and an API as much as a dashboard, and expect
to drop into real code when a visual builder runs out of room.

Their end users are served indirectly, through embedded agents the builder
deploys. Non-developer authoring is a later, deliberate widening.

## Why someone would use it, honestly

**The true version.** A small team shipping an AI agent that must run
unattended currently assembles five products: durable execution, an agent
framework, observability, evals, and a memory store. They wire them
together and then operate them. Linea is those five on one data model, and
the shared data model is what makes the fix loop below possible at all.

**What that is and is not.** It is a saves-you-assembly argument, not a
solves-an-unsolved-problem argument. That is a legitimate category, roughly
what a hosting platform is versus running the same stack yourself, but it
competes on developer experience and time to value rather than on unique
capability.

**What is not true yet.** Nobody uses it. There are no external users and
no external subjects in the system. Every claim in this document about what
teams will value is a hypothesis with a coherent mechanism behind it and no
usage evidence behind it.

## The mechanism: the fix loop

This is the concrete, demonstrable thing. Every step exists and is wired
today.

### 1. Diagnose

A Flag fires on an execution: tool error, empty response, refusal,
repeated replay, or one of the behaviour categories the conversation
analyzer raises. Related flags group into a Signal, a named and tracked
pattern with a lifecycle, so a recurring failure reads as one thing rather
than forty red rows. From there the execution's step timeline shows what
each step received, returned, cost, and where it broke.

### 2. Test a fix against real production input

Any step can be replayed with a configuration override. For an AI node that
means a changed prompt, system prompt, or model; for HTTP a changed URL,
headers, or body; for Branch a changed condition.

Two properties make this different from re-running the workflow. The replay
runs against the exact input the original step received, so production
state does not have to be reproduced in a development environment. And only
that step runs, so nothing upstream is paid for twice.

A replay writes a new step record linked back to the one it replayed. It
does not modify the workflow. The next production run still uses the old
configuration.

### 3. Freeze the failure as a Regression Case

Save the failing step as a Regression Case: a snapshot of the input plus
the assertions describing correct behaviour, with provenance back to the
step.

This is the step teams skip and the one that makes the loop trustworthy. A
single replay producing a better answer proves very little, because the
improvement may be sampling variance rather than the change. Research on
agent debugging tools found this to be the dominant unsolved problem for
their users: after editing and re-running, people could not tell whether
their edit had done anything
([AGDebugger](https://arxiv.org/html/2503.02068v1)). Saving the case is
what turns a promising sample into something checkable.

### 4. Patch, publish, get checked

Edit the workflow and publish. Publishing creates an immutable version and
fires a Regression Run against the active cases, answering two questions at
once: did the fix work, and did it break anything that used to pass.

### Limits worth stating before someone discovers them

- **Single step.** If step two produced bad input and step four merely
  surfaced it, replaying step four against that same input tells you
  nothing. There is no downstream cascade replay.
- **Configuration only.** Replay changes what a node does, never which
  nodes exist or how they are wired.
- **Wait and Approval nodes are refused.** Correctly so: a Wait node's
  result is a timer that already fired and an Approval node's is a human
  decision already recorded, so a replay would return the old outcome while
  appearing to honour the override. The refusal is currently blanket;
  per-effect classification would safely allow more cases through, and is a
  known improvement rather than a shipped one.
- **Regression failures do not yet link back to a step.** A regression
  result records status, score, output, and cost, but nothing pointing at
  the execution or step it produced, so a failed case cannot be opened in a
  trace. Recording the execution id, and the step id for node cases, would
  let test failures enter this same loop at the same place production
  failures do. Small change, closes the loop from both directions.

## The pitch

### The wedge, stated as a mechanism claim

> Because we execute the workflow, we hold the checkpoint. When an agent
> fails in production, you replay the failing step against the exact input
> it saw. No deploy, no reproducing state, no re-running the steps before
> it. Freeze it as a regression case, publish, and the suite verifies the
> fix and checks you did not break anything else. An observability vendor
> can show you that failure, but it never ran the workflow, so it has no
> checkpoint to replay from.

Every clause is checkable and the whole thing demos in about three minutes.
None of it claims anyone wants it, which is what keeps it honest when
someone asks who asked for this. The answer is nobody yet, and that is what
the next phase is for.

### The vision, stated as an explanation rather than a promise

> Every agent in production needs the same substrate: durable execution,
> memory, identity, human-in-the-loop, and sandboxed code. We are building
> that layer. The fix loop is the first part of it a customer can see and
> value.

This makes the operating-layer ambition the reason the wedge exists rather
than a separate someday claim.

### Competitive framing, named specifically

Vague comparative claims invite skepticism; specific ones close it.

- Langfuse and Braintrust can see the failure but never executed the run,
  so they have no checkpoint to replay from.
- n8n executes but has no signal or regression layer.
- LangGraph executes but the team operates the result themselves.

### What not to claim

- That anyone is asking for this. They are not, yet.
- Turn-level correction of a customer's conversation as a market need. The
  evidence contradicts it (see below).
- That the loop is fast for all failures. It is fast for failures fixable
  inside the workflow, and that fraction is unmeasured.
- That the product is early. It is not; the core is built, and underselling
  the artifact throws away the strongest available credibility.

### The open risk to state unprompted

Whether teams will move execution onto a platform to get this.
`validation.md` already names it as the tallest hurdle. Saying it before an
investor finds it reads as judgment rather than a blind spot.

## What has been tested and found false

Five candidate wedges have been researched. All five survived architectural
reasoning and then failed on demand evidence. The pattern is the finding: a
wedge is not derivable from what the architecture makes possible.

### 1. Step-level replay and the closed fix loop as unique

Replay is shipped by Laminar, Lucidic, and LangGraph Time Travel. Braintrust
converts production traces into CI-enforced eval cases; Maxim, FutureAGI,
and Galileo ship failure clustering. Standalone observability is also
consolidating fast: five acquisitions in roughly six months.

_Real feature, not a moat. The mechanism claim above survives; the
uniqueness claim does not._

### 2. Multi-tenant infrastructure and end-customer attribution

Attributing a trace to an external user id is commodity.

_A qualifier, not a wedge._

### 3. Embeddable agent plus a UI the customer's users see

Not obviously different from existing embeddable widget products.

_Set aside._

### 4. Cost and reliability enforcement

Market signal is real (agentic AI spend projected to grow roughly 139%,
from about $86B to $206B; enterprises with a formal AI-agent-owner role up
from about 11% to 56% in a year). But no such capability exists in Linea;
claim-leasing and cost-sampling are internal safeguards, not
customer-facing spend caps.

_Deferred, not disproven._

### 5. Turn-level correction into a live end-user conversation

Researched most thoroughly and got furthest.

**Competitively undefended.** Checked against Sierra, Decagon, Intercom
Fin, Zendesk, Ada, Agentforce, Crescendo, and Forethought. None correct an
already-delivered turn in place. Sierra's replay is an offline QA
simulator; Intercom edits drafts before send; the rest offer escalation,
handoff, or post-hoc coaching.

**But not wanted.** No AI-specific regulation requires correcting an answer
already given. EU AI Act Article 50 is prospective transparency only; the
AI Liability Directive was withdrawn in 2025; GDPR Article 16 is
per-subject and on request; Moffatt v Air Canada established liability,
with damages of $812.02, not a duty to remediate others. FINRA 24-09
explicitly creates no new requirements, and the FTC targets claims about
AI rather than wrong answers from it.

**Revealed preference is worse than the regulatory gap.** No documented
case exists of a company bulk-correcting and re-notifying customers after
an AI regression. Cursor apologised and refunded complainers. Klarna
rehired humans. New York City's MyCity bot told businesses they could
steal tips and reject Section 8 tenants; the city added a disclaimer and
left it online. Feature-flag platforms sell detect-and-kill and have never
shipped "apologise to users who saw the bad variant."

**The one forced buyer is not an AI buyer.** UK FCA DISP 1.3.3R and
Australia's ASIC RG 277 already require proactively redressing customers
who never complained, technology-agnostic and expensively manual today.
Real budget, real incumbents (Genpact, the Big Four). Also a different
company: enterprise sales into conduct-risk functions. Worth knowing, not
worth claiming.

### Where the money is actually going

Upstream, into prevention: evals, shadow testing, CI gating. Which is
where Linea already built.

### The lesson

Every expansion justified by what the architecture makes possible has
failed on contact with evidence. The one that suddenly looks well-founded,
per-user Gmail connections, got there because a prospective client said
they wanted it. Let clients pull capability out of the roadmap rather than
pushing capability at a market.

## Where we are

Not product-market fit, and not close. That is a statement of position, not
a criticism.

0. A coherent mechanism that works. **← here**
1. Someone other than us runs it in production.
2. They come back to it unprompted.
3. They would be genuinely disappointed to lose it.
4. Demand outruns the ability to serve it. That is fit.

What is unusual about this position is that the mechanism is complete.
Most teams at step zero have half a product and a story. The missing
ingredient here is users, which takes weeks to obtain, rather than
product, which takes quarters.

The corresponding risk: a finished product with no users means a long run
of unchecked hypotheses, which is exactly what the five failures above
document.

## What to measure next

From the first real client, in priority order:

1. **What fraction of production failures are fixed inside the workflow
   rather than in the team's own codebase.** This is the single number that
   determines whether the loop's speed is a selling point. A prompt, branch
   condition, or model choice is fixed here in minutes. A wrong database
   query in the client's application is not.
2. **How often an incident is diagnosed from Linea alone**, versus needing
   the team's own application logs. This tests whether the trace records
   the right fields.
3. **Time from failure to published fix**, against whatever the team did
   before.
4. **Whether replay is actually reached for**, or whether people re-run the
   whole workflow out of habit. Available and used are different facts.
5. **Whether anyone opens the observability at all.** The standard failure
   mode for this category is the dashboard nobody checks. If a team learns
   their agent is broken from a colleague rather than from Linea, that is a
   more important finding than any feature gap.

## Open decisions

### End-user protocol scope

The protocol design and its security critique are correct: the earlier
conversation-token design let the token pass through the operator backend
where it could be copied, and OIDC with PKCE plus DPoP closes that.
Adopting the security correction is settled. Sequencing the full buildout
is not: Applications, Workflow Contracts, first-class Conversations, an
identity subsystem, Connections, and Action Consent is a large amount of
work for end users who do not exist yet. Let the first client define which
slice is needed rather than building it speculatively.

### ADR numbering

ADR 0001 records why agentic-graph behavior analysis is a supporting capability rather than the wedge. ADRs 0002 through 0017 record the accepted end-user protocol decisions. The next ADR is 0018.

## Sources

Competitive, prior-art, and demand research conducted 2026-09-06.

- [AGDebugger](https://arxiv.org/html/2503.02068v1)
- [LLMs Get Lost in Multi-Turn Conversation](https://arxiv.org/abs/2505.06120)
- [EC Article 50 FAQ](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act)
- [Moffatt v Air Canada](https://www.mccarthy.ca/en/insights/blogs/techlex/moffatt-v-air-canada-misrepresentation-ai-chatbot)
- [FCA Handbook DISP 1.3](https://handbook.fca.org.uk/handbook/disp1/disp1s3)
- [ASIC RG 277](https://www.asic.gov.au/regulatory-resources/find-a-document/regulatory-guides/rg-277-consumer-remediation/)
- [AI Incident Database #1039](https://incidentdatabase.ai/cite/1039/)
- [The Markup on NYC MyCity](https://themarkup.org/artificial-intelligence/2024/03/29/nycs-ai-chatbot-tells-businesses-to-break-the-law)
