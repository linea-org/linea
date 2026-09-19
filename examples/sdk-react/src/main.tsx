import { createRoot } from "react-dom/client"
import { LineaUserClient } from "@linea/sdk/user"
import {
  ApprovalRequest,
  LineaUserProvider,
  useApprovalRequests,
  useDecision,
} from "@linea/sdk-react"

const client = new LineaUserClient({
  applicationId: "80000000-0000-4000-8000-000000000008",
  baseUrl: "https://api.example",
})

function Approvals() {
  const approvals = useApprovalRequests()
  const decision = useDecision()
  const connection = approvals.connection
  if (connection === "loading") return <p>Loading approvals</p>
  if (approvals.error) return <p>Approvals are unavailable</p>
  if (approvals.pending.length === 0) return <p>No pending approvals</p>
  return approvals.pending.map((request) => (
    <ApprovalRequest
      key={request.id}
      request={request}
      connection={connection}
      error={decision.error}
      onApprove={(comment) =>
        decision.decide(request.id, { decision: "approved", comment })
      }
      onReject={(comment) =>
        decision.decide(request.id, { decision: "rejected", comment })
      }
    />
  ))
}

function App() {
  return (
    <LineaUserProvider client={client}>
      <main>
        <h1>Linea approvals</h1>
        <Approvals />
      </main>
    </LineaUserProvider>
  )
}

const root = document.getElementById("root")
if (!root) throw new Error("The React root element is missing")
createRoot(root).render(<App />)
