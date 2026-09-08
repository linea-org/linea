import type { OperationDefinition } from "./operations/operation"

export function createOperationRegistry<
  const TOperations extends readonly OperationDefinition[],
>(operations: TOperations): Readonly<TOperations> {
  const operationIds = new Set<string>()
  const routes = new Set<string>()
  for (const operation of operations) {
    if (operationIds.has(operation.operationId)) {
      throw new Error(`Duplicate operation ID: ${operation.operationId}`)
    }
    const route = `${operation.method} ${operation.path}`
    if (routes.has(route)) {
      throw new Error(`Duplicate operation route: ${route}`)
    }
    operationIds.add(operation.operationId)
    routes.add(route)
  }
  return Object.freeze(operations)
}

export const operationRegistry = createOperationRegistry([])
