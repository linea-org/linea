# Agent-first integration and a shared operating experience

Date: 2026-10-31
Branch: rohittcodes/issue-193-web-ui-build
Related milestone: https://github.com/linea-org/linea/issues/193
Status: Agent entry flow and wireframe approved; broader operating experience proposed for review.

## Problem and audience

The primary user adds an Agent to an existing product. The secondary user builds a visual automation in Linea. The recent UI exposed Applications, Agents, Workflows, Contracts, versions, and deployment settings before providing a complete useful run. Visual consistency alone cannot resolve disconnected authoring and operating journeys.

The first successful outcome is a developer starting an Agent from their product backend, receiving an Execution identifier, and finding that same run and its trace in Linea.

## Agreed direction

- Lead with Add Agent. Choose an existing Application or create one inline, then configure and try the Agent.
- Keep Application ownership explicit. It groups the Agents, Workflows, and Environments for one product; it is not a deployment or a generated frontend.
- Preserve distinct Agent and Workflow definitions. An Agent chooses steps to complete a task; a Workflow prescribes steps and can invoke an Agent. A Workflow may also contain no Agents.
- Reuse one execution and recovery foundation for standalone Agents and Workflows, as required by ADR 0023.
- Preserve independent Contract revisions, published definition versions, and Environment deployments, as required by ADR 0025.
- Keep workspace typography, tokens, full-width layouts, explicit back navigation, and shared UI primitives consistent. Avoid new visual branding and nested inventory cards.

## Alternatives considered

- Application-first: smallest navigation change, but requires learning the ownership container before adding useful behavior.
- Agent-first: chosen because it leads with adding an Agent to an existing product while retaining Application ownership.
- Example-first: useful as an optional GitHub example, but not the required entry point for every product.

## Navigation and responsibilities

| Surface      | Responsibility                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Applications | Select a product or start Add Agent, choosing or creating its Application inline.                                                             |
| Application  | Agents first, Workflows second, Environments for deployment and configuration.                                                                |
| Agent        | Configure, Playground, Runs, Integrate. Contracts and advanced configuration remain accessible without becoming mandatory navigation choices. |
| Workflow     | Existing builder and versioning, including an explicit Run Agent step selecting an Application-owned Agent and Contract.                      |
| Runs         | One history for standalone Agent and Workflow Executions, filtered by Application, Environment, definition, and status.                       |
| Approvals    | Pending work with clear approval type, run context, and authority-aware actions.                                                              |
| Environments | Published deployments, Connections, Secrets, Backend keys, User identity, and retention/status settings.                                      |

Runs is the proposed friendly UI label for the existing Execution resource. If adopted, update navigation, headings, links, and copy together; retain existing execution URLs and API terminology. Do not create a second history resource. Agent and Workflow Runs views are filters or contextual projections of the same history.

Keep workspace-wide Runs and Approvals for monitoring across Applications. Both show Application and Environment explicitly and retain those filters when opening detail and returning. Keep cross-Application Workflow browsing available as an All Workflows view; position it as browsing rather than suggesting that Workflows are siblings of Applications in the ownership model.

## First Agent journey

1. Add Agent: enter its name and select the product Application, with inline Application creation and generated editable identifiers in advanced settings.
2. Configure: instructions and model first; tools, limits, and Contract editing use shared Accordions. Offer an explicit task-text to summary-text Contract starting point. Validate and persist a real Contract revision before publishing a version.
3. Prepare Development: review the exact definition version, Contract revision, and Environment. Explicitly publish and deploy to Development; leave Production unchanged. If preparation spans several successful writes followed by a failure, retain the completed resources, expose the unfinished step, and resume from it instead of creating duplicates.
4. Playground: start the deployed version through the real Environment execution path. Resolve missing provider configuration, Connections, requester access, or reviewer assignments through contextual setup links. A workspace session does not substitute for the required End-User identity and authority. Use a supported authenticated test subject with explicit permissions; never bypass authorization for Playground.
5. Integrate: show a runnable external API example using existing Environment credentials and End-User/session requirements. Start asynchronously, return the Execution identifier, and link to that same run. SDK package publication remains outside #193.
6. Production release: select and review published version and Contract, then explicitly deploy. Show independent Development and Production state and the impact of the release.

