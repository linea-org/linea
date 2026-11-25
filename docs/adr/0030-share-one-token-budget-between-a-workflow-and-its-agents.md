# Share one token budget between a Workflow and its Agents

A Workflow Execution and the Agents it starts draw on one token budget, the one a single Execution already has. A Workflow can start as many Agents as its author adds, so a budget per Agent would let one run spend a multiple of its limit. Standalone Agents keep their own.

Every check reads what the others have recorded, so no counter has to be kept consistent across workers. A model call in flight is not recorded yet, so each running Agent or step can overshoot by the call it is in; we accept that over reserving tokens before each call, whose size is not known. The budget is checked before every step, so an Agent whose last call passes it succeeds and its Workflow then stops.

It applies to a Workflow Execution that started with the `parallelBranches` flag, also to Agents that run one at a time. Off leaves each Agent its own budget.
