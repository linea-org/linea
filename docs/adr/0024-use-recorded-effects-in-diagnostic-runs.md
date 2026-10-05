# Use recorded effects in diagnostic runs

Initial Replay and Regression runs reuse matching Recorded Effects instead of performing fresh writes, including writes to external services and persistent platform state. A missing recording, mismatched request, or uncertain outcome refuses the proposed write; a stored result must not make changed request behavior appear validated. This covers isolated step Replay and both node and conversation Regression Cases, because all can encounter mutating operations.

Reused results must be visibly identified as recorded evidence. Fresh writes are deferred to a separately authorized live-test path with its own durable retry protection; a diagnostic run cannot inherit permission to repeat the original action. This favors safe investigation over immediate live-write testing and records target behavior, not a guarantee already implemented.