Agent creation failure after inline Application creation must preserve the chosen Application and Agent form values. The UI must not silently create another Application on retry or imply that a failed Agent was created. Mutation-level retry identity and reconciliation for interrupted preparation must be specified in the implementation tickets before enabling retries.

## Workflows reuse the same Agents

Keep the visual builder for people who need prescribed steps, triggers, branching, and approvals. Add an explicit Run Agent node that selects an Agent in the same Application and declares the Contract revision used for its input/output mapping.

Resolve the Agent deployment in the parent Workflow Execution's Environment. Persist the selected Agent version and Contract before invocation and reuse that selection across pauses, retries, and recovery. Fail before Agent work if a compatible deployment is unavailable.

The existing ai node is labeled Agent but configures an inline model/prompt/HTTP tools rather than referencing a reusable Agent. Avoid keeping that ambiguous presentation. If the inline capability remains, label it Generate text; use Run Agent for the reusable, registered-operation invocation. Do not reimplement the new Agent path through the legacy raw-HTTP tool dispatch.

## One run detail and trace

Every root Execution shows its Application, Environment, initiating identity, definition type, pinned definition version and Contract, timestamps, status, outcome, and available usage information. The UI must distinguish unavailable information from zero usage or a successful empty result.

The shared timeline presents model turns, registered tool calls, approval waits, decisions, failures, and safe result previews in order. Starting from an API example, Playground, Workflow, or approval link must resolve to the same Execution context.

In a Workflow run, an Agent invocation expands within its parent trajectory and links to its Agent definition and pinned version. Preserve invocation identity and parent linkage. An Agent's contextual Runs view may show standalone roots and linked Workflow invocations, but must label nested invocations and avoid counting each as another root Execution. A standalone Agent Execution must not fabricate a Workflow.

Show waiting-for-review, rejected, partial outcome, failed, cancelled, and unknown action outcomes honestly. A later rejection must preserve and report earlier completed writes. An unknown external outcome is terminal and must not offer an automatic fresh-write retry.

## Approvals: shared context, distinct authority

The current workspace Approvals page handles Workflow approval-node pauses through /approvals and workspace membership/assignment rules. Exact external-action consent uses separate Approval Requests, Action Intents, End-User identity, and reviewer assignments. These are different authorization contracts.

Present clear kinds such as Workflow checkpoint and External action. Include Application, Environment, Agent or Workflow, requester, proposed action, requested time, current status, and a link to the relevant run step. Display safe, authorized fields rather than raw provider payloads or credentials.

Workflow checkpoint actions continue through their existing authorization rules. External-action approval is available only in the verified reviewer's authorized End-User context. A workspace Operator or admin may see an authorized waiting-state projection without receiving an Approve button or reviewer authority. The review UI can be hosted by the product or a Linea review surface, but must establish the same authorized identity; sharing visual presentation does not merge the decision endpoints.

Each external Decision binds one exact Action Intent. Present one pending action at a time. Approving the first proposed GitHub issue must not approve the second. Rejection stops further Agent work. Stale, expired, cancelled, or already-decided requests refresh their state and cannot submit another effective decision. Do not inherit legacy workflow auto-approve behavior for governed external actions.

## Other operating features

- Connections, Secrets, keys, identity trust, requester grants, reviewer assignments, and retention remain Environment-scoped and are opened from compact management surfaces.
- Replay and Regression are advanced actions from eligible run details, governed by ADRs 0024 and 0026. Diagnostics reuse recorded external reads/effects, do not gain live-write authority, and report unavailable recordings honestly.
- Agent diagnostics initially require a signed-in workspace admin or owner plus source-Environment authorization. End Users retain their own run and approval views. Fixture expiry, copying, and erasure preserve source retention and attribution.
- Existing workflow analytics and quality features remain reachable. Do not add them as required steps in the first Agent setup journey.

## Implementation sequence and boundaries

1. Agent-first onboarding UI: workspace entry point, inline Application selection/creation, failure recovery, default Agent-focused Application view, consistent back navigation and primitives. Continue using the existing management APIs.
2. Real standalone Agent execution and shared run projection: published Environment bindings, stable invocation/version selection, ordered trace persistence, registered read operations, recovery, and authorized End-User invocation. Connect Playground only when it can create a real Execution.
3. Governed actions and review UX: registered Connector Gateway dispatch, sequential exact-action approvals, identity-aware views, restart/redelivery safety, honest partial outcomes, and terminal unknown outcomes. Prove the two-GitHub-issue acceptance scenario.
4. External integration example and linked run inspection: call the same Environment execution path from a product backend and resolve the returned Execution identifier in Linea. This can be developed alongside the runtime once its launch contract is stable.
5. Workflow reuse: Run Agent picker, declared Contract mapping, Environment resolution, pinned invocations, parent/child trace navigation, and preservation of existing Workflow behavior. The builder UI can be designed alongside runtime work, but execution must wait for the shared Agent runtime.
6. Replay and Regression: recorded-effect matching, admin/source access, retention/erasure, unavailable states, and web flows. Keep this independent of the primary creation path.

