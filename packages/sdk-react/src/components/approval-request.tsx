import { useState, type ReactNode } from "react"
import type { ApprovalRequest as ApprovalRequestResource } from "@linea/sdk/user"

export type ApprovalRequestPresentationState =
  | "pending"
  | "approved"
  | "rejected"
  | "timeout-decided"
  | "cancelled"
  | "reconnecting"
  | "error"

export type ApprovalRequestPresentation = {
  request: ApprovalRequestResource
  state: ApprovalRequestPresentationState
  label: string
  tone: "neutral" | "positive" | "negative" | "warning"
  isActionable: boolean
  error: unknown
}

export type ApprovalRequestProps = {
  request: ApprovalRequestResource
  connection?: "ready" | "reconnecting" | "error"
  error?: unknown
  onApprove?: (comment: string | undefined) => void | Promise<unknown>
  onReject?: (comment: string | undefined) => void | Promise<unknown>
  render?: (presentation: ApprovalRequestPresentation) => ReactNode
}

const presentationMetadata = {
  pending: { label: "Approval required", tone: "warning", actionable: true },
  approved: { label: "Approved", tone: "positive", actionable: false },
  rejected: { label: "Rejected", tone: "negative", actionable: false },
  "timeout-decided": {
    label: "Decided after timeout",
    tone: "neutral",
    actionable: false,
  },
  cancelled: { label: "Cancelled", tone: "neutral", actionable: false },
  reconnecting: { label: "Reconnecting", tone: "neutral", actionable: false },
  error: {
    label: "Unable to load approval",
    tone: "negative",
    actionable: false,
  },
} satisfies Record<
  ApprovalRequestPresentationState,
  {
    label: string
    tone: ApprovalRequestPresentation["tone"]
    actionable: boolean
  }
>

function resolveState(
  request: ApprovalRequestResource,
  connection: ApprovalRequestProps["connection"],
  error: unknown
): ApprovalRequestPresentationState {
  if (error !== undefined || connection === "error") return "error"
  if (connection === "reconnecting") return "reconnecting"
  if (request.status === "cancelled") return "cancelled"
  if (request.status === "pending") return "pending"
  if (request.decision?.reason === "timeout") return "timeout-decided"
  return request.decision?.outcome ?? "error"
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return undefined
}

export function ApprovalRequest({
  request,
  connection = "ready",
  error,
  onApprove,
  onReject,
  render,
}: ApprovalRequestProps): ReactNode {
  const [comment, setComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState<unknown>()
  const state = resolveState(request, connection, error ?? submissionError)
  const metadata = presentationMetadata[state]
  const presentation: ApprovalRequestPresentation = {
    request,
    state,
    label: metadata.label,
    tone: metadata.tone,
    isActionable: metadata.actionable && !isSubmitting,
    error: error ?? submissionError,
  }
  if (render) return render(presentation)
  async function submit(
    action:
      | ((comment: string | undefined) => void | Promise<unknown>)
      | undefined
  ): Promise<void> {
    if (!action) return
    setIsSubmitting(true)
    setSubmissionError(undefined)
    try {
      await action(comment.trim() || undefined)
    } catch (cause) {
      setSubmissionError(cause)
    } finally {
      setIsSubmitting(false)
    }
  }
  return (
    <section
      aria-busy={state === "reconnecting" || isSubmitting}
      aria-labelledby={`${request.id}-title`}
      data-linea-approval-request=""
      data-state={state}
      data-tone={metadata.tone}
    >
      <header>
        <h2 id={`${request.id}-title`}>{request.display.title}</h2>
        <p role="status">{metadata.label}</p>
      </header>
      {request.display.description ? (
        <p>{request.display.description}</p>
      ) : null}
      {request.display.details ? (
        <dl>
          {Object.entries(request.display.details).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {presentation.isActionable &&
      (onApprove !== undefined || onReject !== undefined) ? (
        <footer>
          <label>
            Comment
            <textarea
              value={comment}
              onChange={(event) => setComment(event.currentTarget.value)}
            />
          </label>
          {onReject ? (
            <button type="button" onClick={() => void submit(onReject)}>
              Reject
            </button>
          ) : null}
          {onApprove ? (
            <button type="button" onClick={() => void submit(onApprove)}>
              Approve
            </button>
          ) : null}
        </footer>
      ) : null}
      {errorMessage(presentation.error) ? (
        <p role="alert">{errorMessage(presentation.error)}</p>
      ) : null}
    </section>
  )
}
