# Make public Execution starts asynchronous

Public Execution starts return HTTP 202 and an Execution projection, with completion observed through SSE, polling, or signed webhooks. Workflows can pause for approval or run longer than an HTTP request, so holding the start request open creates unreliable timeout semantics; Application backends instead receive explicit idempotent cancellation authority while End Users do not in the first release.