Deliver #193 through independent tickets and PRs with native blocking relationships. The sequence is a design breakdown, not a claim that these tickets already exist. Define and validate the shared execution projection and authorization contracts before building supposedly unified operating pages on incompatible responses.

Current shipped/branch capability: Agent management APIs, Agent authoring/publishing/deployment UI, scoped Workflow creation, existing Workflow execution and checkpoint approvals. Missing milestone work includes reusable standalone Agent execution, Workflow Agent references, and safe Agent diagnostics. The approved sketch's Playground is explicitly fixed example content. Never ship it as a functioning production run path.

## Acceptance checks

- First-time developer can add an Agent without visiting the Workflow builder or manually creating an Application in another page.
- Existing and inline-created Applications preserve ownership and form state across creation failures and retries.
- Development preparation exposes the exact version and Contract and leaves Production unchanged; partially completed preparation resumes without duplication.
- A real Playground invocation and backend API invocation each return an Execution that can be inspected in the same run detail.
- An authorized Workflow invokes the same Agent through its declared Contract and Environment without changing existing Workflow executions.
- Version selection remains pinned after deployment changes and worker restart.
- Two independently approved GitHub actions create exactly two distinct issues without duplicate effects after redelivery. Requester access and workspace administration alone cannot approve.
- Rejection, partial success, unknown outcome, stale approval, and missing deployment produce truthful UI states and no unsafe automatic dispatch.
- Context filters, back navigation, keyboard Accordions, preserved edits, light/dark tokens, and mobile width work across authoring and operating surfaces.
- Diagnostics enforce admin/source access, recorded-only effects, unavailable recordings, expiry, and erasure.

## Visual evidence and approval scope

The user approved the entry/configuration/Playground wireframe. Artifact: .context/agent-first-wireframe.html. Captures: .context/agent-first-entry.png, .context/agent-first-configure.png, .context/agent-first-development-review.png, and .context/agent-first-playground.png. The sketch was rendered in Chromium, both Application selection modes were exercised, and desktop/mobile checks found no horizontal overflow. Its controls and outcomes are illustrative rather than live backend behavior.

The broader Runs, Workflow reuse, and Approvals design above follows existing ADRs and addresses the user's follow-up. Their detailed visual layouts and the final Runs/Executions label remain to be reviewed before implementation of those surfaces. No independent cross-model opinion was requested or run.

## Assignment and product check

Show the approved sketch to one developer integrating an Agent into an existing product. Ask them to identify where to add the Agent, how their product invokes it, where the resulting Execution appears, and who can approve an external action. Record their first point of hesitation without explaining the glossary first. Use that observation to choose the first UI refinement.

## User feedback informing the design

- "as a simple user i can't understand what i need to do in this app" makes a completed first run the organizing goal, rather than additional resource editors.
- The user prioritized "people adding an agent to an existing product" before visual automation, then asked specifically how workflows, executions, and approvals fit together. Agent-first entry must therefore connect to the shared operating model instead of becoming a separate product.

## Sources

- GLOSSARY.md and ADRs 0022, 0023, 0024, 0025, and 0026.
- Issue #193 acceptance scenario and independent-slice delivery requirements.
- packages/runtime/src/nodes/definitions/ai.node.ts: existing inline Agent label and raw HTTP tool schema.
- apps/web/src/routes/w/$slug/approvals.tsx and apps/platform-api/src/approvals/approvals.controller.ts: existing Workflow checkpoint inbox and membership checks.
- apps/platform-api/src/public-runtime/approval-request.projections.ts: separate public Approval Request and Decision projection.

<!-- gstack:office-hours:concerns:start -->

## Reviewer Concerns

Disposition: COMPLETED

Stop: PASS

No unresolved findings.

<!-- gstack:office-hours:concerns:end -->
