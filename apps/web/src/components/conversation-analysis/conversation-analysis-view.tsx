import { Card } from "@linealabs/ui/components/card"
import { Badge } from "@linealabs/ui/components/badge"
import type {
  ConversationAnalysisResponse,
  ConversationFinding,
  ConversationMessage,
} from "@/lib/conversation-analyses-api"

function displayName(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/^./, (character) => character.toUpperCase())
}

function ConversationTranscript({
  messages,
}: {
  messages: ConversationMessage[]
}) {
  return (
    <section>
      <h2 className="px-1 text-base font-medium text-foreground">
        Conversation
      </h2>
      <Card render={<ol />} className="mt-2 gap-0 py-0">
        {messages.map((message) => (
          <li
            key={message.id}
            className="border-b border-border px-4 py-3 last:border-b-0"
          >
            <p className="text-sm font-medium text-muted-foreground">
              {displayName(message.role)}
            </p>
            <p className="mt-1 text-base text-foreground">{message.content}</p>
          </li>
        ))}
      </Card>
    </section>
  )
}

function AnalysisState({
  label,
  title,
  description,
  destructive,
}: {
  label: string
  title: string
  description: string
  destructive: boolean
}) {
  return (
    <Card render={<section />} className="gap-0 px-4 py-6">
      <Badge variant={destructive ? "destructive" : "outline"}>{label}</Badge>
      <h1 className="mt-3 text-base font-medium text-foreground">{title}</h1>
      <p className="mt-1 text-base text-muted-foreground">{description}</p>
    </Card>
  )
}

export function ConversationAnalysisError({ error }: { error: unknown }) {
  const message =
    error instanceof Error
      ? error.message
      : "Conversation analysis could not be loaded"
  const unauthorized = message.includes("do not have access")
  return (
    <AnalysisState
      label={unauthorized ? "Access denied" : "Analysis unavailable"}
      title={
        unauthorized
          ? "You cannot view this conversation"
          : "This conversation analysis could not be loaded"
      }
      description={message}
      destructive
    />
  )
}

function FindingCard({
  finding,
  evidence,
}: {
  finding: ConversationFinding
  evidence: ConversationMessage | undefined
}) {
  return (
    <Card
      render={<li />}
      size="sm"
      className="scroll-mt-4 gap-0 px-(--card-spacing)"
      id={`finding-${finding.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{displayName(finding.axis)}</Badge>
        <span className="text-base font-medium text-foreground">
          {displayName(finding.category)}
        </span>
        <span className="text-sm text-muted-foreground">
          {Math.round(finding.confidence * 100)}% confidence
        </span>
      </div>
      {finding.rationale ? (
        <p className="mt-2 text-base text-foreground">{finding.rationale}</p>
      ) : null}
      {evidence ? (
        <div className="mt-3 border-l-2 border-primary pl-3">
          <p className="text-sm font-medium text-muted-foreground">
            Cited {displayName(evidence.role)} message
          </p>
          <p className="mt-1 text-base text-foreground">{evidence.content}</p>
        </div>
      ) : null}
    </Card>
  )
}

export function ConversationAnalysisView({
  analysis,
}: {
  analysis: ConversationAnalysisResponse
}) {
  if (analysis.status === "pending") {
    return (
      <div className="flex flex-col gap-4">
        <AnalysisState
          label="Analysis pending"
          title="This conversation has not been analyzed yet"
          description="Analysis begins after the conversation becomes idle."
          destructive={false}
        />
        <ConversationTranscript messages={analysis.conversation.messages} />
      </div>
    )
  }
  if (analysis.status === "disabled") {
    return (
      <div className="flex flex-col gap-4">
        <AnalysisState
          label="Analysis disabled"
          title="Conversation analysis is not enabled for this workspace"
          description="Turn on behavior analysis in settings."
          destructive={false}
        />
        <ConversationTranscript messages={analysis.conversation.messages} />
      </div>
    )
  }
  if (analysis.status === "unavailable") {
    const attemptSummary = analysis.attempt
      ? ` ${analysis.attempt.attemptCount} attempts recorded; last attempt ${new Date(analysis.attempt.lastAttemptAt).toLocaleString()}.`
      : ""
    return (
      <div className="flex flex-col gap-4">
        <AnalysisState
          label="Analysis unavailable"
          title="The latest analysis attempt did not produce a result"
          description={`The analyzer will retry automatically.${attemptSummary}`}
          destructive
        />
        <ConversationTranscript messages={analysis.conversation.messages} />
      </div>
    )
  }
  if (analysis.status === "sampled_out") {
    return (
      <div className="flex flex-col gap-4">
        <AnalysisState
          label="Sampled out"
          title="This conversation was not selected for model analysis"
          description="The transcript is still below."
          destructive={false}
        />
        <ConversationTranscript messages={analysis.conversation.messages} />
      </div>
    )
  }
  const metadata = analysis.analysis
  return (
    <div className="flex flex-col gap-4">
      <Card render={<section />} className="gap-0 py-0">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h1 className="text-base font-medium text-foreground">
              Conversation analysis
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {analysis.conversation.externalSubjectId ??
                "Unattributed subject"}
            </p>
          </div>
          <Badge variant="success">Analysis complete</Badge>
        </div>
        <dl className="grid gap-px bg-border sm:grid-cols-3">
          <div className="bg-card px-4 py-3">
            <dt className="text-sm text-muted-foreground">Model</dt>
            <dd className="mt-1 text-sm text-foreground">
              {metadata.model ?? "Not recorded"}
            </dd>
          </div>
          <div className="bg-card px-4 py-3">
            <dt className="text-sm text-muted-foreground">Provider</dt>
            <dd className="mt-1 text-sm text-foreground">
              {metadata.provider ?? "Not recorded"}
            </dd>
          </div>
          <div className="bg-card px-4 py-3">
            <dt className="text-sm text-muted-foreground">Analyzer</dt>
            <dd className="mt-1 text-sm text-foreground">
              {metadata.analyzerVersion}
            </dd>
          </div>
          <div className="bg-card px-4 py-3">
            <dt className="text-sm text-muted-foreground">Token usage</dt>
            <dd className="mt-1 text-sm text-foreground">
              {metadata.tokensInput} input · {metadata.tokensOutput} output
            </dd>
          </div>
          <div className="bg-card px-4 py-3">
            <dt className="text-sm text-muted-foreground">Cost</dt>
            <dd className="mt-1 text-sm text-foreground">
              {metadata.costMicros} µUSD
            </dd>
          </div>
          <div className="bg-card px-4 py-3">
            <dt className="text-sm text-muted-foreground">Watermark</dt>
            <dd className="mt-1 text-sm text-foreground">
              Analyzed through message {metadata.analyzedThroughSequence}
            </dd>
          </div>
          <div className="bg-card px-4 py-3">
            <dt className="text-sm text-muted-foreground">Analyzed at</dt>
            <dd className="mt-1 text-sm text-foreground">
              {new Date(metadata.createdAt).toLocaleString()}
            </dd>
          </div>
        </dl>
      </Card>
      <section>
        <h2 className="px-1 text-base font-medium text-foreground">Findings</h2>
        {analysis.findings.length === 0 ? (
          <Card
            render={<p />}
            className="mt-2 gap-0 px-4 py-6 text-base text-muted-foreground"
          >
            No notable behavior findings
          </Card>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {analysis.findings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                evidence={analysis.conversation.messages.find(
                  (message) => message.id === finding.evidenceMessageId
                )}
              />
            ))}
          </ul>
        )}
      </section>
      <ConversationTranscript messages={analysis.conversation.messages} />
    </div>
  )
}
