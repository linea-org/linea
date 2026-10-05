import { and, eq, isNull, sql } from "drizzle-orm"
import {
  actionIntents,
  approvalRequests,
  connections,
  connectionAccessGrants,
  connectionReviewerAssignments,
  externalSubjects,
  externalSubjectEnvironments,
  type ApprovalRequest,
  type Connection,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function getConnectionRequesterAuthority(
  db: DbClient,
  connection: Connection,
  externalSubjectId: string
): Promise<{ grantId: string | null } | undefined> {
  if (connection.ownership === "personal")
    return connection.externalSubjectId === externalSubjectId
      ? { grantId: null }
      : undefined
  const [grant] = await db
    .select({ grantId: connectionAccessGrants.id })
    .from(connectionAccessGrants)
    .where(
      and(
        eq(connectionAccessGrants.connectionId, connection.id),
        eq(connectionAccessGrants.environmentId, connection.environmentId),
        eq(connectionAccessGrants.workspaceId, connection.workspaceId),
        eq(connectionAccessGrants.externalSubjectId, externalSubjectId),
        isNull(connectionAccessGrants.revokedAt)
      )
    )
  return grant
}

export async function getConnectionReviewerAuthority(
  db: DbClient,
  connection: Connection,
  externalSubjectId: string
): Promise<{ reviewerAssignmentId: string | null } | undefined> {
  if (connection.ownership === "personal")
    return connection.externalSubjectId === externalSubjectId
      ? { reviewerAssignmentId: null }
      : undefined
  const [assignment] = await db
    .select({ reviewerAssignmentId: connectionReviewerAssignments.id })
    .from(connectionReviewerAssignments)
    .innerJoin(
      externalSubjects,
      and(
        eq(
          externalSubjects.id,
          connectionReviewerAssignments.externalSubjectId
        ),
        eq(
          externalSubjects.workspaceId,
          connectionReviewerAssignments.workspaceId
        ),
        eq(externalSubjects.status, "verified")
      )
    )
    .innerJoin(
      externalSubjectEnvironments,
      and(
        eq(externalSubjectEnvironments.externalSubjectId, externalSubjects.id),
        eq(
          externalSubjectEnvironments.environmentId,
          connectionReviewerAssignments.environmentId
        )
      )
    )
    .where(
      and(
        eq(connectionReviewerAssignments.connectionId, connection.id),
        eq(
          connectionReviewerAssignments.environmentId,
          connection.environmentId
        ),
        eq(connectionReviewerAssignments.workspaceId, connection.workspaceId),
        eq(connectionReviewerAssignments.externalSubjectId, externalSubjectId),
        isNull(connectionReviewerAssignments.revokedAt)
      )
    )
  return assignment
}

export async function getApprovalReviewerAuthority(
  db: DbClient,
  request: ApprovalRequest,
  externalSubjectId: string
): Promise<{ reviewerAssignmentId: string | null } | undefined> {
  const [linked] = await db
    .select({ connection: connections })
    .from(actionIntents)
    .innerJoin(connections, eq(connections.id, actionIntents.connectionId))
    .where(eq(actionIntents.approvalRequestId, request.id))
  if (linked)
    return getConnectionReviewerAuthority(
      db,
      linked.connection,
      externalSubjectId
    )
  if (request.externalSubjectId === externalSubjectId)
    return { reviewerAssignmentId: null }
  return undefined
}

export function externalApprovalEligibility(externalSubjectId: string) {
  return sql`(( ${approvalRequests.externalSubjectId} = ${externalSubjectId} AND NOT EXISTS (SELECT 1 FROM action_intents a JOIN connections c ON c.id = a.connection_id WHERE a.approval_request_id = ${approvalRequests.id} AND c.ownership = 'environment')) OR EXISTS (SELECT 1 FROM action_intents a JOIN connections c ON c.id = a.connection_id JOIN connection_reviewer_assignments r ON r.connection_id = c.id JOIN external_subjects s ON s.id = r.external_subject_id JOIN external_subject_environments m ON m.environment_id = r.environment_id AND m.external_subject_id = r.external_subject_id WHERE a.approval_request_id = ${approvalRequests.id} AND c.ownership = 'environment' AND r.external_subject_id = ${externalSubjectId} AND r.workspace_id = ${approvalRequests.workspaceId} AND r.environment_id = ${approvalRequests.environmentId} AND r.revoked_at IS NULL AND s.status = 'verified'))`
}
