import { sql } from "drizzle-orm"
import {
  conversationAnalyses,
  conversationFindings,
  type ConversationAnalysis,
  type NewConversationAnalysis,
  type NewConversationFinding,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

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

export type NewFindingInput = Omit<NewConversationFinding, "analysisId">

export async function insertConversationFindings(
  db: DbClient,
  analysisId: string,
  findings: NewFindingInput[]
): Promise<void> {
  if (findings.length === 0) return
  await db
    .insert(conversationFindings)
    .values(findings.map((finding) => ({ ...finding, analysisId })))
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
 * exists — is correctly excluded, matching that table's "missing row reads as off" convention). */
export async function findConversationsDueForAnalysis(
  db: DbClient,
  idleBefore: Date,
  limit = 20
): Promise<ConversationDueForAnalysis[]> {
  const result = await db.execute<{
    workspace_id: string
    workflow_id: string
    conversation_id: string
    max_sequence: number
    external_subject_id: string | null
    behaviour_sample_rate: number
    behaviour_model: string | null
  }>(sql`
    WITH conversation_stats AS (
      SELECT
        workspace_id, workflow_id, conversation_id,
        max(sequence)::int AS max_sequence,
        max(created_at) AS last_message_at,
        (array_agg(external_subject_id) FILTER (WHERE external_subject_id IS NOT NULL))[1]
          AS external_subject_id
      FROM chat_messages
      GROUP BY workspace_id, workflow_id, conversation_id
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
    WHERE cs.last_message_at < ${idleBefore}
      AND cs.max_sequence > coalesce(la.analyzed_through_sequence, 0)
    LIMIT ${limit}
  `)

  return result.rows.map((row) => ({
    workspaceId: row.workspace_id,
    workflowId: row.workflow_id,
    conversationId: row.conversation_id,
    maxSequence: row.max_sequence,
    externalSubjectId: row.external_subject_id,
    behaviourSampleRate: row.behaviour_sample_rate,
    behaviourModel: row.behaviour_model,
  }))
}
