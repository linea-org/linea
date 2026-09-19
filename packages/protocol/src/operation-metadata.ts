import type {
  OperationAdapter,
  OperationMetadata,
  OperationSdkCoverage,
} from "./operations/operation-metadata"

const none = "None."
const platformProtection =
  "No operation-specific limit; platform protections apply."
const cursorPagination =
  "Cursor pagination through limit and cursor query parameters."
const userCaller = "An End User's browser or native application."
const applicationCaller =
  "A trusted Operator backend acting for one Application."
const workspaceCaller = "A trusted Operator backend acting for one workspace."

function adapter(source: string, handler: string): OperationAdapter {
  return { source, handler }
}

function applicationSdk(method: string): OperationSdkCoverage {
  return {
    importPath: "@linea/sdk/server",
    client: "LineaApplicationClient",
    method,
  }
}

function userSdk(method: string): OperationSdkCoverage {
  return { importPath: "@linea/sdk/user", client: "LineaUserClient", method }
}

function workspaceSdk(method: string): OperationSdkCoverage {
  return {
    importPath: "@linea/sdk/server",
    client: "LineaWorkspaceClient",
    method,
  }
}

export const operationMetadata = {
  startConnectionAuthorization: {
    purpose: "Start provider authorization for an End User's Connection.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/connections/connections.controller.ts",
      "startAuthorization"
    ),
    sdk: userSdk("startConnectionAuthorization"),
  },
  listConnections: {
    purpose: "List the End User's Application-scoped Connections.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/connections/connections.controller.ts",
      "list"
    ),
    sdk: userSdk("listConnections"),
  },
  getConnection: {
    purpose: "Inspect one End User Connection without provider credentials.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/connections/connections.controller.ts",
      "get"
    ),
    sdk: userSdk("getConnection"),
  },
  revokeConnection: {
    purpose: "Revoke one End User Connection and remove its active credential.",
    caller: userCaller,
    idempotency: "A revoked Connection cannot be revoked again.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/connections/connections.controller.ts",
      "revoke"
    ),
    sdk: userSdk("revokeConnection"),
  },
  startEndUserAuthorization: {
    purpose: "Start an OIDC authorization with PKCE for an End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: "30 requests per client IP and 300 per Application each minute.",
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/end-user-authorization/end-user-authorization.controller.ts",
      "start"
    ),
    sdk: userSdk("startAuthorization"),
  },
  exchangeEndUserAuthorization: {
    purpose:
      "Exchange an authorization code and PKCE verifier for a one-time identity exchange.",
    caller: userCaller,
    idempotency: "The authorization code is single-use.",
    rateLimit: "60 requests per client IP and 600 per Application each minute.",
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/end-user-authorization/end-user-authorization.controller.ts",
      "exchange"
    ),
    sdk: userSdk("completeAuthorization"),
  },
  createEndUserSession: {
    purpose: "Create a proof-bound End-User Session from an identity exchange.",
    caller: userCaller,
    idempotency: "The identity exchange is single-use.",
    rateLimit: "10 requests per client IP and 10 per Application each minute.",
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/end-user-sessions/end-user-sessions.controller.ts",
      "create"
    ),
    sdk: userSdk("completeAuthorization"),
  },
  revokeEndUserSession: {
    purpose: "Revoke the current End-User Session.",
    caller: userCaller,
    idempotency: "Repeated revocation leaves the session revoked.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/end-user-sessions/end-user-sessions.controller.ts",
      "revoke"
    ),
    sdk: userSdk("revoke"),
  },
  provisionApplicationSubject: {
    purpose: "Provision or retrieve an External Subject in an Application.",
    caller: applicationCaller,
    idempotency: "The external identity is the natural idempotency key.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/applications/application-external-subjects.controller.ts",
      "provision"
    ),
    sdk: applicationSdk("provisionSubject"),
  },
  createApplicationConversation: {
    purpose:
      "Create an isolated Conversation for a provisioned External Subject.",
    caller: applicationCaller,
    idempotency:
      "Requires Idempotency-Key; replay returns the original response and conflicting input fails.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/public-runtime/application-conversations.controller.ts",
      "create"
    ),
    sdk: applicationSdk("createConversation"),
  },
  listApplicationConversations: {
    purpose: "List Conversations visible to an Application.",
    caller: applicationCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/public-runtime/application-conversations.controller.ts",
      "list"
    ),
    sdk: applicationSdk("listConversations"),
  },
  getApplicationConversation: {
    purpose: "Get one Conversation visible to an Application.",
    caller: applicationCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/public-runtime/application-conversations.controller.ts",
      "get"
    ),
    sdk: applicationSdk("getConversation"),
  },
  startApplicationExecution: {
    purpose: "Start an Execution through an Application workflow binding.",
    caller: applicationCaller,
    idempotency:
      "Requires Idempotency-Key; replay returns the original response and conflicting input fails.",
    rateLimit: platformProtection,
    pagination: none,
    events: "May emit execution and approval events and configured webhooks.",
    adapter: adapter(
      "apps/platform-api/src/public-runtime/application-executions.controller.ts",
      "start"
    ),
    sdk: applicationSdk("startExecution"),
  },
  getApplicationExecution: {
    purpose: "Get one Execution visible to an Application.",
    caller: applicationCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/public-runtime/application-executions.controller.ts",
      "get"
    ),
    sdk: applicationSdk("getExecution"),
  },
  cancelApplicationExecution: {
    purpose: "Cancel a cancellable Application Execution.",
    caller: applicationCaller,
    idempotency:
      "Requires Idempotency-Key; replay returns the original response and conflicting input fails.",
    rateLimit: platformProtection,
    pagination: none,
    events:
      "May emit execution and approval cancellation events and configured webhooks.",
    adapter: adapter(
      "apps/platform-api/src/public-runtime/application-executions.controller.ts",
      "cancel"
    ),
    sdk: applicationSdk("cancelExecution"),
  },
  createEndUserConversation: {
    purpose: "Create an isolated Conversation for the authenticated End User.",
    caller: userCaller,
    idempotency:
      "Requires Idempotency-Key; replay returns the original response and conflicting input fails.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/public-runtime/end-user-runtime.controller.ts",
      "createConversation"
    ),
    sdk: userSdk("createConversation"),
  },
  listEndUserConversations: {
    purpose: "List Conversations owned by the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/public-runtime/end-user-runtime.controller.ts",
      "listConversations"
    ),
    sdk: userSdk("listConversations"),
  },
  getEndUserConversation: {
    purpose: "Get one Conversation owned by the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/public-runtime/end-user-runtime.controller.ts",
      "getConversation"
    ),
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
    adapter: adapter(
      "apps/platform-api/src/public-runtime/end-user-runtime.controller.ts",
      "createMessage"
    ),
    sdk: userSdk("sendMessage"),
  },
  listEndUserMessages: {
    purpose: "List messages in an End User's Conversation.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/public-runtime/end-user-runtime.controller.ts",
      "listMessages"
    ),
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
    adapter: adapter(
      "apps/platform-api/src/public-runtime/end-user-runtime.controller.ts",
      "startExecution"
    ),
    sdk: userSdk("startExecution"),
  },
  getEndUserExecution: {
    purpose: "Get one Execution owned by the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/public-runtime/end-user-runtime.controller.ts",
      "getExecution"
    ),
    sdk: userSdk("getExecution"),
  },
  listEndUserApprovalRequests: {
    purpose: "List Approval Requests assigned to the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/public-runtime/end-user-runtime.controller.ts",
      "listApprovalRequests"
    ),
    sdk: userSdk("listApprovalRequests"),
  },
  getEndUserApprovalRequest: {
    purpose: "Get one Approval Request assigned to the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/public-runtime/end-user-runtime.controller.ts",
      "getApprovalRequest"
    ),
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
    adapter: adapter(
      "apps/platform-api/src/public-runtime/end-user-runtime.controller.ts",
      "decideApprovalRequest"
    ),
    sdk: userSdk("decide"),
  },
  listPendingActionIntents: {
    purpose: "List pending Action Intents owned by the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/public-runtime/end-user-runtime.controller.ts",
      "listPendingActionIntents"
    ),
    sdk: userSdk("listPendingActionIntents"),
  },
  streamEndUserEvents: {
    purpose:
      "Stream resumable Application events for the authenticated End User.",
    caller: userCaller,
    idempotency: none,
    rateLimit: "At most 3 concurrent streams per End-User Session.",
    pagination:
      "Resume with Last-Event-ID; an expired cursor returns event_cursor_expired.",
    events:
      "Streams the event types selected by the eventType query parameter.",
    adapter: adapter(
      "apps/platform-api/src/public-runtime/end-user-runtime.controller.ts",
      "streamEvents"
    ),
    sdk: userSdk("streamEvents"),
  },
  listWebhookDeliveries: {
    purpose: "List webhook delivery attempts for an Application.",
    caller: applicationCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: cursorPagination,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/public-runtime/webhook-deliveries.controller.ts",
      "list"
    ),
    sdk: applicationSdk("listWebhookDeliveries"),
  },
  listRegressionCases: {
    purpose: "List saved Regression Cases for a Workflow.",
    caller: workspaceCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/regressions/regression-cases.controller.ts",
      "list"
    ),
    sdk: workspaceSdk("listRegressionCases"),
  },
  createRegressionCaseFromStep: {
    purpose: "Create a Regression Case from an Execution step.",
    caller: workspaceCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/regressions/regression-cases.controller.ts",
      "createFromStep"
    ),
    sdk: workspaceSdk("createRegressionCaseFromStep"),
  },
  createRegressionCaseFromFlag: {
    purpose: "Create a Regression Case from a flagged Execution.",
    caller: workspaceCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/regressions/regression-cases.controller.ts",
      "createFromFlag"
    ),
    sdk: workspaceSdk("createRegressionCaseFromFlag"),
  },
  archiveRegressionCase: {
    purpose: "Archive a Regression Case.",
    caller: workspaceCaller,
    idempotency: "Repeated archive requests leave the case archived.",
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/regressions/regression-cases.controller.ts",
      "archive"
    ),
    sdk: workspaceSdk("archiveRegressionCase"),
  },
  listRegressionRuns: {
    purpose: "List recent Regression Runs for a Workflow.",
    caller: workspaceCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: "Bounded by the limit query parameter; no continuation cursor.",
    events: none,
    adapter: adapter(
      "apps/platform-api/src/regressions/regression-runs.controller.ts",
      "list"
    ),
    sdk: workspaceSdk("listRegressionRuns"),
  },
  triggerRegressionRun: {
    purpose: "Queue a Regression Run for a Workflow.",
    caller: workspaceCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/regressions/regression-runs.controller.ts",
      "trigger"
    ),
    sdk: workspaceSdk("triggerRegressionRun"),
  },
  getRegressionRun: {
    purpose: "Get a Regression Run and its results.",
    caller: workspaceCaller,
    idempotency: none,
    rateLimit: platformProtection,
    pagination: none,
    events: none,
    adapter: adapter(
      "apps/platform-api/src/regressions/regression-runs.controller.ts",
      "get"
    ),
    sdk: workspaceSdk("getRegressionRun"),
  },
} as const satisfies Record<string, OperationMetadata>
