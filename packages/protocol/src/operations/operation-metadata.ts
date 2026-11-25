import type { OperationDefinition } from "./operation"

export type OperationSdkCoverage =
  | {
      readonly importPath: "@linealabs/sdk/server" | "@linealabs/sdk/user"
      readonly client:
        | "LineaEnvironmentClient"
        | "LineaUserClient"
        | "Linea"
        | "LineaConnectionAdminClient"
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
  readonly sdk: OperationSdkCoverage
}

export type RegisteredOperation = OperationDefinition & OperationMetadata

export function registerOperation(
  operation: OperationDefinition,
  metadata: OperationMetadata
): RegisteredOperation {
  return { ...operation, ...metadata }
}
