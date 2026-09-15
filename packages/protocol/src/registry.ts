import type { OperationDefinition } from "./operations/operation"
import {
  decideEndUserApprovalRequestOperation,
  getEndUserApprovalRequestOperation,
  listEndUserApprovalRequestsOperation,
} from "./operations/approval-requests"
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
  startApplicationExecutionOperation,
  startEndUserExecutionOperation,
} from "./operations/runtime"

function routeIdentity(operation: OperationDefinition): string {
  const path = operation.path.replace(/\{[^/{}]+\}/g, "{}")
  return `${operation.method} ${path}`
}

function freezeOperation(operation: OperationDefinition): void {
  Object.freeze(operation.auth.scopes)
  Object.freeze(operation.auth)
  Object.freeze(operation.request)
  Object.freeze(operation.response)
  Object.freeze(operation.errors)
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
  startEndUserAuthorizationOperation,
  exchangeEndUserAuthorizationOperation,
  createEndUserSessionOperation,
  revokeEndUserSessionOperation,
  createApplicationConversationOperation,
  listApplicationConversationsOperation,
  getApplicationConversationOperation,
  startApplicationExecutionOperation,
  getApplicationExecutionOperation,
  cancelApplicationExecutionOperation,
  createEndUserConversationOperation,
  listEndUserConversationsOperation,
  getEndUserConversationOperation,
  createEndUserMessageOperation,
  listEndUserMessagesOperation,
  startEndUserExecutionOperation,
  getEndUserExecutionOperation,
  listEndUserApprovalRequestsOperation,
  getEndUserApprovalRequestOperation,
  decideEndUserApprovalRequestOperation,
])
