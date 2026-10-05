# Run versioned Agents on shared execution state

The first Agent milestone is an Application-owned, reusable, versioned Agent Definition runnable through its Environment API and referenced by a Workflow. Agent and Workflow definitions remain distinct, while their execution history, approvals, waits, and recovery use shared execution services and control state; this supersedes ADR 0022's separately persisted control-state clause to avoid disconnected approval and resume behavior.

The first acceptance scenario uses the existing GitHub integration: one Agent proposes two distinct actions, obtains independently authorized approvals, and survives a worker restart without duplicating actions or losing decisions. Shared Connections retain separate requester grants and reviewer assignments; requesting work does not authorize its approval.

Supervisor Agents and delegation are deferred until this task-specific milestone works. Frames are deferred until repeated graph visits, Loops, or paused-step replay require them. This records the target design, not implemented capabilities.
