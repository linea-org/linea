import type {
  OperationMetadata,
  OperationSdkCoverage,
} from "./operations/operation-metadata"

const none = "None."
const platformProtection =
  "No operation-specific limit; platform protections apply."
const environmentKeyRead =
  "Environment-key reads share 600 requests per key and 3,000 per workspace each minute."
const environmentKeyWrite =
  "Environment-key writes share 120 requests per key and 600 per workspace each minute."
const cursorPagination =
  "Cursor pagination through limit and cursor query parameters."
const userCaller = "An End User's browser or native environment."
const environmentCaller =
  "A trusted Operator backend acting for one Environment."
const workspaceCaller = "A trusted Operator backend acting for one workspace."

function environmentSdk(method: string): OperationSdkCoverage {
  return {
    importPath: "@linealabs/sdk/server",
    client: "LineaEnvironmentClient",
    method,
  }
}

function userSdk(method: string): OperationSdkCoverage {
  return {
    importPath: "@linealabs/sdk/user",
    client: "LineaUserClient",
    method,
  }
}

function workspaceSdk(method: string): OperationSdkCoverage {
  return {
    importPath: "@linealabs/sdk/server",
    client: "Linea",
    method,
  }
}

export const operationMetadata = {
  listEnvironmentConnections: {
    purpose: "List shared Environment Connections.",
    caller: "A workspace administrator with an Operator session.",
    idempotency: "None.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: {
      importPath: "@linealabs/sdk/server",
      client: "LineaConnectionAdminClient",
      method: "listConnections",
    },
  },
  createGithubInstallationConnection: {
    purpose: "Administer shared Connection authority.",
    caller: "A workspace administrator with an Operator session.",
    idempotency:
      "Mutations require recent authentication; revoked authority is never restored.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: {
      importPath: "@linealabs/sdk/server",
      client: "LineaConnectionAdminClient",
      method: "createGithubInstallation",
    },
  },
  getConnectionAuthorities: {
    purpose:
      "Inspect shared Connection requester grants and reviewer assignments.",
    caller: "A workspace administrator with an Operator session.",
    idempotency: "None.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: {
      importPath: "@linealabs/sdk/server",
      client: "LineaConnectionAdminClient",
      method: "getAuthorities",
    },
  },
  grantConnectionAccess: {
    purpose: "Administer shared Connection authority.",
    caller: "A workspace administrator with an Operator session.",
    idempotency:
      "Mutations require recent authentication; revoked authority is never restored.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: {
      importPath: "@linealabs/sdk/server",
      client: "LineaConnectionAdminClient",
      method: "grantAccess",
    },
  },
  revokeConnectionAccess: {
    purpose: "Administer shared Connection authority.",
    caller: "A workspace administrator with an Operator session.",
    idempotency:
      "Mutations require recent authentication; revoked authority is never restored.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: {
      importPath: "@linealabs/sdk/server",
      client: "LineaConnectionAdminClient",
      method: "revokeAccess",
    },
  },
  assignConnectionReviewer: {
    purpose: "Administer shared Connection authority.",
    caller: "A workspace administrator with an Operator session.",
    idempotency:
      "Mutations require recent authentication; revoked authority is never restored.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: {
      importPath: "@linealabs/sdk/server",
      client: "LineaConnectionAdminClient",
      method: "assignReviewer",
    },
  },
  revokeConnectionReviewer: {
    purpose: "Administer shared Connection authority.",
    caller: "A workspace administrator with an Operator session.",
    idempotency:
      "Mutations require recent authentication; revoked authority is never restored.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: {
      importPath: "@linealabs/sdk/server",
      client: "LineaConnectionAdminClient",
      method: "revokeReviewer",
    },
  },
  revokeSharedConnection: {
    purpose: "Administer shared Connection authority.",
    caller: "A workspace administrator with an Operator session.",
    idempotency:
      "Mutations require recent authentication; revoked authority is never restored.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: {
      importPath: "@linealabs/sdk/server",
      client: "LineaConnectionAdminClient",
      method: "revokeConnection",
    },
  },
  listEnvironmentConnectorAuditEvents: {
    purpose: "List redacted connector audit events for one Environment.",
    caller: environmentCaller,
    idempotency: none,
    rateLimit: environmentKeyRead,
    pagination: cursorPagination,
    events: none,
    sdk: environmentSdk("listAuditEvents"),
  },
  listWorkspaceConnectorAuditEvents: {
    purpose: "List redacted connector audit events for one workspace.",
    caller: workspaceCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    sdk: workspaceSdk("auditEvents.list"),
  },
  listEndUserConnectorAuditEvents: {
    purpose: "List connector audit events owned by the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    sdk: userSdk("listAuditEvents"),
  },
  launchConnectionAuthorization: {
    purpose:
      "Bind provider authorization to the initiating browser and session.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: userSdk("launchConnectionAuthorization"),
  },
  startConnectionAuthorization: {
    purpose: "Start provider authorization for an End User's Connection.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: userSdk("startConnectionAuthorization"),
  },
  getConnectionAuthorization: {
    purpose: "Inspect the bounded result of provider authorization.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: userSdk("getConnectionAuthorization"),
  },
  listConnections: {
    purpose: "List the End User's Environment-scoped Connections.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    sdk: userSdk("listConnections"),
  },
  getConnection: {
    purpose: "Inspect one End User Connection without provider credentials.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: userSdk("getConnection"),
  },
  startConnectionScopeUpgrade: {
    purpose:
      "Start explicit provider authorization for a Connection scope upgrade or reauthorization.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: userSdk("startConnectionScopeUpgrade"),
  },
  listConnectionUses: {
    purpose: "List recent redacted terminal uses of one Connection.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    sdk: userSdk("listConnectionUses"),
  },
  revokeConnection: {
    purpose: "Revoke one End User Connection and remove its active credential.",
    caller: userCaller,
    idempotency: "A revoked Connection cannot be revoked again.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: userSdk("revokeConnection"),
  },
  startEndUserAuthorization: {
    purpose: "Start an OIDC authorization with PKCE for an End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: "30 requests per client IP each minute.",
    pagination: none,
    events: none,
    sdk: userSdk("startAuthorization"),
  },
  exchangeEndUserAuthorization: {
    purpose:
      "Exchange an authorization code and PKCE verifier for a one-time identity exchange.",
    caller: userCaller,
    idempotency: "The authorization code is single-use.",
    rateLimit: "60 requests per client IP each minute.",
    pagination: none,
    events: none,
    sdk: userSdk("completeAuthorization"),
  },
  createEndUserSession: {
    purpose: "Create a proof-bound End-User Session from an identity exchange.",
    caller: userCaller,
    idempotency: "The identity exchange is single-use.",
    rateLimit:
      "10 requests per client IP and 10 sessions per External Subject within an Environment each minute.",
    pagination: none,
    events: none,
    sdk: userSdk("completeAuthorization"),
  },
  revokeEndUserSession: {
    purpose: "Revoke the current End-User Session.",
    caller: userCaller,
    idempotency: "Repeated revocation leaves the session revoked.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: userSdk("revoke"),
  },
  provisionEnvironmentSubject: {
    purpose: "Provision or retrieve an External Subject in an Environment.",
    caller: environmentCaller,
    idempotency: "The external identity is the natural idempotency key.",
    rateLimit: environmentKeyWrite,
    pagination: none,
    events: none,
    sdk: environmentSdk("provisionSubject"),
  },
  createEnvironmentConversation: {
    purpose:
      "Create an isolated Conversation for a provisioned External Subject.",
    caller: environmentCaller,
    idempotency:
      "Requires Idempotency-Key; replay returns the original response and conflicting input fails.",
    rateLimit: environmentKeyWrite,
    pagination: none,
    events: none,
    sdk: environmentSdk("createConversation"),
  },
  listEnvironmentConversations: {
    purpose: "List Conversations visible to an Environment.",
    caller: environmentCaller,
    idempotency: none,
    rateLimit: environmentKeyRead,
    pagination: cursorPagination,
    events: none,
    sdk: environmentSdk("listConversations"),
  },
  getEnvironmentConversation: {
    purpose: "Get one Conversation visible to an Environment.",
    caller: environmentCaller,
    idempotency: none,
    rateLimit: environmentKeyRead,
    pagination: none,
    events: none,
    sdk: environmentSdk("getConversation"),
  },
  startEnvironmentExecution: {
    purpose: "Start an Execution through an Environment workflow binding.",
    caller: environmentCaller,
    idempotency:
      "Requires Idempotency-Key; replay returns the original response and conflicting input fails.",
    rateLimit: environmentKeyWrite,
    pagination: none,
    events: "May emit execution and approval events and configured webhooks.",
    sdk: environmentSdk("startExecution"),
  },
  getEnvironmentExecution: {
    purpose: "Get one Execution visible to an Environment.",
    caller: environmentCaller,
    idempotency: none,
    rateLimit: environmentKeyRead,
    pagination: none,
    events: none,
    sdk: environmentSdk("getExecution"),
  },
  cancelEnvironmentExecution: {
    purpose: "Cancel a cancellable Environment Execution.",
    caller: environmentCaller,
    idempotency:
      "Requires Idempotency-Key; replay returns the original response and conflicting input fails.",
    rateLimit: environmentKeyWrite,
    pagination: none,
    events:
      "May emit execution and approval cancellation events and configured webhooks.",
    sdk: environmentSdk("cancelExecution"),
  },
  createEndUserConversation: {
    purpose: "Create an isolated Conversation for the authenticated End User.",
    caller: userCaller,
    idempotency:
      "Requires Idempotency-Key; replay returns the original response and conflicting input fails.",
    rateLimit: "20 Conversations per External Subject each minute.",
    pagination: none,
    events: none,
    sdk: userSdk("createConversation"),
  },
  listEndUserConversations: {
    purpose: "List Conversations owned by the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    sdk: userSdk("listConversations"),
  },
  getEndUserConversation: {
    purpose: "Get one Conversation owned by the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: userSdk("getConversation"),
  },
  createEndUserMessage: {
    purpose: "Append a message to an End User's Conversation.",
    caller: userCaller,
    idempotency:
      "Requires Idempotency-Key; replay returns the original response and conflicting input fails.",
    rateLimit: "60 messages per End-User Session each minute.",
    pagination: none,
    events: none,
    sdk: userSdk("sendMessage"),
  },
  listEndUserMessages: {
    purpose: "List messages in an End User's Conversation.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    sdk: userSdk("listMessages"),
  },
  startEndUserExecution: {
    purpose: "Start an Execution for the authenticated End User.",
    caller: userCaller,
    idempotency:
      "Requires Idempotency-Key; replay returns the original response and conflicting input fails.",
    rateLimit: "10 Executions per External Subject each minute.",
    pagination: none,
    events: "May emit execution and approval events and configured webhooks.",
    sdk: userSdk("startExecution"),
  },
  getEndUserExecution: {
    purpose: "Get one Execution owned by the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: userSdk("getExecution"),
  },
  listEndUserApprovalRequests: {
    purpose: "List Approval Requests assigned to the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    sdk: userSdk("listApprovalRequests"),
  },
  getEndUserApprovalRequest: {
    purpose: "Get one Approval Request assigned to the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: userSdk("getApprovalRequest"),
  },
  decideEndUserApprovalRequest: {
    purpose: "Record an immutable decision for an End User's Approval Request.",
    caller: userCaller,
    idempotency:
      "Requires Idempotency-Key; replay returns the original decision and conflicting input fails.",
    rateLimit: platformProtection,
    pagination: none,
    events: "Emits approval_request.decided and its configured webhook.",
    sdk: userSdk("decide"),
  },
  listPendingActionIntents: {
    purpose: "List pending Action Intents owned by the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    sdk: userSdk("listPendingActionIntents"),
  },
  streamEndUserEvents: {
    purpose:
      "Stream resumable Environment events for the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: "At most 3 concurrent streams per End-User Session.",
    pagination:
      "Resume with Last-Event-ID; an expired cursor returns event_cursor_expired.",
    events:
      "Streams the event types selected by the eventType query parameter.",
    sdk: userSdk("streamEvents"),
  },
  listWebhookDeliveries: {
    purpose: "List webhook delivery attempts for an Environment.",
    caller: environmentCaller,
    idempotency: none,
    rateLimit: environmentKeyRead,
    pagination: cursorPagination,
    events: none,
    sdk: environmentSdk("listWebhookDeliveries"),
  },
  listRegressionCases: {
    purpose: "List saved Regression Cases for a Workflow.",
    caller: workspaceCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: workspaceSdk("regressions.listCases"),
  },
  createRegressionCaseFromStep: {
    purpose: "Create a Regression Case from an Execution step.",
    caller: "A workspace administrator with an Operator session.",
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: {
      reason:
        "Regression writes require an administrator session; workspace API keys cannot call them.",
    },
  },
  createRegressionCaseFromFlag: {
    purpose: "Create a Regression Case from a flagged Execution.",
    caller: "A workspace administrator with an Operator session.",
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: {
      reason:
        "Regression writes require an administrator session; workspace API keys cannot call them.",
    },
  },
  archiveRegressionCase: {
    purpose: "Archive a Regression Case.",
    caller: "A workspace administrator with an Operator session.",
    idempotency: "Repeated archive requests leave the case archived.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: {
      reason:
        "Regression writes require an administrator session; workspace API keys cannot call them.",
    },
  },
  listRegressionRuns: {
    purpose: "List recent Regression Runs for a Workflow.",
    caller: workspaceCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: "Bounded by the limit query parameter; no continuation cursor.",
    events: none,
    sdk: workspaceSdk("regressions.listRuns"),
  },
  triggerRegressionRun: {
    purpose: "Queue a Regression Run for a Workflow.",
    caller: "A workspace administrator with an Operator session.",
    idempotency: none,
    rateLimit: "10 requests per caller and 30 per workspace each minute.",
    pagination: none,
    events: none,
    sdk: {
      reason:
        "Regression writes require an administrator session; workspace API keys cannot call them.",
    },
  },
  getRegressionRun: {
    purpose: "Get a Regression Run and its results.",
    caller: workspaceCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    sdk: workspaceSdk("regressions.getRun"),
  },
} as const satisfies Record<string, OperationMetadata>
