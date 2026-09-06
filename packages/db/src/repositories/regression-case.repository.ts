import { and, desc, eq, isNull } from "drizzle-orm"
import {
  regressionCases,
  type RegressionCase,
  type NewRegressionCase,
} from "../schema/index.js"
import {
  getConversationAnalysisById,
  getConversationFindingById,
} from "./conversation-analysis.repository.js"
import { listChatMessages } from "./chat-message.repository.js"
import { getExecutionById } from "./execution.repository.js"
import { getExecutionStepById } from "./execution-step.repository.js"
import { getFlagById } from "./flag.repository.js"
import type { DbClient } from "./types.js"

export async function createRegressionCase(
  db: DbClient,
  input: NewRegressionCase
): Promise<RegressionCase> {
  const [regressionCase] = await db
    .insert(regressionCases)
    .values(input)
    .returning()
  return regressionCase
}

export async function getRegressionCaseById(
  db: DbClient,
  workspaceId: string,
  regressionCaseId: string
): Promise<RegressionCase | undefined> {
  const [regressionCase] = await db
    .select()
    .from(regressionCases)
    .where(
      and(
        eq(regressionCases.id, regressionCaseId),
        eq(regressionCases.workspaceId, workspaceId)
      )
    )
  return regressionCase
}

export async function listRegressionCases(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  options: { includeArchived?: boolean } = {}
): Promise<RegressionCase[]> {
  return db
    .select()
    .from(regressionCases)
    .where(
      and(
        eq(regressionCases.workspaceId, workspaceId),
        eq(regressionCases.workflowId, workflowId),
        options.includeArchived ? undefined : isNull(regressionCases.archivedAt)
      )
    )
    .orderBy(desc(regressionCases.createdAt))
}

export async function archiveRegressionCase(
  db: DbClient,
  workspaceId: string,
  regressionCaseId: string
): Promise<RegressionCase | undefined> {
  const [regressionCase] = await db
    .update(regressionCases)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(regressionCases.id, regressionCaseId),
        eq(regressionCases.workspaceId, workspaceId)
      )
    )
    .returning()
  return regressionCase
}

type RegressionAssertion = { type: string; config: Record<string, unknown> }

export type CreateRegressionCaseFromStepInput = {
  workspaceId: string
  stepId: string
  sourceSignalId?: string
  assertions?: RegressionAssertion[]
}

/** Rejects cross-workspace steps before copying their input into the caller's regression suite. */
export async function createRegressionCaseFromStep(
  db: DbClient,
  input: CreateRegressionCaseFromStepInput
): Promise<RegressionCase | undefined> {
  const step = await getExecutionStepById(db, input.stepId)
  if (!step || step.workspaceId !== input.workspaceId) return undefined
  const execution = await getExecutionById(db, step.executionId)
  if (!execution || execution.workspaceId !== input.workspaceId) {
    return undefined
  }

  return createRegressionCase(db, {
    workspaceId: step.workspaceId,
    workflowId: execution.workflowId,
    caseType: "node",
    nodeId: step.nodeId,
    input: { nodeInput: step.input ?? {} },
    assertions: input.assertions ?? [],
    sourceStepId: step.id,
    sourceSignalId: input.sourceSignalId,
  })
}

type ConversationSnapshotSource = {
  workspaceId: string
  workflowId: string
  conversationId: string
  evidenceMessageId?: string
  category: string
  rationale?: string
  externalSubjectId?: string
}

type ConversationSnapshotProvenance = {
  sourceFindingId?: string
  sourceSignalId?: string
}

// Snapshot through the triggering user turn so cross-turn failures remain reproducible.
async function buildConversationRegressionCase(
  db: DbClient,
  source: ConversationSnapshotSource,
  provenance: ConversationSnapshotProvenance,
  assertionsOverride?: RegressionAssertion[]
): Promise<RegressionCase | undefined> {
  const messages = await listChatMessages(
    db,
    source.workspaceId,
    source.workflowId,
    source.conversationId
  )
  if (messages.length === 0) return undefined

  const evidence = source.evidenceMessageId
    ? messages.find((m) => m.id === source.evidenceMessageId)
    : undefined
  const boundary =
    (evidence?.role === "user"
      ? evidence
      : messages.find((m) => m.id === evidence?.respondsToMessageId)) ??
    [...messages].reverse().find((m) => m.role === "user")
  if (!boundary) return undefined

  const boundaryIndex = messages.findIndex((m) => m.id === boundary.id)
  const turnsBefore = messages.slice(0, boundaryIndex)

  const assertions =
    assertionsOverride ??
    (source.rationale
      ? [
          {
            type: "llm_judge",
            config: {
              rubric: `Check whether the replayed conversation still exhibits "${source.category}": ${source.rationale}`,
            },
          },
        ]
      : [])

  return createRegressionCase(db, {
    workspaceId: source.workspaceId,
    workflowId: source.workflowId,
    caseType: "conversation",
    input: {
      turns: turnsBefore.map((m) => ({ role: m.role, content: m.content })),
      finalPrompt: boundary.content,
      // A frozen replay has no trigger payload from which to resolve the memory subject.
      externalSubjectId: source.externalSubjectId,
    },
    assertions,
    ...provenance,
  })
}

export type CreateRegressionCaseFromFindingInput = {
  workspaceId: string
  findingId: string
  assertions?: RegressionAssertion[]
}

/** Rejects cross-workspace findings before copying their conversation snapshot. */
export async function createRegressionCaseFromFinding(
  db: DbClient,
  input: CreateRegressionCaseFromFindingInput
): Promise<RegressionCase | undefined> {
  const finding = await getConversationFindingById(db, input.findingId)
  if (!finding || finding.workspaceId !== input.workspaceId) return undefined
  const analysis = await getConversationAnalysisById(db, finding.analysisId)
  if (!analysis || analysis.workspaceId !== input.workspaceId) {
    return undefined
  }

  return buildConversationRegressionCase(
    db,
    {
      workspaceId: analysis.workspaceId,
      workflowId: analysis.workflowId,
      conversationId: analysis.conversationId,
      evidenceMessageId: finding.evidenceMessageId ?? undefined,
      category: finding.category,
      rationale: finding.rationale ?? undefined,
      externalSubjectId: analysis.externalSubjectId ?? undefined,
    },
    { sourceFindingId: finding.id },
    input.assertions
  )
}

export type CreateRegressionCaseFromFlagInput = {
  workspaceId: string
  flagId: string
  assertions?: RegressionAssertion[]
}

/** Returns undefined when a flag has no conversation snapshot to preserve. */
export async function createRegressionCaseFromFlag(
  db: DbClient,
  input: CreateRegressionCaseFromFlagInput
): Promise<RegressionCase | undefined> {
  const flag = await getFlagById(db, input.workspaceId, input.flagId)
  if (!flag || !flag.workflowId) return undefined

  const detail = flag.detail as {
    conversationId?: string
    category?: string
    rationale?: string
    evidenceMessageId?: string
  } | null
  if (!detail?.conversationId || !detail.category) return undefined

  return buildConversationRegressionCase(
    db,
    {
      workspaceId: flag.workspaceId,
      workflowId: flag.workflowId,
      conversationId: detail.conversationId,
      evidenceMessageId: detail.evidenceMessageId,
      category: detail.category,
      rationale: detail.rationale,
      externalSubjectId: flag.externalSubjectId ?? undefined,
    },
    { sourceSignalId: flag.signalId ?? undefined },
    input.assertions
  )
}
