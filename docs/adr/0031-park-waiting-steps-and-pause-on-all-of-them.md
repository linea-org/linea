# Park waiting steps and pause on all of them

With `parallelBranches`, a step that waits no longer stops its Workflow Execution. A Wait or Agent step is parked and other branches continue, so Agents in different branches overlap. This replaces ADR 0028's rule that every step that may pause runs alone; Approvals and Connector operations that are not reads still start only when nothing else is running or could start. A parked step holds none of the five step slots, so a run starts as many Agents as its author added; the workspace's cap on running Executions decides how many work at once.

The Execution pauses when nothing is running and nothing can start. One transaction locks every parked step's row, in the order a cancel locks them, and pauses only if all still wait; otherwise the run continues at once. Whatever settles a step changes its row and then re-queues the Execution if it is paused, so it either commits before the lock and is seen, or finds the Execution paused. Locking only one row would lose the wake-up of another. While the run is still working, a settled step cannot wake it, so parked steps are tried again when a step finishes and every ten seconds beside a long one.

At most one decision is asked for at a time per Execution, because cancelling one rejects two pending Approval Requests and reviewers act on one exact action. The step that asked keeps the turn across resumes: a resume enters it before any other step that could ask.

An Execution can also end without running, when its next claim is refused because its authority was revoked. The worker that finds it ended cancels what it left open, as ADR 0029 does for a failure. A redelivered job does the same, so a crash in between leaves nothing open.

With the flag off a step that waits stops the run, as before.
