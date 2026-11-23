import { sql } from "drizzle-orm"
import { actionIntents, executions } from "../schema/index.js"

export function activeExecutionParent() {
  return sql`(${executions.parentExecutionId} is null or exists (
    select 1 from executions parent_execution
    where parent_execution.id = ${executions.parentExecutionId}
      and parent_execution.status in ('queued', 'running', 'paused')
  ))`
}

/** A claimed Action Intent must report its outcome even after its Execution's parent ends (ADR 0021). */
export function hasExecutingActionIntent() {
  return sql`exists (
    select 1 from ${actionIntents}
    where ${actionIntents.executionId} = ${executions.id}
      and ${actionIntents.status} = 'executing'
  )`
}
