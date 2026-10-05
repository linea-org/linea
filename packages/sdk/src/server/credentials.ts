const environmentKeyPrefix = "lin_env_"
const workspaceKeyPrefix = "lin_"
const credentialType: unique symbol = Symbol("linea.serverCredentialType")

export type EnvironmentKey = {
  readonly value: string
  readonly [credentialType]: "environment"
}

export type WorkspaceKey = {
  readonly value: string
  readonly [credentialType]: "workspace"
}

export function environmentKey(value: string): EnvironmentKey {
  if (
    !value.startsWith(environmentKeyPrefix) ||
    value.length === environmentKeyPrefix.length
  ) {
    throw new Error(`Environment keys must start with ${environmentKeyPrefix}`)
  }
  const credential: EnvironmentKey = {
    value,
    [credentialType]: "environment",
  }
  return Object.freeze(credential)
}

export function workspaceKey(value: string): WorkspaceKey {
  if (value.startsWith(environmentKeyPrefix))
    throw new Error("Environment keys cannot authenticate a Workspace client")
  if (
    !value.startsWith(workspaceKeyPrefix) ||
    value.length === workspaceKeyPrefix.length
  ) {
    throw new Error(`Workspace keys must start with ${workspaceKeyPrefix}`)
  }
  const credential: WorkspaceKey = { value, [credentialType]: "workspace" }
  return Object.freeze(credential)
}
