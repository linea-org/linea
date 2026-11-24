# Lock the subject, then the Environment, before a write reports

Proposing, claiming or dispatching a write locks its External Subject, its Environment and then its Connection, Approval Request, Execution and Action Intent. Recording what happened inserts an outbox message or an audit fact instead, and their foreign keys take the Environment before the subject. Two runs of one End User could therefore deadlock, and if PostgreSQL ended the one recording a write, nothing reported that write again.

Both inserts now take the subject and the Environment first, in a claim's order, with the lock their foreign keys would take anyway. Recording an outcome, finishing or failing a run and cancelling one do so before they lock the run itself, so disabling or erasing the subject can't meet them halfway.

A worker can still fail to record an outcome, for example when the database goes away. Only the worker holding the run may report it, so an Execution that fails settles the writes still executing in it, in the same transaction: `outcome_unknown` if sent, `failed` if not.

Revoking a Connection does the same before it locks the Connection. When another End User may use it through a grant, their claim locks their own subject, which a revocation still takes last, so those two can deadlock. That ends a claim, a dispatch or the revocation, never the recording of a write.
