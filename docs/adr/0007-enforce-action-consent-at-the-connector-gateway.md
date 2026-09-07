# Enforce Action Consent at the connector gateway

The connector and tool gateway, not a workflow-authored Approval node, will enforce End-User consent before using an End User's Connection for a write or side effect. Workflow authors can omit or route around nodes, so the gateway must bind a Decision to the immutable digest and provider preconditions it actually executes; timeout always rejects and stale provider state performs no side effect. The Approval Request protocol remains shared so applications render workflow decisions and Action Consent consistently.
