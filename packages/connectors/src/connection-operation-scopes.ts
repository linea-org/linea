import type { ConnectorReadOperation } from "./connector-read-operation.js"
import type { ConnectorSideEffectOperation } from "./connector-side-effect-operation.js"

export function requiredConnectionScopes(
  operation: ConnectorReadOperation | ConnectorSideEffectOperation,
  authorizationKind: "delegated_user" | "github_app_installation"
): readonly string[] {
  if (authorizationKind === "delegated_user") return operation.requiredScopes
  if (!operation.installationPermissions)
    throw new Error("Operation does not support GitHub installation authority")
  return Object.entries(operation.installationPermissions).map(
    ([name, level]) => `${name}:${level}`
  )
}
