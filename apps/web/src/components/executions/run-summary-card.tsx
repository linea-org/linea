import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { buttonVariants } from "@linealabs/ui/components/button"
import { cn } from "@linealabs/ui/lib/utils"

import { ModelMarkdown } from "@/components/markdown/model-markdown"
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { shortcutTarget } from "@/components/shortcuts/shortcut-target"
import { ASSISTANT_NAME } from "@/lib/assistant-api"
import { chatMessagesQueryOptions } from "@/lib/chat-preview-api"
import type {
  ExecutionDetailResponse,
  JsonValue,
} from "@/lib/execution-detail-schema"
import { readableProviderError } from "@/lib/provider-error"
import { runFailureFix, type RunFailureFix } from "@/lib/run-failure"
import {
  isUnknownOutcome,
  previewJson,
  readableText,
  summarizeRun,
} from "@/lib/run-summary"
import { ErrorCallout } from "./error-callout"
import { stepTitle } from "./execution-step-presentation"

function ResultPreview({ value }: Readonly<{ value: JsonValue }>) {
  const text = readableText(value)
  return text === null ? (
    <pre className="max-h-64 overflow-auto font-mono text-xs break-words whitespace-pre-wrap">
      {previewJson(value)}
    </pre>
  ) : (
    <div className="max-h-64 overflow-auto leading-relaxed break-words">
      <ModelMarkdown content={text} />
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
        {...shortcutTarget("fix")}
      >
        {fix.label}
        <ShortcutKeys id="fix" />
      </Link>
    )
  }
  if (!workflowId) return null
  return (
    <Link
      to="/w/$slug/workflows/$workflowId/builder"
      params={{ slug, workflowId }}
      className={fixLinkClass}
      {...shortcutTarget("fix")}
    >
      {fix.label}
      <ShortcutKeys id="fix" />
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
  const readable = message ? readableProviderError(message) : null
  return (
    <ErrorCallout
      title={summary.outcome}
      message={readable?.summary ?? message ?? "The run stopped with an error."}
      details={readable?.details}
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

function Labeled({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

export function AskInkyLink({
  slug,
  executionId,
  failed,
}: Readonly<{ slug: string; executionId: string; failed: boolean }>) {
  const ask = failed
    ? `Why did run ${executionId} fail, and how do I fix it?`
    : `Explain what run ${executionId} did.`
  return (
    <Link
      to="/w/$slug/assistant"
      params={{ slug }}
      search={{ ask, run: executionId }}
      className={buttonVariants()}
      {...shortcutTarget("ask-inky")}
    >
      Ask {ASSISTANT_NAME} about this run
      <ShortcutKeys id="ask-inky" onPrimary />
    </Link>
  )
}

export function RunSummaryCard({
  slug,
  detail,
}: Readonly<{ slug: string; detail: ExecutionDetailResponse }>) {
  const summary = summarizeRun(detail)
  const { execution } = detail
  const failed = execution.status === "failed"
  const succeeded = execution.status === "succeeded"
  const failureMessage = execution.error?.message
  const sent = useSentMessage(slug, detail)
  const showResult = succeeded && summary.result !== null
  const partial = summary.finishedBeforeFailure.length > 0
  return (
    <section aria-label="Run summary" className="flex flex-col gap-4">
      {sent ? (
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">Request</span>
          <p className="max-w-4/5 rounded-xl bg-muted px-3 py-2 text-sm break-words whitespace-pre-wrap">
            {sent}
          </p>
        </div>
      ) : null}
      {failed ? (
        <div>
          <FailureCard slug={slug} detail={detail} />
          {partial ? (
            <div className="mt-3">
              <Labeled label="Finished before the failure">
                <ul className="list-inside list-disc">
                  {summary.finishedBeforeFailure.map((step) => (
                    <li key={step.id}>
                      <a href={`#step-${step.id}`} className="hover:underline">
                        {stepTitle(step.name)}
                      </a>{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        {step.nodeId}
                      </span>
                    </li>
                  ))}
                </ul>
              </Labeled>
            </div>
          ) : null}
          {partial || (failureMessage && isUnknownOutcome(failureMessage)) ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {summary.nextAction}
            </p>
          ) : null}
        </div>
      ) : null}
      {showResult && summary.result !== null ? (
        <Labeled label="Result">
          <ResultPreview value={summary.result} />
        </Labeled>
      ) : null}
      {failed || showResult ? null : (
        <div className="text-sm">
          <p className="font-medium">{summary.outcome}</p>
          {summary.attention ? (
            <p className="text-muted-foreground">{summary.attention}</p>
          ) : null}
          {succeeded ? null : (
            <p className="text-muted-foreground">{summary.nextAction}</p>
          )}
        </div>
      )}
    </section>
  )
}
