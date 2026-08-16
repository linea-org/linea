import { and, desc, eq, sql } from "drizzle-orm"
import {
  executions,
  flags,
  signals,
  type Flag,
  type Signal,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export type SignalStatus = "open" | "resolved" | "regressed"

export function deriveSignalStatus(signal: Signal): SignalStatus {
  if (signal.resolvedAt) return "resolved"
  if (signal.regressedAt) return "regressed"
  return "open"
}

async function resolveWorkflowId(
  db: DbClient,
  flag: Flag
): Promise<string | undefined> {
  if (flag.workflowId) return flag.workflowId
  if (!flag.executionId) return undefined
  const [execution] = await db
    .select({ workflowId: executions.workflowId })
    .from(executions)
    .where(eq(executions.id, flag.executionId))
  return execution?.workflowId
}

export type SignalOccurrenceResult = { signal: Signal; justRegressed: boolean }

/** Groups a newly created flag into its signal — the same pattern (flag type + workflow + node) recurring across different executions — creating one on first occurrence, and reopening it as "regressed" if it lands on a signal previously marked resolved. `justRegressed` reflects only this call's own transition (read before the write, so it never re-fires for a signal that was already sitting regressed). */
export async function recordSignalOccurrence(
  db: DbClient,
  flag: Flag
): Promise<SignalOccurrenceResult> {
  const workflowId = await resolveWorkflowId(db, flag)
  const signalKey = `${flag.flagType}:${workflowId ?? "none"}:${flag.nodeId ?? "none"}`

  // Locked so two concurrent occurrences on the same signalKey serialize instead of both firing a regression notification.
  const [existing] = await db
    .select({ resolvedAt: signals.resolvedAt })
    .from(signals)
    .where(eq(signals.signalKey, signalKey))
    .for("update")

  const [signal] = await db
    .insert(signals)
    .values({
      workspaceId: flag.workspaceId,
      workflowId,
      nodeId: flag.nodeId,
      flagType: flag.flagType,
      signalKey,
    })
    .onConflictDoUpdate({
      target: signals.signalKey,
      set: {
        // Unqualified column refs in an ON CONFLICT SET read the existing (pre-update) row, so this only fires when the signal was actually resolved at the time this occurrence landed.
        regressedAt: sql`case when ${signals.resolvedAt} is not null then ${flag.createdAt} else ${signals.regressedAt} end`,
        resolvedAt: sql`case when ${signals.resolvedAt} is not null then null else ${signals.resolvedAt} end`,
      },
    })
    .returning()

  await db
    .update(flags)
    .set({ signalId: signal.id })
    .where(eq(flags.id, flag.id))

  return { signal, justRegressed: existing?.resolvedAt != null }
}

export type SignalSummary = Signal & {
  status: SignalStatus
  occurrenceCount: number
  firstFlaggedAt: Date
  lastFlaggedAt: Date
}

export async function listSignals(
  db: DbClient,
  workspaceId: string,
  options: { workflowId?: string } = {}
): Promise<SignalSummary[]> {
  const rows = await db
    .select({
      signal: signals,
      occurrenceCount: sql<number>`count(${flags.id})::int`,
      firstFlaggedAt: sql<Date>`min(${flags.createdAt})`,
      lastFlaggedAt: sql<Date>`max(${flags.createdAt})`,
    })
    .from(signals)
    .innerJoin(flags, eq(flags.signalId, signals.id))
    .where(
      and(
        eq(signals.workspaceId, workspaceId),
        options.workflowId
          ? eq(signals.workflowId, options.workflowId)
          : undefined
      )
    )
    .groupBy(signals.id)
    .orderBy(desc(sql`max(${flags.createdAt})`))

  return rows.map((r) => ({
    ...r.signal,
    status: deriveSignalStatus(r.signal),
    occurrenceCount: r.occurrenceCount,
    firstFlaggedAt: r.firstFlaggedAt,
    lastFlaggedAt: r.lastFlaggedAt,
  }))
}

export type SignalTrendPoint = { day: string; count: number }

export type SignalDetail = SignalSummary & {
  flags: Flag[]
  trend: SignalTrendPoint[]
}

export async function getSignalDetail(
  db: DbClient,
  workspaceId: string,
  signalId: string
): Promise<SignalDetail | undefined> {
  const [signal] = await db
    .select()
    .from(signals)
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspaceId)))
  if (!signal) return undefined

  const linkedFlags = await db
    .select()
    .from(flags)
    .where(eq(flags.signalId, signalId))
    .orderBy(desc(flags.createdAt))

  const trend = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${flags.createdAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(flags)
    .where(eq(flags.signalId, signalId))
    .groupBy(sql`date_trunc('day', ${flags.createdAt})`)
    .orderBy(sql`date_trunc('day', ${flags.createdAt})`)

  return {
    ...signal,
    status: deriveSignalStatus(signal),
    // A signal always has at least one linked flag — the one that created it via recordSignalOccurrence.
    occurrenceCount: linkedFlags.length,
    firstFlaggedAt: linkedFlags[linkedFlags.length - 1].createdAt,
    lastFlaggedAt: linkedFlags[0].createdAt,
    flags: linkedFlags,
    trend,
  }
}

export async function resolveSignal(
  db: DbClient,
  workspaceId: string,
  signalId: string
): Promise<Signal | undefined> {
  const [signal] = await db
    .update(signals)
    .set({ resolvedAt: new Date(), regressedAt: null })
    .where(and(eq(signals.id, signalId), eq(signals.workspaceId, workspaceId)))
    .returning()
  return signal
}
