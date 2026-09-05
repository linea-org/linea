import {
  integer,
  jsonb,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { workflowVersions } from "./workflow.js"

export const evaluatorMetricSteps = snakeCase.table(
  "evaluator_metric_steps",
  {
    id: uuid().defaultRandom().primaryKey(),
    workflowVersionId: uuid()
      .notNull()
      .references(() => workflowVersions.id, { onDelete: "cascade" }),
    nodeId: text().notNull(),
    metricId: text().notNull(),
    metricRevision: integer().notNull(),
    steps: jsonb().$type<string[]>().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("evaluator_metric_steps_version_node_metric_revision_uidx").on(
      table.workflowVersionId,
      table.nodeId,
      table.metricId,
      table.metricRevision
    ),
  ]
)
