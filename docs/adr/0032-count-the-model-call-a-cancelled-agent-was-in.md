# Count the model call a cancelled Agent was in

An Agent can be cancelled while a model call is in flight. The worker stops that call when its next heartbeat finds the lease gone, so a call that returns first still reports what it used, and an aborted one reports nothing.

A cancelled Execution keeps the worker that held its lease, with no expiry. That grants no other write, because each of them also needs an unexpired lease. It lets that worker, and no other, add the call: one failed `ai` step with its tokens and cost but no input or output, and the same amounts added to the totals. A worker whose lease another worker took still writes nothing. The step keeps the workspace's daily limit and a shared token budget right, since both add up steps.

We keep aborting the call. Letting it finish would give exact numbers, but a cancel would then spend more and hold a worker, and the provider client could retry the call. An aborted call is recorded with no tokens and a partial cost, as is one stopped by the Agent's work budget. Its tokens are missing from the daily limit. We don't estimate them.
