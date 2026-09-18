import type { OperationDefinition } from "./operation"

export type OperationAdapter = {
  readonly source: string
  readonly handler: string
}

export type OperationSdkCoverage =
  | {
      readonly importPath: "@linea/sdk/server" | "@linea/sdk/user"
      readonly client:
        | "LineaApplicationClient"
        | "LineaUserClient"
        | "LineaWorkspaceClient"
      readonly method: string
    }
  | { readonly reason: string }

export type OperationMetadata = {
  readonly purpose: string
  readonly caller: string
  readonly idempotency: string
  readonly rateLimit: string
  readonly pagination: string
  readonly events: string
  readonly adapter: OperationAdapter
  readonly sdk: OperationSdkCoverage
}

export type RegisteredOperation = OperationDefinition & OperationMetadata

export function registerOperation(
  operation: OperationDefinition,
  metadata: OperationMetadata
): RegisteredOperation {
  return { ...operation, ...metadata }
}
