import { defineRelations } from "drizzle-orm"
import * as schema from "./schema/index.js"

export const relations = defineRelations(schema, (r) => ({
  users: {
    sessions: r.many.sessions(),
    accounts: r.many.accounts(),
    members: r.many.members(),
    invitations: r.many.invitations(),
    notifications: r.many.notifications(),
    pushDeviceRegistrations: r.many.pushDeviceRegistrations(),

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
    pushDeliveries: r.many.pushDeliveries(),
  },

  pushDeviceRegistrations: {
    user: r.one.users({
      from: r.pushDeviceRegistrations.userId,
      to: r.users.id,
    }),
    deliveries: r.many.pushDeliveries(),
  },

  pushDeliveries: {
    notification: r.one.notifications({
      from: r.pushDeliveries.notificationId,
      to: r.notifications.id,
    }),
    deviceRegistration: r.one.pushDeviceRegistrations({
      from: r.pushDeliveries.deviceRegistrationId,
      to: r.pushDeviceRegistrations.id,
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
    applications: r.many.applications(),
    workflowContractRevisions: r.many.workflowContractRevisions(),
    applicationWorkflowBindings: r.many.applicationWorkflowBindings(),
    applicationKeys: r.many.applicationKeys(),
    externalSubjects: r.many.externalSubjects(),
    externalSubjectApplications: r.many.externalSubjectApplications(),
    endUserAuthorizationRequests: r.many.endUserAuthorizationRequests(),
    endUserIdentityExchanges: r.many.endUserIdentityExchanges(),
    endUserSessions: r.many.endUserSessions(),
    endUserEventStreams: r.many.endUserEventStreams(),
    conversations: r.many.conversations(),
  },

  applications: {
    workspace: r.one.organizations({
      from: r.applications.workspaceId,
      to: r.organizations.id,
    }),
    workflowBindings: r.many.applicationWorkflowBindings(),
    keys: r.many.applicationKeys(),
    executions: r.many.executions(),
    externalSubjects: r.many.externalSubjectApplications(),
    endUserAuthorizationRequests: r.many.endUserAuthorizationRequests(),
    endUserIdentityExchanges: r.many.endUserIdentityExchanges(),
    endUserSessions: r.many.endUserSessions(),
    endUserEventStreams: r.many.endUserEventStreams(),
    conversations: r.many.conversations(),
  },

  externalSubjects: {
    workspace: r.one.organizations({
      from: r.externalSubjects.workspaceId,
      to: r.organizations.id,
    }),
    applications: r.many.externalSubjectApplications(),
    authorizationRequests: r.many.endUserAuthorizationRequests(),
    identityExchanges: r.many.endUserIdentityExchanges(),
    sessions: r.many.endUserSessions(),
    eventStreams: r.many.endUserEventStreams(),
    conversations: r.many.conversations(),
  },

  externalSubjectApplications: {
    workspace: r.one.organizations({
      from: r.externalSubjectApplications.workspaceId,
      to: r.organizations.id,
    }),
    application: r.one.applications({
      from: r.externalSubjectApplications.applicationId,
      to: r.applications.id,
    }),
    externalSubject: r.one.externalSubjects({
      from: r.externalSubjectApplications.externalSubjectId,
      to: r.externalSubjects.id,
    }),
  },

  endUserSessions: {
    workspace: r.one.organizations({
      from: r.endUserSessions.workspaceId,
      to: r.organizations.id,
    }),
    application: r.one.applications({
      from: r.endUserSessions.applicationId,
      to: r.applications.id,
    }),
    externalSubject: r.one.externalSubjects({
      from: r.endUserSessions.externalSubjectId,
      to: r.externalSubjects.id,
    }),
    proofs: r.many.endUserSessionProofs(),
    eventStreams: r.many.endUserEventStreams(),
  },

  endUserEventStreams: {
    workspace: r.one.organizations({
      from: r.endUserEventStreams.workspaceId,
      to: r.organizations.id,
    }),
    application: r.one.applications({
      from: r.endUserEventStreams.applicationId,
      to: r.applications.id,
    }),
    externalSubject: r.one.externalSubjects({
      from: r.endUserEventStreams.externalSubjectId,
      to: r.externalSubjects.id,
    }),
    session: r.one.endUserSessions({
      from: r.endUserEventStreams.sessionId,
      to: r.endUserSessions.id,
    }),
  },

  endUserSessionProofs: {
    session: r.one.endUserSessions({
      from: r.endUserSessionProofs.sessionId,
      to: r.endUserSessions.id,
    }),
  },

  endUserAuthorizationRequests: {
    workspace: r.one.organizations({
      from: r.endUserAuthorizationRequests.workspaceId,
      to: r.organizations.id,
    }),
    application: r.one.applications({
      from: r.endUserAuthorizationRequests.applicationId,
      to: r.applications.id,
    }),
    externalSubject: r.one.externalSubjects({
      from: r.endUserAuthorizationRequests.externalSubjectId,
      to: r.externalSubjects.id,
    }),
  },

  endUserIdentityExchanges: {
    workspace: r.one.organizations({
      from: r.endUserIdentityExchanges.workspaceId,
      to: r.organizations.id,
    }),
    application: r.one.applications({
      from: r.endUserIdentityExchanges.applicationId,
      to: r.applications.id,
    }),
    externalSubject: r.one.externalSubjects({
      from: r.endUserIdentityExchanges.externalSubjectId,
      to: r.externalSubjects.id,
    }),
  },

  applicationKeys: {
    workspace: r.one.organizations({
      from: r.applicationKeys.workspaceId,
      to: r.organizations.id,
    }),
    application: r.one.applications({
      from: r.applicationKeys.applicationId,
      to: r.applications.id,
    }),
    auditLogs: r.many.auditLogs({
      alias: "audit_application_key_actor",
    }),
  },

  applicationWorkflowBindings: {
    workspace: r.one.organizations({
      from: r.applicationWorkflowBindings.workspaceId,
      to: r.organizations.id,
    }),
    application: r.one.applications({
      from: r.applicationWorkflowBindings.applicationId,
      to: r.applications.id,
    }),
    workflow: r.one.workflows({
      from: r.applicationWorkflowBindings.workflowId,
      to: r.workflows.id,
    }),
    contractRevision: r.one.workflowContractRevisions({
      from: r.applicationWorkflowBindings.workflowContractRevisionId,
      to: r.workflowContractRevisions.id,
    }),
  },

  workflows: {
    workspace: r.one.organizations({
      from: r.workflows.workspaceId,
      to: r.organizations.id,
    }),

    versions: r.many.workflowVersions(),
    contractRevisions: r.many.workflowContractRevisions(),
    applicationBindings: r.many.applicationWorkflowBindings(),
    conversations: r.many.conversations(),

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
    contractRevision: r.one.workflowContractRevisions({
      from: r.workflowVersions.workflowContractRevisionId,
      to: r.workflowContractRevisions.id,
    }),

    executions: r.many.executions(),
  },

  workflowContractRevisions: {
    workspace: r.one.organizations({
      from: r.workflowContractRevisions.workspaceId,
      to: r.organizations.id,
    }),
    workflow: r.one.workflows({
      from: r.workflowContractRevisions.workflowId,
      to: r.workflows.id,
    }),
    workflowVersions: r.many.workflowVersions(),
    applicationBindings: r.many.applicationWorkflowBindings(),
    executions: r.many.executions(),
  },

  conversations: {
    workspace: r.one.organizations({
      from: r.conversations.workspaceId,
      to: r.organizations.id,
    }),
    application: r.one.applications({
      from: r.conversations.applicationId,
      to: r.applications.id,
    }),
    workflow: r.one.workflows({
      from: r.conversations.workflowId,
      to: r.workflows.id,
    }),
    externalSubject: r.one.externalSubjects({
      from: r.conversations.externalSubjectId,
      to: r.externalSubjects.id,
    }),
    messages: r.many.chatMessages(),
    executions: r.many.executions(),
  },

  chatMessages: {
    conversation: r.one.conversations({
      from: r.chatMessages.conversationId,
      to: r.conversations.id,
    }),
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
    application: r.one.applications({
      from: r.executions.applicationId,
      to: r.applications.id,
    }),
    conversation: r.one.conversations({
      from: r.executions.conversationId,
      to: r.conversations.id,
    }),
    externalSubject: r.one.externalSubjects({
      from: r.executions.externalSubjectRecordId,
      to: r.externalSubjects.id,
    }),
    workflowContractRevision: r.one.workflowContractRevisions({
      from: r.executions.workflowContractRevisionId,
      to: r.workflowContractRevisions.id,
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

    applicationKeyActor: r.one.applicationKeys({
      alias: "audit_application_key_actor",
      from: r.auditLogs.actorApplicationKeyId,
      to: r.applicationKeys.id,
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
