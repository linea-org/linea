import { sql, type SQL } from "drizzle-orm"
import { agents, executions, workflows } from "../schema/index.js"

export type WorkspaceExecutionSort = {
  column: "workflow" | "status" | "trigger" | "duration" | "cost" | "when"
  direction: "asc" | "desc"
}

/** A page's last sort key and id (the tie-break), and when the first page was served. */
export type WorkspaceExecutionCursor = {
  value: string
  id: string
  asOf?: Date
}

type SortKey = {
  /** Never null: a null key would drop its row from the keyset comparison. */
  expression: SQL
  cursorValue: SQL<string>
  fromCursorValue: (value: string) => SQL
}

function textKey(expression: SQL): SortKey {
  return {
    expression,
    cursorValue: sql<string>`${expression}`,
    fromCursorValue: (value) => sql`${value}::text`,
  }
}

function bigintKey(expression: SQL): SortKey {
  return {
    expression,
    cursorValue: sql<string>`(${expression})::text`,
    fromCursorValue: (value) => sql`${value}::bigint`,
  }
}

// Unstarted runs sort below every duration and unfinished ones above, so each has a stable key.
const durationMs = sql`case
  when ${executions.startedAt} is null then -1
  when ${executions.completedAt} is null then 9223372036854775807
  else (extract(epoch from ${executions.completedAt} - ${executions.startedAt}) * 1000)::bigint
end`

const sortKeys: Record<WorkspaceExecutionSort["column"], SortKey> = {
  workflow: textKey(
    sql`lower(coalesce(${workflows.name}, ${agents.name}, ''))`
  ),
  status: textKey(sql`${executions.status}::text`),
  trigger: textKey(sql`${executions.trigger}::text`),
  duration: bigintKey(durationMs),
  cost: bigintKey(sql`${executions.costMicros}`),
  when: {
    expression: sql`${executions.createdAt}`,
    cursorValue: sql<string>`to_char(${executions.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    fromCursorValue: (value) => sql`${value}::timestamptz`,
  },
}

/** One sort's ORDER BY, cursor value and "rows after the cursor" predicate, which must agree. */
export function workspaceExecutionSortQuery(sort: WorkspaceExecutionSort) {
  const key = sortKeys[sort.column]
  const [order, after] =
    sort.direction === "asc" ? [sql`asc`, sql`>`] : [sql`desc`, sql`<`]
  return {
    orderBy: [sql`${key.expression} ${order}`, sql`${executions.id} ${order}`],
    cursorValue: key.cursorValue,
    after: (cursor: WorkspaceExecutionCursor) =>
      sql`(${key.expression}, ${executions.id}) ${after} (${key.fromCursorValue(cursor.value)}, ${cursor.id}::uuid)`,
  }
}
