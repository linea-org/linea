import { and, desc, eq, sql } from "drizzle-orm"
import {
  conversationAnalyses,
  conversationAnalysisClaims,
  conversationFindings,
  type ConversationAnalysis,
  type ConversationAnalysisClaim,
  type ConversationFinding,
  type NewConversationAnalysis,
  type NewConversationFinding,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

// Shared between the claim function and the due-query's own exclusion/ordering — both must agree
// on what "still actively claimed" means, or a claim could expire from one's perspective but not
// the other's. Exported so the analyzer can bound its own provider call comfortably under this —
// a call that's still legitimately running should never be able to outlive its own claim's lease.
export const DEFAULT_CLAIM_LEASE_MS = 5 * 60_000

export type ClaimConversationForAnalysisResult =
  | { outcome: "claimed"; attemptCount: number; claimedAt: Date }
  | { outcome: "already-claimed" }

/** Atomically claims a conversation for analysis — succeeds only if it's never been claimed
 * before, or its previous claim has gone stale (older than leaseMs: either a worker that crashed
 * mid-analysis, or simply due for its next retry). Must be called immediately before the
 * (billable) LLM call, so the window a stuck claim can block a real retry stays as short as
 * possible. Does not need an explicit release on success — the conversation stops being "due" at
 * all once analysis completes, so its claim row is simply never looked at again until it's due
 * once more, at which point a fresh claim naturally supersedes it. */
export async function claimConversationForAnalysis(
  db: DbClient,
  input: { workspaceId: string; workflowId: string; conversationId: string },
  leaseMs = DEFAULT_CLAIM_LEASE_MS
): Promise<ClaimConversationForAnalysisResult> {
  const [row] = await db
    .insert(conversationAnalysisClaims)
    .values({
      workspaceId: input.workspaceId,
      workflowId: input.workflowId,
      conversationId: input.conversationId,
      claimedAt: new Date(),
      attemptCount: 1,
    })
    .onConflictDoUpdate({
      target: [
        conversationAnalysisClaims.workspaceId,
        conversationAnalysisClaims.workflowId,
        conversationAnalysisClaims.conversationId,
      ],
      set: {
        claimedAt: new Date(),
        attemptCount: sql`${conversationAnalysisClaims.attemptCount} + 1`,
      },
      // Only actually claimable if the existing claim has gone stale — otherwise this row is
      // left untouched and .returning() reports no row, meaning "someone else already has this."
      // clock_timestamp(), not now() — now() is frozen to transaction-start for the whole
      // enclosing transaction, which would never register a lease as expired within one.
      setWhere: sql`${conversationAnalysisClaims.claimedAt} < clock_timestamp() - (${leaseMs}::text || ' milliseconds')::interval`,
    })
    .returning({
      attemptCount: conversationAnalysisClaims.attemptCount,
      claimedAt: conversationAnalysisClaims.claimedAt,
    })

  return row
    ? {
        outcome: "claimed",
        attemptCount: row.attemptCount,
        claimedAt: row.claimedAt,
      }
    : { outcome: "already-claimed" }
}

/** Reaffirms ownership using the monotonic attempt number as the fencing token. */
export async function renewClaimIfOwned(
  db: DbClient,
  input: { workspaceId: string; workflowId: string; conversationId: string },
  expectedAttemptCount: number
): Promise<boolean> {
  const [row] = await db
    .update(conversationAnalysisClaims)
    .set({ claimedAt: new Date() })
    .where(
      and(
        eq(conversationAnalysisClaims.workspaceId, input.workspaceId),
        eq(conversationAnalysisClaims.workflowId, input.workflowId),
        eq(conversationAnalysisClaims.conversationId, input.conversationId),
        eq(conversationAnalysisClaims.attemptCount, expectedAttemptCount)
      )
    )
    .returning({ id: conversationAnalysisClaims.id })
  return row !== undefined
}

export async function createConversationAnalysis(
  db: DbClient,
  input: NewConversationAnalysis
): Promise<ConversationAnalysis> {
  const [analysis] = await db
    .insert(conversationAnalyses)
    .values(input)
    .returning()
  return analysis
}

export async function getConversationAnalysisById(
  db: DbClient,
  analysisId: string
): Promise<ConversationAnalysis | undefined> {
  const [analysis] = await db
    .select()
    .from(conversationAnalyses)
    .where(eq(conversationAnalyses.id, analysisId))
  return analysis
}

export async function getConversationFindingById(
  db: DbClient,
  findingId: string
): Promise<ConversationFinding | undefined> {
  const [finding] = await db
    .select()
    .from(conversationFindings)
    .where(eq(conversationFindings.id, findingId))
  return finding
}

export async function getLatestConversationAnalysis(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  conversationId: string
): Promise<ConversationAnalysis | undefined> {
  const [analysis] = await db
    .select()
    .from(conversationAnalyses)
    .where(
      and(
        eq(conversationAnalyses.workspaceId, workspaceId),
        eq(conversationAnalyses.workflowId, workflowId),
        eq(conversationAnalyses.conversationId, conversationId)
      )
    )
    .orderBy(
      desc(conversationAnalyses.createdAt),
      desc(conversationAnalyses.analyzedThroughSequence)
    )
    .limit(1)
  return analysis
}

export async function getConversationAnalysisForFinding(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  conversationId: string,
  findingId: string
): Promise<ConversationAnalysis | undefined> {
  const [row] = await db
    .select({ analysis: conversationAnalyses })
    .from(conversationFindings)
    .innerJoin(
      conversationAnalyses,
      eq(conversationFindings.analysisId, conversationAnalyses.id)
    )
    .where(
      and(
        eq(conversationFindings.id, findingId),
        eq(conversationFindings.workspaceId, workspaceId),
        eq(conversationAnalyses.workspaceId, workspaceId),
        eq(conversationAnalyses.workflowId, workflowId),
        eq(conversationAnalyses.conversationId, conversationId)
      )
    )
  return row?.analysis
}

export async function getConversationAnalysisClaim(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  conversationId: string
): Promise<ConversationAnalysisClaim | undefined> {
  const [claim] = await db
    .select()
    .from(conversationAnalysisClaims)
    .where(
      and(
        eq(conversationAnalysisClaims.workspaceId, workspaceId),
        eq(conversationAnalysisClaims.workflowId, workflowId),
        eq(conversationAnalysisClaims.conversationId, conversationId)
      )
    )
  return claim
}

export async function listConversationFindings(
  db: DbClient,
  workspaceId: string,
  analysisId: string
): Promise<ConversationFinding[]> {
  return db
    .select()
    .from(conversationFindings)
    .where(
      and(
        eq(conversationFindings.workspaceId, workspaceId),
        eq(conversationFindings.analysisId, analysisId)
      )
    )
    .orderBy(conversationFindings.createdAt)
}

export type NewFindingInput = Omit<NewConversationFinding, "analysisId">

export async function insertConversationFindings(
  db: DbClient,
  analysisId: string,
  findings: NewFindingInput[]
): Promise<ConversationFinding[]> {
  if (findings.length === 0) return []
  return db
    .insert(conversationFindings)
    .values(findings.map((finding) => ({ ...finding, analysisId })))
    .returning()
}

export type ConversationDueForAnalysis = {
  workspaceId: string
  workflowId: string
  conversationId: string
  maxSequence: number
  externalSubjectId: string | null
  behaviourSampleRate: number
  behaviourModel: string | null
}

/** Conversations whose newest message is older than `idleBefore` (so a still-active back-and-forth
 * is never analyzed mid-flight) and whose watermark is behind their latest turn — either never
 * analyzed, or grown since the last run. Scoped to workspaces that have opted in via
 * workspace_settings (an inner join, so a workspace that never touched settings — meaning no row
 * exists — is correctly excluded, matching that table's "missing row reads as off" convention).
 *
 * Excludes a conversation with an active claim (see claimConversationForAnalysis) — another
 * worker has it in flight, or it failed recently and is backing off. Orders by claimed_at
 * ascending, nulls first: a never-claimed conversation goes first, and among claimed ones the
 * longest-untouched goes first — so a conversation that keeps failing and getting reclaimed sinks
 * toward the back of the LIMIT window instead of permanently occupying the front of it. */
export async function findConversationsDueForAnalysis(
  db: DbClient,
  idleBefore: Date,
  limit = 20,
  claimLeaseMs = DEFAULT_CLAIM_LEASE_MS
): Promise<ConversationDueForAnalysis[]> {
  const result = await db.execute<{
    workspace_id: string
    workflow_id: string
    conversation_id: string
    // node-postgres returns a bigint SQL result as a string (no global type-parser override in
    // this codebase), to avoid silently losing precision past 2^53 — parsed explicitly below,
    // not cast down to ::int here, which would overflow this global sequence around 2.1 billion.
    max_sequence: string
    external_subject_id: string | null
    behaviour_sample_rate: number
    behaviour_model: string | null
  }>(sql`
    WITH conversation_stats AS (
      SELECT
        cm.workspace_id, c.workflow_id, cm.conversation_id,
        max(cm.sequence) AS max_sequence,
        max(cm.created_at) AS last_message_at,
        c.external_subject_id::text AS external_subject_id
      FROM chat_messages cm
      JOIN conversations c
        ON c.id = cm.conversation_id AND c.workspace_id = cm.workspace_id
      GROUP BY cm.workspace_id, c.workflow_id, cm.conversation_id, c.external_subject_id
    ),
    latest_analysis AS (
      -- Tied created_at (same-millisecond concurrent runs) falls through to the highest
      -- analyzed_through_sequence — the invariant that actually matters is never regressing the
      -- watermark, not just picking a tied row deterministically.
      SELECT DISTINCT ON (workspace_id, workflow_id, conversation_id)
        workspace_id, workflow_id, conversation_id, analyzed_through_sequence
      FROM conversation_analyses
      ORDER BY workspace_id, workflow_id, conversation_id, created_at DESC, analyzed_through_sequence DESC
    )
    SELECT
      cs.workspace_id, cs.workflow_id, cs.conversation_id, cs.max_sequence, cs.external_subject_id,
      ws.behaviour_sample_rate, ws.behaviour_model
    FROM conversation_stats cs
    JOIN workspace_settings ws
      ON ws.workspace_id = cs.workspace_id AND ws.behaviour_analysis_enabled = true
    LEFT JOIN latest_analysis la
      ON la.workspace_id = cs.workspace_id AND la.workflow_id = cs.workflow_id
      AND la.conversation_id = cs.conversation_id
    LEFT JOIN conversation_analysis_claims cac
      ON cac.workspace_id = cs.workspace_id AND cac.workflow_id = cs.workflow_id
      AND cac.conversation_id = cs.conversation_id
    WHERE cs.last_message_at < ${idleBefore}
      AND cs.max_sequence > coalesce(la.analyzed_through_sequence, 0)
      AND (
        cac.claimed_at IS NULL
        OR cac.claimed_at < clock_timestamp() - (${claimLeaseMs}::text || ' milliseconds')::interval
      )
    ORDER BY cac.claimed_at ASC NULLS FIRST
    LIMIT ${limit}
  `)

  return result.rows.map((row) => ({
    workspaceId: row.workspace_id,
    workflowId: row.workflow_id,
    conversationId: row.conversation_id,
    // Safe up to Number.MAX_SAFE_INTEGER (2^53-1) — the same ceiling chat_messages.sequence's own
    // bigint({ mode: "number" }) column already relies on elsewhere in this codebase.
    maxSequence: Number(row.max_sequence),
    externalSubjectId: row.external_subject_id,
    behaviourSampleRate: row.behaviour_sample_rate,
    behaviourModel: row.behaviour_model,
  }))
}
