import { summarizeRun, previewJson } from "@/lib/run-summary"
import type { ExecutionDetailResponse } from "@/lib/execution-detail-schema"

function Field({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xs">{children}</dd>
    </div>
  )
}

export function RunSummaryCard({
  detail,
}: Readonly<{ detail: ExecutionDetailResponse }>) {
  const summary = summarizeRun(detail)
  return (
    <section
      aria-label="Run summary"
      className="grid gap-4 border-b px-4 py-3 md:grid-cols-2"
    >
      <dl className="contents">
        <Field label="Requested">
          {summary.request ? (
            <pre className="max-h-32 overflow-auto font-mono break-words whitespace-pre-wrap">
              {previewJson(summary.request)}
            </pre>
          ) : (
            <span className="text-muted-foreground">No request recorded.</span>
          )}
        </Field>
        <Field label="What happened">
          <p className="font-medium">{summary.outcome}</p>
          {summary.result ? (
            <pre className="mt-1 max-h-32 overflow-auto font-mono break-words whitespace-pre-wrap">
              {previewJson(summary.result)}
            </pre>
          ) : null}
        </Field>
        <Field label="Needs attention">
          {summary.attention ?? (
            <span className="text-muted-foreground">Nothing right now.</span>
          )}
        </Field>
        <Field label="Next">{summary.nextAction}</Field>
      </dl>
    </section>
  )
}
