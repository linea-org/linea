const applicationKeyPrefix = "lin_app_"
const workspaceKeyPrefix = "lin_"
const credentialType: unique symbol = Symbol("linea.serverCredentialType")

export type ApplicationKey = {
  readonly value: string
  readonly [credentialType]: "application"
}

export type WorkspaceKey = {
  readonly value: string
  readonly [credentialType]: "workspace"
}

export function applicationKey(value: string): ApplicationKey {
  if (
    !value.startsWith(applicationKeyPrefix) ||
    value.length === applicationKeyPrefix.length
  ) {
    throw new Error(`Application keys must start with ${applicationKeyPrefix}`)
  }
  const credential: ApplicationKey = {
    value,
    [credentialType]: "application",
  }
  return Object.freeze(credential)
}

export function workspaceKey(value: string): WorkspaceKey {
  if (
    !value.startsWith(workspaceKeyPrefix) ||
    value.length === workspaceKeyPrefix.length
  ) {
    throw new Error(`Workspace keys must start with ${workspaceKeyPrefix}`)
  }
  const credential: WorkspaceKey = { value, [credentialType]: "workspace" }
  return Object.freeze(credential)
}
