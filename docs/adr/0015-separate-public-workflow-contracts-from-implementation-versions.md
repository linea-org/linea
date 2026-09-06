# Separate public Workflow Contracts from implementation versions

Applications will bind to an immutable public input/output Contract revision while each Execution selects and records the latest published implementation that conforms to it. Pinning an implementation for every Conversation would block fixes, while exposing the latest implementation without a stable contract would let a publish silently break third-party Applications; breaking contract changes therefore require a new revision and explicit Application rebinding.
