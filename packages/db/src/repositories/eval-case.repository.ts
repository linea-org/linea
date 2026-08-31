import { and, desc, eq, isNull } from "drizzle-orm"
import { evalCases, type EvalCase, type NewEvalCase } from "../schema/index.js"
import {
  getConversationAnalysisById,
  getConversationFindingById,
} from "./conversation-analysis.repository.js"
import { listChatMessages } from "./chat-message.repository.js"
import { getExecutionById } from "./execution.repository.js"
import { getExecutionStepById } from "./execution-step.repository.js"
import { getFlagById } from "./flag.repository.js"
import type { DbClient } from "./types.js"

export async function createEvalCase(
  db: DbClient,
  input: NewEvalCase
): Promise<EvalCase> {
  const [evalCase] = await db.insert(evalCases).values(input).returning()
  return evalCase
}

export async function getEvalCaseById(
  db: DbClient,
  workspaceId: string,
  evalCaseId: string
): Promise<EvalCase | undefined> {
  const [evalCase] = await db
    .select()
    .from(evalCases)
    .where(
      and(eq(evalCases.id, evalCaseId), eq(evalCases.workspaceId, workspaceId))
    )
  return evalCase
}

export async function listEvalCases(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  options: { includeArchived?: boolean } = {}
): Promise<EvalCase[]> {
  return db
    .select()
    .from(evalCases)
    .where(
      and(
        eq(evalCases.workspaceId, workspaceId),
        eq(evalCases.workflowId, workflowId),
        options.includeArchived ? undefined : isNull(evalCases.archivedAt)
      )
    )
    .orderBy(desc(evalCases.createdAt))
}

export async function archiveEvalCase(
  db: DbClient,
  workspaceId: string,
  evalCaseId: string
): Promise<EvalCase | undefined> {
  const [evalCase] = await db
    .update(evalCases)
    .set({ archivedAt: new Date() })
    .where(
      and(eq(evalCases.id, evalCaseId), eq(evalCases.workspaceId, workspaceId))
    )
    .returning()
  return evalCase
}

type EvalAssertion = { type: string; config: Record<string, unknown> }

export type CreateEvalCaseFromStepInput = {
  workspaceId: string
  stepId: string
  sourceSignalId?: string
  assertions?: EvalAssertion[]
}

/** A node-level case: snapshots one step's own input, so it keeps working after the step itself is retention-deleted. sourceSignalId is optional provenance alongside sourceStepId — a signal groups many occurrences, this case is built from one concrete instance of it.
 *
 * workspaceId is required and checked against both the step and its execution — getExecutionStepById/getExecutionById aren't workspace-scoped by param, so without this check a caller could snapshot another workspace's step input into a case visible in their own. */
export async function createEvalCaseFromStep(
  db: DbClient,
  input: CreateEvalCaseFromStepInput
): Promise<EvalCase | undefined> {
  const step = await getExecutionStepById(db, input.stepId)
  if (!step || step.workspaceId !== input.workspaceId) return undefined
  const execution = await getExecutionById(db, step.executionId)
  if (!execution || execution.workspaceId !== input.workspaceId) {
    return undefined
  }

  return createEvalCase(db, {
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

/** Shared by createEvalCaseFromFinding and createEvalCaseFromFlag — both ultimately have the
 * same raw ingredients (a conversation, an evidence turn, a category/rationale), just sourced
 * from different tables. Snapshots every turn up to and including whichever user turn actually
 * triggered the problematic behaviour, so replaying it reproduces the exact lead-up — not just
 * the evidence turn in isolation. If the evidence is an assistant turn, walks back via
 * respondsToMessageId to the user turn that produced it; falls back to the conversation's last
 * user turn when there's no usable evidence pointer. Defaults the assertion to an llm_judge
 * built from the source's own rationale, so the case starts out testing the thing that was
 * actually observed rather than an empty shell. */
async function buildConversationEvalCase(
  db: DbClient,
  source: ConversationSnapshotSource,
  provenance: ConversationSnapshotProvenance,
  assertionsOverride?: EvalAssertion[]
): Promise<EvalCase | undefined> {
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

  return createEvalCase(db, {
    workspaceId: source.workspaceId,
    workflowId: source.workflowId,
    caseType: "conversation",
    input: {
      turns: turnsBefore.map((m) => ({ role: m.role, content: m.content })),
      finalPrompt: boundary.content,
      // Carried through so replaying this case can still exercise memory recall for an agent
      // configured with memorySubjectPath — there's no live triggerPayload for it to resolve
      // against otherwise, only this frozen snapshot. Undefined when the source conversation
      // never had one (e.g. a workspace member's own test chat), same as the original.
      externalSubjectId: source.externalSubjectId,
    },
    assertions,
    ...provenance,
  })
}

export type CreateEvalCaseFromFindingInput = {
  workspaceId: string
  findingId: string
  assertions?: EvalAssertion[]
}

/** workspaceId is required and checked against both the finding and its analysis — without it, a
 * caller could copy another workspace's conversation transcript into their own eval case. */
export async function createEvalCaseFromFinding(
  db: DbClient,
  input: CreateEvalCaseFromFindingInput
): Promise<EvalCase | undefined> {
  const finding = await getConversationFindingById(db, input.findingId)
  if (!finding || finding.workspaceId !== input.workspaceId) return undefined
  const analysis = await getConversationAnalysisById(db, finding.analysisId)
  if (!analysis || analysis.workspaceId !== input.workspaceId) {
    return undefined
  }

  return buildConversationEvalCase(
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

export type CreateEvalCaseFromFlagInput = {
  workspaceId: string
  flagId: string
  assertions?: EvalAssertion[]
}

/** A flag's own `detail` JSON (set by the behaviour-to-flag bridge in apps/background-worker)
 * already carries everything buildConversationEvalCase needs — conversationId, category,
 * rationale, evidenceMessageId — so this reaches the same shared snapshot logic without a
 * conversation_findings lookup. A flag type with no behavioural detail at all (e.g. retry_storm)
 * has no conversationId/category to find, which just means "can't become a conversation-type
 * case", not an error — returns undefined the same as a missing flag. */
export async function createEvalCaseFromFlag(
  db: DbClient,
  input: CreateEvalCaseFromFlagInput
): Promise<EvalCase | undefined> {
  const flag = await getFlagById(db, input.workspaceId, input.flagId)
  if (!flag || !flag.workflowId) return undefined

  const detail = flag.detail as
    | {
        conversationId?: string
        category?: string
        rationale?: string
        evidenceMessageId?: string
      }
    | null
  if (!detail?.conversationId || !detail.category) return undefined

  return buildConversationEvalCase(
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
