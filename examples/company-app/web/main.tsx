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

const taskIdPattern = /^[0-9a-f-]{36}$/

class Unauthorized extends Error {}

async function api(path: string, init?: RequestInit): Promise<Task> {
  const response = await fetch(path, { credentials: "same-origin", ...init })
  const body = (await response.json()) as Task & { message?: string }
  if (response.status === 401)
    throw new Unauthorized(body.message ?? "Sign in first")
  if (!response.ok) throw new Error(body.message ?? "Request failed")
  return body
}

function AccessCode({ onSignedIn }: Readonly<{ onSignedIn: () => void }>) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string>()
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        setError(undefined)
        void fetch("/api/session", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        }).then(async (response) => {
          if (response.ok) return onSignedIn()
          const body = (await response.json()) as { message?: string }
          setError(body.message ?? "Sign-in failed")
        })
      }}
    >
      <label>
        <span>Access code </span>
        <input
          type="password"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </label>
      <button disabled={!code}>Continue</button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  )
}

type FollowUp = { title: string; body?: string; url?: string }

function followUps(result: unknown): FollowUp[] {
  if (typeof result !== "object" || result === null || !("issues" in result))
    return []
  const issues: unknown = result.issues
  if (!Array.isArray(issues)) return []
  return issues.flatMap((issue: unknown) => {
    if (typeof issue !== "object" || issue === null || !("title" in issue))
      return []
    const { title } = issue
    if (typeof title !== "string") return []
    const body =
      "body" in issue && typeof issue.body === "string" ? issue.body : undefined
    const url =
      "url" in issue && typeof issue.url === "string" ? issue.url : undefined
    return [{ title, body, url }]
  })
}

function Result({ result }: Readonly<{ result: unknown }>) {
  if (result === null || result === undefined) return null
  const issues = followUps(result)
  if (issues.length === 0) return <p>Your result is ready.</p>
  return (
    <ul aria-label="Follow-up issues">
      {issues.map((issue) => (
        <li key={issue.title}>
          <strong>{issue.title}</strong>
          {issue.body ? <p>{issue.body}</p> : null}
          {issue.url?.startsWith("https://") ? (
            <a href={issue.url}>Open on GitHub</a>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function SignIn() {
  const [signedIn, setSignedIn] = useState<boolean>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    const callback = new URL(location.href)
    const code = callback.searchParams.get("code")
    const state = callback.searchParams.get("state")
    const finish =
      code && state
        ? client
            .completeAuthorization({ code, state })
            .then(() => history.replaceState({}, "", callback.pathname))
        : Promise.resolve()
    finish
      .then(() => client.session())
      .then(
        (session) => setSignedIn(session !== undefined),
        (cause: unknown) =>
          setError(cause instanceof Error ? cause.message : "Sign-in failed")
      )
  }, [])
  if (error) return <p role="alert">{error}</p>
  if (signedIn === undefined) return <p>Checking your sign-in…</p>
  if (signedIn) return null
  return (
    <button
      onClick={() => {
        void client
          .startAuthorization({
            redirectUri: `${location.origin}${location.pathname}`,
          })
          .then((authorization) =>
            location.assign(authorization.authorizationUrl)
          )
          .catch((cause: unknown) =>
            setError(cause instanceof Error ? cause.message : "Sign-in failed")
          )
      }}
    >
      Sign in to review
    </button>
  )
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
  const [needsCode, setNeedsCode] = useState(false)
  const taskId = task?.id
  const finished = task?.tone === "done" || task?.tone === "problem"
  useEffect(() => {
    if (!taskId || finished || !taskIdPattern.test(taskId)) return
    const controller = new AbortController()
    const timer = setInterval(() => {
      api(`/api/tasks/${encodeURIComponent(taskId)}`, {
        signal: controller.signal,
      }).then(
        (next) => setTask({ ...next, id: taskId }),
        (cause: unknown) => {
          if (controller.signal.aborted) return
          if (cause instanceof Unauthorized) return setNeedsCode(true)
          setError(cause instanceof Error ? cause.message : "Lost connection")
        }
      )
    }, 2000)
    return () => {
      clearInterval(timer)
      controller.abort()
    }
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
      if (cause instanceof Unauthorized) return setNeedsCode(true)
      setError(cause instanceof Error ? cause.message : "Request failed")
    }
  }
  return (
    <LineaUserProvider client={client}>
      <main>
        <h1>Suggest follow-up issues</h1>
        <label>
          <span>Repository </span>
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
        {needsCode ? (
          <AccessCode
            onSignedIn={() => {
              setNeedsCode(false)
              void submit()
            }}
          />
        ) : null}
        {task ? (
          <section aria-label="Your request">
            <h2>{task.headline}</h2>
            <p>{task.detail}</p>
            <Result result={task.result} />
            <a href={task.developerUrl}>Developer view</a>
          </section>
        ) : null}
        <section aria-label="Reviews">
          <h2>Reviews</h2>
          <SignIn />
          <Reviews />
        </section>
      </main>
    </LineaUserProvider>
  )
}

const root = document.getElementById("root")
if (!root) throw new Error("The React root element is missing")
createRoot(root).render(<App />)
