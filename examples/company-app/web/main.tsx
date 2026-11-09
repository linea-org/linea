import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { LineaUserClient } from "@linea/sdk/user"
import {
  ApprovalRequest,
  LineaUserProvider,
  useApprovalRequests,
  useDecision,
} from "@linea/sdk-react"

type Task = {
  id: string
  headline: string
  detail: string
  tone: "working" | "waiting" | "done" | "problem"
  result: unknown
  developerUrl: string
}

const configResponse = await fetch("/api/config")
if (!configResponse.ok) throw new Error("The example server is unavailable")
const config = (await configResponse.json()) as {
  environmentId: string
  apiUrl: string
}
const client = new LineaUserClient({
  environmentId: config.environmentId,
  baseUrl: config.apiUrl,
})

async function api(path: string, init?: RequestInit): Promise<Task> {
  const response = await fetch(path, init)
  const body = (await response.json()) as Task & { message?: string }
  if (!response.ok) throw new Error(body.message ?? "Request failed")
  return body
}

function Reviews() {
  const approvals = useApprovalRequests()
  const decision = useDecision()
  const connection = approvals.connection
  if (connection === "loading") return <p>Checking for reviews…</p>
  if (approvals.error)
    return <p role="alert">Reviews are unavailable. Sign in to see yours.</p>
  if (approvals.pending.length === 0) return <p>Nothing to review.</p>
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
  const [repository, setRepository] = useState("")
  const [task, setTask] = useState<Task>()
  const [error, setError] = useState<string>()
  const taskId = task?.id
  const finished = task?.tone === "done" || task?.tone === "problem"
  useEffect(() => {
    if (!taskId || finished) return
    const timer = setInterval(() => {
      api(`/api/tasks/${taskId}`).then(
        (next) => setTask({ ...next, id: taskId }),
        (cause: unknown) =>
          setError(cause instanceof Error ? cause.message : "Lost connection")
      )
    }, 2000)
    return () => clearInterval(timer)
  }, [taskId, finished])
  async function submit() {
    setError(undefined)
    try {
      setTask(
        await api("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repository }),
        })
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed")
    }
  }
  return (
    <LineaUserProvider client={client}>
      <main>
        <h1>Suggest follow-up issues</h1>
        <label>
          Repository
          <input
            value={repository}
            placeholder="owner/name"
            onChange={(event) => setRepository(event.target.value)}
          />
        </label>
        <button disabled={!repository} onClick={() => void submit()}>
          Suggest two follow-ups
        </button>
        {error ? <p role="alert">{error}</p> : null}
        {task ? (
          <section aria-label="Your request">
            <h2>{task.headline}</h2>
            <p>{task.detail}</p>
            {task.result ? (
              <pre>{JSON.stringify(task.result, null, 2)}</pre>
            ) : null}
            <a href={task.developerUrl}>Developer view</a>
          </section>
        ) : null}
        <section aria-label="Reviews">
          <h2>Reviews</h2>
          <Reviews />
        </section>
      </main>
    </LineaUserProvider>
  )
}

const root = document.getElementById("root")
if (!root) throw new Error("The React root element is missing")
createRoot(root).render(<App />)
