import { defineRelations } from "drizzle-orm"
import * as schema from "./schema/index.js"

export const relations = defineRelations(schema, (r) => ({
  users: {
    sessions: r.many.sessions(),
    accounts: r.many.accounts(),
    members: r.many.members(),
    invitations: r.many.invitations(),
    notifications: r.many.notifications(),

    settings: r.one.userSettings(),

    triggeredNotifications: r.many.notifications({
      alias: "notification_actor",
    }),

    auditLogs: r.many.auditLogs(),

    affectedAuditLogs: r.many.auditLogs({
      alias: "audit_target",
    }),
  },

  userSettings: {
    user: r.one.users({
      from: r.userSettings.userId,
      to: r.users.id,
    }),
  },

  notifications: {
    user: r.one.users({
      from: r.notifications.userId,
      to: r.users.id,
    }),

    actor: r.one.users({
      alias: "notification_actor",
      from: r.notifications.actorUserId,
      to: r.users.id,
    }),
  },

  organizations: {
    members: r.many.members(),
    invitations: r.many.invitations(),
    auditLogs: r.many.auditLogs(),
    workflows: r.many.workflows(),
    executions: r.many.executions(),
    schedules: r.many.schedules(),
    secrets: r.many.secrets(),
    apiKeys: r.many.apiKeys(),
  },

  workflows: {
    workspace: r.one.organizations({
      from: r.workflows.workspaceId,
      to: r.organizations.id,
    }),

    versions: r.many.workflowVersions(),

    publishedVersion: r.one.workflowVersions({
      from: r.workflows.publishedVersionId,
      to: r.workflowVersions.id,
    }),

    executions: r.many.executions(),
    schedules: r.many.schedules(),
  },

  workflowVersions: {
    workflow: r.one.workflows({
      from: r.workflowVersions.workflowId,
      to: r.workflows.id,
    }),

    executions: r.many.executions(),
  },

  executions: {
    workspace: r.one.organizations({
      from: r.executions.workspaceId,
      to: r.organizations.id,
    }),

    workflow: r.one.workflows({
      from: r.executions.workflowId,
      to: r.workflows.id,
    }),

    workflowVersion: r.one.workflowVersions({
      from: r.executions.workflowVersionId,
      to: r.workflowVersions.id,
    }),

    steps: r.many.executionSteps(),
    checkpoints: r.many.checkpoints(),
  },

  executionSteps: {
    execution: r.one.executions({
      from: r.executionSteps.executionId,
      to: r.executions.id,
    }),

    replayedFrom: r.one.executionSteps({
      alias: "step_replay",
      from: r.executionSteps.replayedFromStepId,
      to: r.executionSteps.id,
    }),

    replays: r.many.executionSteps({
      alias: "step_replay",
    }),
  },

  checkpoints: {
    execution: r.one.executions({
      from: r.checkpoints.executionId,
      to: r.executions.id,
    }),
  },

  schedules: {
    workspace: r.one.organizations({
      from: r.schedules.workspaceId,
      to: r.organizations.id,
    }),

    workflow: r.one.workflows({
      from: r.schedules.workflowId,
      to: r.workflows.id,
    }),
  },

  secrets: {
    workspace: r.one.organizations({
      from: r.secrets.workspaceId,
      to: r.organizations.id,
    }),
  },

  apiKeys: {
    workspace: r.one.organizations({
      from: r.apiKeys.workspaceId,
      to: r.organizations.id,
    }),
  },

  auditLogs: {
    workspace: r.one.organizations({
      from: r.auditLogs.workspaceId,
      to: r.organizations.id,
    }),

    actor: r.one.users({
      from: r.auditLogs.actorUserId,
      to: r.users.id,
    }),

    targetUser: r.one.users({
      alias: "audit_target",
      from: r.auditLogs.targetUserId,
      to: r.users.id,
    }),
  },

  members: {
    organization: r.one.organizations({
      from: r.members.organizationId,
      to: r.organizations.id,
    }),
    user: r.one.users({
      from: r.members.userId,
      to: r.users.id,
    }),
  },

  accounts: {
    user: r.one.users({
      from: r.accounts.userId,
      to: r.users.id,
    }),
  },
  invitations: {
    organization: r.one.organizations({
      from: r.invitations.organizationId,
      to: r.organizations.id,
    }),
    user: r.one.users({
      from: r.invitations.inviterId,
      to: r.users.id,
    }),
  },

  sessions: {
    user: r.one.users({
      from: r.sessions.userId,
      to: r.users.id,
    }),
  },
}))
