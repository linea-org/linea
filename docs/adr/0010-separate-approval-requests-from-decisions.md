# Separate Approval Requests from immutable Decisions

Approval Requests will store mutable pending, decided, or cancelled lifecycle state while a one-to-one Decision record immutably captures outcome, actor, reason, comment, idempotency key, and time. Combining both concepts in the existing `approvals` row obscures the distinction between what was requested and how it ended, especially when workspace users, External Subjects, and timeout are different actor kinds.
