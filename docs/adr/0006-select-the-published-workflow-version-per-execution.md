# Select the published Workflow version per Execution

A Conversation pins one Workflow but not one Workflow version; every new Execution uses and permanently records the version published when that Execution starts. Pinning a version for the Conversation's entire lifetime would leave active threads on obsolete behavior indefinitely, while selecting once per Execution preserves reproducibility and lets an Operator deploy fixes without abandoning Conversations.
