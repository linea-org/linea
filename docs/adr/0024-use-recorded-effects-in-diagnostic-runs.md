# Use recorded effects in diagnostic runs

Initial Replay and Regression runs reuse matching Recorded Effects instead of performing fresh writes, including writes to external services and persistent platform state. A missing recording, mismatched request, or uncertain outcome refuses the proposed write; a stored result must not make changed request behavior appear validated. This covers isolated step Replay and both node and conversation Regression Cases, because all can encounter mutating operations.

Reused results must be visibly identified as recorded evidence. Fresh writes are deferred to a separately authorized live-test path with its own durable retry protection; a diagnostic run cannot inherit permission to repeat the original action. This favors safe investigation over immediate live-write testing and records target behavior, not a guarantee already implemented.

External reads also use matching recorded responses by default, while model reasoning may rerun within its budget. Holding external inputs constant separates an Agent change from a change in provider data. Explicitly selected live reads for supported read-only operations are deferred and must be visibly distinguished from frozen diagnostics.

Regression Cases own the minimal credential-free response fixtures they need, preserving source Environment and subject attribution rather than depending on source-trace lifetime. Ordinary trace deletion does not remove those fixtures; explicit case-retention, redaction, and subject-erasure rules still apply. Missing or redacted fixtures produce an unavailable diagnostic result without live fallback. Fixture access rules and retention periods must be specified before fixture persistence ships.
