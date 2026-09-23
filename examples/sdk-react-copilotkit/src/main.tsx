import { CopilotKit } from "@copilotkit/react-core/v2"
import { createRoot } from "react-dom/client"
import { LineaUserClient } from "@linea/sdk/user"
import { LineaUserProvider } from "@linea/sdk-react"
import { CopilotKitApprovalAction } from "@linea/sdk-react/copilotkit"

const client = new LineaUserClient({
  applicationId: "80000000-0000-4000-8000-000000000008",
  baseUrl: "https://api.example",
})

function ExistingCopilotApplication() {
  return <h1>Existing CopilotKit application</h1>
}

function App() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <LineaUserProvider client={client}>
        <CopilotKitApprovalAction />
        <ExistingCopilotApplication />
      </LineaUserProvider>
    </CopilotKit>
  )
}

const root = document.getElementById("root")
if (!root) throw new Error("The React root element is missing")
createRoot(root).render(<App />)
