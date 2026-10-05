# Domain Context

## Agent

An Application-owned, task-directed actor that chooses its next steps within Operator-defined tool permissions, approval requirements, and execution limits.

## Agent Definition

An Application-owned, versioned description of an Agent's instructions, model, tools, and execution limits, reusable in standalone runs and Workflows.

## Workflow

An Application-owned definition of a prescribed process with explicit steps and control flow.

## Evals

The umbrella for measuring workflow quality, regardless of where the measurement originates.

## Evaluator

A workflow node that measures an input while the workflow is running.

## Evaluator Result

A measurement emitted by an Evaluator node during a workflow execution.

## Finding

A conversation-analysis judgment about user experience or agent behavior, with confidence and optional evidence.
_Avoid_: Flag, Signal

## Flag

An alertable issue, raised by a curated Finding category or a rule-based detector, that may apply to one Execution or a Conversation.
_Avoid_: Finding, Signal

## Signal

A recurring pattern that groups related Flags over time and tracks whether the problem is active, resolved, or regressed.
_Avoid_: Finding, Flag

## Regression

The saved-case system that replays known inputs against a workflow version to detect behavior changes.

## Regression Case

A saved input and its assertions.

## Replay

An isolated diagnostic run of a recorded step using its original input and optional configuration changes, preserving the original Execution.

## Recorded Effect

A retained description and observed outcome of a mutating operation, reused as evidence for a matching diagnostic request rather than authorization to perform another write.

## Regression Run

One execution of active Regression Cases against a specific workflow version.

## Regression Result

The outcome of one Regression Case within a Regression Run.

## End-User Access

**Operator**:
A Linea workspace customer that authors and operates Applications, Agents, and Workflows.
_Avoid_: Customer, consumer

**Application**:
One Operator product within a workspace that owns Agent and Workflow definitions and exposes Linea-backed behavior through its Environments.
_Avoid_: Client, frontend

**Environment**:
One Development or Production boundary within an Application, with its own deployed definition versions, identity trust, credentials, access grants, reviewer assignments, and runtime configuration.
_Avoid_: Application, Project

**Deployment**:
The published Agent and Workflow versions and configuration selected to serve one Environment.

**Environment Key**:
A server credential bound to one Environment and explicitly scoped to its runtime resources. It cannot access another Environment or change identity trust configuration.
_Avoid_: Application Key, App token, workspace API key

**Workspace Key**:
A server credential scoped to explicitly granted workspace operations such as Workflow, Signal, and cross-Application monitoring. It cannot act as an End User or substitute for an Environment Key.
_Avoid_: Admin key, master key

**Workflow Contract**:
An immutable revision of the public input and output promised by a Workflow to an Application, independent of the Workflow implementation version serving an Execution.
_Avoid_: Workflow version, node schema

**End User**:
A person using an Operator's Application.
_Avoid_: Customer, consumer user

**External Subject**:
Linea's representation of one End User, canonical within a workspace and identity issuer; it may be provisioned before identity verification but is never a Linea account or workspace member.
_Avoid_: External user, customer user

**End-User Session**:
A short-lived, narrowly scoped capability through which an End User interacts with Linea within an Environment.
_Avoid_: Conversation token

**Conversation**:
One independent thread or context owned by an External Subject within an Environment and handled by one Agent or Workflow. Each Execution records the definition version it starts with.
_Avoid_: Session

**Approval Request**:
A durable request owned by an approver identity that pauses an Execution until it receives a human or timeout Decision or is cancelled.
_Avoid_: Confirmation

**Decision**:
An immutable approve or reject response to an Approval Request.
_Avoid_: Resolution

**Connection**:
An Environment-scoped credential relationship with one stable provider account, owned either by an External Subject or shared within the Environment. A revoked Connection cannot be reactivated.
_Avoid_: Integration

**Connection Access Grant**:
An explicit permission for one External Subject to use a shared Connection within its Environment.

**Connection Reviewer Assignment**:
An explicit permission for one authenticated External Subject to approve proposed actions using a shared Connection within its Environment. Requesting an action alone does not confer reviewer authority.

**Action Intent**:
An immutable, versioned description of one proposed external side effect, bound to a Connection, connector operation, target, canonical parameters, and provider preconditions.
_Avoid_: Tool call

**Action Consent**:
An authorized End User's authorization of the exact digest of one Action Intent or an explicit policy that covers it. For a subject-owned Connection, that End User is its owner; for a shared Connection, that End User is an assigned reviewer.
_Avoid_: Approval

**Connector Operation**:
A registered external-service action whose gateway-owned definition classifies it as a read or side effect.
_Avoid_: Tool call, workflow action

**Connector Gateway**:
The logical enforcement boundary that resolves Connections and executes registered Connector Operations without exposing credentials to workflow state. It is distinct from the sandbox-facing run-gateway application.
_Avoid_: Run Gateway, sandbox gateway

**Connector Access Policy**:
Protected Environment configuration that limits enabled provider action families and the maximum OAuth scopes they may request.
_Avoid_: Consent policy

**Provider Preconditions**:
Provider state that must remain unchanged between Action Intent creation and execution for the side effect to remain valid.
_Avoid_: Validation

**Unknown Action Outcome**:
A terminal Action Intent outcome where an external provider may have performed the side effect but Linea cannot prove success or failure.
_Avoid_: Failure, retryable error
