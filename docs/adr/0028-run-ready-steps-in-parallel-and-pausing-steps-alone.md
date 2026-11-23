# Run ready steps in parallel and pausing steps alone

A Workflow Execution runs up to five ready steps at once. The walker offers every step whose predecessors have finished; the worker that holds the Execution's lease decides how many to start. One worker still owns the whole Execution, so branches share its lease, deadline and token budget, and no step is handed to another worker. The existing cap of four running Executions per workspace is unchanged, which bounds a workspace to twenty steps at once. The `parallelBranches` feature flag sets the limit; off means one step at a time.

A step that can leave its Execution waiting (Approval, Wait, Agent, and every Connector operation that is not a read) starts only when no other step is running or could start, and runs alone. Pausing, resuming, cancelling and consent were built on an Execution waiting for at most one thing: pausing is claimed against one row, and cancelling rejects an Execution with two pending Approval Requests. Running these alone keeps those guarantees unchanged, at the cost of Agents and Waits in different branches not overlapping. Lifting that needs pausing on several rows without losing a wake-up and cancelling running Agents when a sibling fails, and is left to its own decision.

When a step fails, running steps finish and are recorded, nothing new starts or retries, and the Execution fails with the first error. Aborting them instead would leave outside calls with an unknown outcome. Losing the lease is the exception: it aborts every running step, because another worker may already be repeating them.

Checkpoint writes are queued per Execution. A resume reads only the latest checkpoint, so each must contain every step recorded before it, or a finished step would run again. A step in flight during a crash runs again under its own idempotency key, as it did before.

Two results now depend on timing. With several End steps the last to finish is the Execution's result, which was already the rule. A Variables step applies only its own entries, so branches cannot drop each other's, but if two branches set the same name the last to finish wins.
