# Separate Agent Contracts from definition versions

An Agent's public input/output promise is an immutable Agent Contract revision, independent of its implementation version, following the existing Workflow Contract behavior. An Environment selects a compatible published Agent Definition version and contract revision; every Execution records both and remains pinned across pauses, retries, and resumes, so publishing an implementation cannot silently break callers or change in-flight behavior.

A breaking public contract requires a new revision and explicit Environment rebinding. A standalone Agent returns its own contract-validated root result without a fabricated Workflow or End node. This records target behavior; it does not prescribe generic contract tables or claim standalone Agent execution is implemented.
