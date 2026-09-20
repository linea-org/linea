# `@linea/sdk-react`

`@linea/sdk-react` provides headless React hooks and optional presentation for Linea end-user sessions.

## CopilotKit adapter

Install CopilotKit and Zod alongside the React SDK, then mount the adapter inside the existing CopilotKit and Linea providers:

```tsx
import { CopilotKit } from "@copilotkit/react-core/v2"
import { LineaUserProvider } from "@linea/sdk-react"
import { CopilotKitApprovalAction } from "@linea/sdk-react/copilotkit"

function App() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <LineaUserProvider client={lineaUserClient}>
        <CopilotKitApprovalAction />
        <ExistingCopilotApplication />
      </LineaUserProvider>
    </CopilotKit>
  )
}
```

The CopilotKit agent or backend emits a `linea_approval_request` tool call with an `approvalRequestId` parameter. The adapter renders the matching request from `useApprovalRequests` and submits approve or reject responses through `useDecision`. CopilotKit does not become the source of request, connection, or Decision state.

Pass `conversationId` to scope requests to one conversation. Pass `render` to replace the default card; its presentation covers `pending`, `approved`, `rejected`, `timeout-decided`, `cancelled`, `reconnecting`, and `error`, and provides `approve` and `reject` callbacks backed by the same Decision operation.
