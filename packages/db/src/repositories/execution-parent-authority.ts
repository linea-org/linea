import { sql } from "drizzle-orm"
import { executions } from "../schema/index.js"

export function activeExecutionParent() {
  return sql`(${executions.parentExecutionId} is null or exists (
    select 1 from executions parent_execution
    where parent_execution.id = ${executions.parentExecutionId}
      and parent_execution.status in ('queued', 'running', 'paused')
  ))`
}
