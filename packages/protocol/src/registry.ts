import type { OperationDefinition } from "./operations/operation"
import type { OperationMetadata } from "./operations/operation-metadata"
import { registerOperation } from "./operations/operation-metadata"
import { operationMetadata } from "./operation-metadata"
import {
  decideEndUserApprovalRequestOperation,
  getEndUserApprovalRequestOperation,
  listEndUserApprovalRequestsOperation,
} from "./operations/approval-requests"
import { listPendingActionIntentsOperation } from "./operations/action-intents"
import { streamEndUserEventsOperation } from "./operations/events"
import {
  createEndUserSessionOperation,
  exchangeEndUserAuthorizationOperation,
  revokeEndUserSessionOperation,
  startEndUserAuthorizationOperation,
} from "./operations/user-sessions"
import {
  cancelApplicationExecutionOperation,
  createApplicationConversationOperation,
  createEndUserConversationOperation,
  createEndUserMessageOperation,
  getApplicationConversationOperation,
  getApplicationExecutionOperation,
  getEndUserConversationOperation,
  getEndUserExecutionOperation,
  listApplicationConversationsOperation,
  listEndUserConversationsOperation,
  listEndUserMessagesOperation,
  provisionApplicationSubjectOperation,
  startApplicationExecutionOperation,
  startEndUserExecutionOperation,
} from "./operations/runtime"
import { listWebhookDeliveriesOperation } from "./operations/webhooks"
import {
  archiveRegressionCaseOperation,
  createRegressionCaseFromFlagOperation,
  createRegressionCaseFromStepOperation,
  getRegressionRunOperation,
  listRegressionCasesOperation,
  listRegressionRunsOperation,
  triggerRegressionRunOperation,
} from "./operations/workspace-regressions"
import {
  getConnectionOperation,
  listConnectionsOperation,
  revokeConnectionOperation,
  startConnectionAuthorizationOperation,
} from "./operations/connections"

function routeIdentity(operation: OperationDefinition): string {
  const path = operation.path.replace(/\{[^/{}]+\}/g, "{}")
  return `${operation.method} ${path}`
}

function freezeOperation(operation: OperationDefinition): void {
  const metadata = operation as OperationDefinition & Partial<OperationMetadata>
  Object.freeze(operation.auth.scopes)
  Object.freeze(operation.auth)
  Object.freeze(operation.request)
  Object.freeze(operation.response)
  Object.freeze(operation.errors)
  if (metadata.adapter) Object.freeze(metadata.adapter)
  if (metadata.sdk) Object.freeze(metadata.sdk)
  Object.freeze(operation)
}

export function createOperationRegistry<
  const TOperations extends readonly OperationDefinition[],
>(operations: TOperations): Readonly<TOperations> {
  const operationIds = new Set<string>()
  const routes = new Set<string>()
  for (const operation of operations) {
    if (operationIds.has(operation.operationId)) {
      throw new Error(`Duplicate operation ID: ${operation.operationId}`)
    }
    const route = routeIdentity(operation)
    if (routes.has(route)) {
      throw new Error(`Duplicate operation route: ${route}`)
    }
    operationIds.add(operation.operationId)
    routes.add(route)
  }
  for (const operation of operations) {
    freezeOperation(operation)
  }
  return Object.freeze(operations)
}

export const operationRegistry = createOperationRegistry([
  registerOperation(
    startConnectionAuthorizationOperation,
    operationMetadata.startConnectionAuthorization
  ),
  registerOperation(
    listConnectionsOperation,
    operationMetadata.listConnections
  ),
  registerOperation(getConnectionOperation, operationMetadata.getConnection),
  registerOperation(
    revokeConnectionOperation,
    operationMetadata.revokeConnection
  ),
  registerOperation(
    startEndUserAuthorizationOperation,
    operationMetadata.startEndUserAuthorization
  ),
  registerOperation(
    exchangeEndUserAuthorizationOperation,
    operationMetadata.exchangeEndUserAuthorization
  ),
  registerOperation(
    createEndUserSessionOperation,
    operationMetadata.createEndUserSession
  ),
  registerOperation(
    revokeEndUserSessionOperation,
    operationMetadata.revokeEndUserSession
  ),
  registerOperation(
    provisionApplicationSubjectOperation,
    operationMetadata.provisionApplicationSubject
  ),
  registerOperation(
    createApplicationConversationOperation,
    operationMetadata.createApplicationConversation
  ),
  registerOperation(
    listApplicationConversationsOperation,
    operationMetadata.listApplicationConversations
  ),
  registerOperation(
    getApplicationConversationOperation,
    operationMetadata.getApplicationConversation
  ),
  registerOperation(
    startApplicationExecutionOperation,
    operationMetadata.startApplicationExecution
  ),
  registerOperation(
    getApplicationExecutionOperation,
    operationMetadata.getApplicationExecution
  ),
  registerOperation(
    cancelApplicationExecutionOperation,
    operationMetadata.cancelApplicationExecution
  ),
  registerOperation(
    createEndUserConversationOperation,
    operationMetadata.createEndUserConversation
  ),
  registerOperation(
    listEndUserConversationsOperation,
    operationMetadata.listEndUserConversations
  ),
  registerOperation(
    getEndUserConversationOperation,
    operationMetadata.getEndUserConversation
  ),
  registerOperation(
    createEndUserMessageOperation,
    operationMetadata.createEndUserMessage
  ),
  registerOperation(
    listEndUserMessagesOperation,
    operationMetadata.listEndUserMessages
  ),
  registerOperation(
    startEndUserExecutionOperation,
    operationMetadata.startEndUserExecution
  ),
  registerOperation(
    getEndUserExecutionOperation,
    operationMetadata.getEndUserExecution
  ),
  registerOperation(
    listEndUserApprovalRequestsOperation,
    operationMetadata.listEndUserApprovalRequests
  ),
  registerOperation(
    getEndUserApprovalRequestOperation,
    operationMetadata.getEndUserApprovalRequest
  ),
  registerOperation(
    decideEndUserApprovalRequestOperation,
    operationMetadata.decideEndUserApprovalRequest
  ),
  registerOperation(
    listPendingActionIntentsOperation,
    operationMetadata.listPendingActionIntents
  ),
  registerOperation(
    streamEndUserEventsOperation,
    operationMetadata.streamEndUserEvents
  ),
  registerOperation(
    listWebhookDeliveriesOperation,
    operationMetadata.listWebhookDeliveries
  ),
  registerOperation(
    listRegressionCasesOperation,
    operationMetadata.listRegressionCases
  ),
  registerOperation(
    createRegressionCaseFromStepOperation,
    operationMetadata.createRegressionCaseFromStep
  ),
  registerOperation(
    createRegressionCaseFromFlagOperation,
    operationMetadata.createRegressionCaseFromFlag
  ),
  registerOperation(
    archiveRegressionCaseOperation,
    operationMetadata.archiveRegressionCase
  ),
  registerOperation(
    listRegressionRunsOperation,
    operationMetadata.listRegressionRuns
  ),
  registerOperation(
    triggerRegressionRunOperation,
    operationMetadata.triggerRegressionRun
  ),
  registerOperation(
    getRegressionRunOperation,
    operationMetadata.getRegressionRun
  ),
])
