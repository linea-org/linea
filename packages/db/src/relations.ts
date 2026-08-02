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
