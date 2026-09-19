# Domain Context

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

## Regression Run

One execution of active Regression Cases against a specific workflow version.

## Regression Result

The outcome of one Regression Case within a Regression Run.

## End-User Access

**Operator**:
A Linea workspace customer that authors and operates workflows.
_Avoid_: Customer, consumer

**Application**:
One deployed Operator product boundary through which Linea-backed behavior is exposed to End Users. Staging and production are separate Applications.
_Avoid_: Client, frontend

**Application Key**:
A server credential bound to one Application and explicitly scoped to its end-user runtime resources. It cannot access another Application or change identity trust configuration.
_Avoid_: App token, workspace API key

**Workspace Key**:
A server credential scoped to explicitly granted workspace operations such as Workflow, Signal, and cross-Application monitoring. It cannot act as an End User or substitute for an Application Key.
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
A short-lived, narrowly scoped capability through which an End User interacts with Linea from an Application.
_Avoid_: Conversation token

**Conversation**:
One independent thread or context owned by an External Subject within an Application and handled by one Workflow. Each Execution records the Workflow version current when it starts.
_Avoid_: Session

**Approval Request**:
A durable request owned by an approver identity that pauses an Execution until it receives a human or timeout Decision or is cancelled.
_Avoid_: Confirmation

**Decision**:
An immutable approve or reject response to an Approval Request.
_Avoid_: Resolution

**Connection**:
An Application-scoped credential relationship between one External Subject and one stable provider account. A revoked Connection cannot be reactivated.
_Avoid_: Integration

**Action Intent**:
An immutable, versioned description of one proposed external side effect, bound to a Connection, connector operation, target, canonical parameters, and provider preconditions.
_Avoid_: Tool call

**Action Consent**:
An End User's authorization of the exact digest of one Action Intent or an explicit policy that covers it.
_Avoid_: Approval

**Connector Operation**:
A registered external-service action whose gateway-owned definition classifies it as a read or side effect.
_Avoid_: Tool call, workflow action

**Connector Gateway**:
The logical enforcement boundary that resolves Connections and executes registered Connector Operations without exposing credentials to workflow state. It is distinct from the sandbox-facing run-gateway application.
_Avoid_: Run Gateway, sandbox gateway

**Connector Access Policy**:
Protected Application configuration that limits enabled provider action families and the maximum OAuth scopes they may request.
_Avoid_: Consent policy

**Provider Preconditions**:
Provider state that must remain unchanged between Action Intent creation and execution for the side effect to remain valid.
_Avoid_: Validation

**Unknown Action Outcome**:
A terminal Action Intent outcome where an external provider may have performed the side effect but Linea cannot prove success or failure.
_Avoid_: Failure, retryable error
