# Let a sent write report after its Workflow fails

When a Workflow Execution fails, what it left open is cancelled in the same transaction: the Agents it started, their pending Approval Requests and unclaimed Action Intents, and its own. The transaction takes the tree's locks in the order a cancel does, so a decision, a claim or a cancel either commits before the failure and is seen by it, or finds the work cancelled. The audit entries have no actor, because no person or key cancelled the work.

An Agent with a claimed Action Intent is left running, because ADR 0021 requires a claimed intent to report its outcome and only its own worker may do so. An ended parent still blocks proposing, deciding, claiming and every dispatch. A claimed intent that has not been sent is recorded as failed when its dispatch is refused; one that has been sent reports what the provider answered. If the worker crashed, the Agent is claimed again only to settle that intent, and a sent one is recorded as unknown rather than sent again. The Agent then stops as cancelled before its next model or tool call.

Cancelling an Execution through an Environment key is unchanged: it is refused while any intent in the tree is executing.
