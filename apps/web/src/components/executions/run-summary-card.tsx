import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { buttonVariants } from "@linealabs/ui/components/button"
import { cn } from "@linealabs/ui/lib/utils"

import { chatMessagesQueryOptions } from "@/lib/chat-preview-api"
import type { ExecutionDetailResponse } from "@/lib/execution-detail-schema"
import { runFailureFix, type RunFailureFix } from "@/lib/run-failure"
import { isUnknownOutcome, previewJson, summarizeRun } from "@/lib/run-summary"
import { ErrorCallout } from "./error-callout"

function Field({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function useSentMessage(slug: string, detail: ExecutionDetailResponse) {
  const { execution } = detail
  const payload = execution.triggerPayload ?? null
  const chatMessageId =
    typeof payload?.chatMessageId === "string" ? payload.chatMessageId : null
  const conversationId =
    typeof payload?.conversationId === "string" ? payload.conversationId : null
  const { data: messages } = useQuery(
    chatMessagesQueryOptions(
      slug,
      execution.workflowId ?? "",
      execution.workflowId ? conversationId : null
    )
  )
  const chatMessage = messages?.find(
    (message) => message.id === chatMessageId
  )?.content
  if (chatMessage) return chatMessage
  return chatMessageId === null && payload ? previewJson(payload) : undefined
}

const fixLinkClass = cn(
  buttonVariants({ variant: "outline", size: "sm" }),
  "bg-background hover:bg-muted"
)

function FixLink({
  slug,
  fix,
  workflowId,
}: Readonly<{ slug: string; fix: RunFailureFix; workflowId: string | null }>) {
  if (fix.to === "models") {
    return (
      <Link
        to="/w/$slug/settings/models"
        params={{ slug }}
        className={fixLinkClass}
      >
        {fix.label}
      </Link>
    )
  }
  if (!workflowId) return null
  return (
    <Link
      to="/w/$slug/workflows/$workflowId/builder"
      params={{ slug, workflowId }}
      className={fixLinkClass}
    >
      {fix.label}
    </Link>
  )
}

function FailureCard({
  slug,
  detail,
}: Readonly<{ slug: string; detail: ExecutionDetailResponse }>) {
  const summary = summarizeRun(detail)
  const message = detail.execution.error?.message
  const fix = message ? runFailureFix(message) : null
  return (
    <ErrorCallout
      title={summary.outcome}
      message={message ?? "The run stopped with an error."}
      action={
        fix ? (
          <FixLink
            slug={slug}
            fix={fix}
            workflowId={detail.execution.workflowId}
          />
        ) : null
      }
    />
  )
}

export function RunSummaryCard({
  slug,
  detail,
}: Readonly<{ slug: string; detail: ExecutionDetailResponse }>) {
  const summary = summarizeRun(detail)
  const failed = detail.execution.status === "failed"
  const failureMessage = detail.execution.error?.message
  const sent = useSentMessage(slug, detail)
  return (
    <section
      aria-label="Run summary"
      className="grid gap-4 border-b px-4 py-3 md:grid-cols-2"
    >
      {failed ? (
        <div className="md:col-span-2">
          <FailureCard slug={slug} detail={detail} />
          {failureMessage && isUnknownOutcome(failureMessage) ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {summary.nextAction}
            </p>
          ) : null}
        </div>
      ) : null}
      <dl className="contents">
        {sent ? (
          <Field label="Sent">
            <p className="break-words whitespace-pre-wrap">{sent}</p>
          </Field>
        ) : null}
        {failed ? null : (
          <Field label="What happened">
            <p className="font-medium">{summary.outcome}</p>
            {summary.result !== null ? (
              <pre className="mt-1 max-h-32 overflow-auto font-mono break-words whitespace-pre-wrap">
                {previewJson(summary.result)}
              </pre>
            ) : null}
          </Field>
        )}
        {summary.attention && !failed ? (
          <Field label="Needs attention">{summary.attention}</Field>
        ) : null}
        {failed ? null : <Field label="Next">{summary.nextAction}</Field>}
      </dl>
    </section>
  )
}
