import {
  workspaceKeyScopes,
  type WorkspaceKeyScope,
} from "@linea/protocol/resources"

export type AccessPreset = "read" | "run" | "full" | "custom"

const readScopes: WorkspaceKeyScope[] = [
  "workflows:read",
  "applications:read",
  "executions:read",
  "signals:read",
  "regressions:read",
]

// Publishing still needs a signed-in admin, so no preset grants it.
export const presetScopes: Record<
  Exclude<AccessPreset, "custom">,
  WorkspaceKeyScope[]
> = {
  read: readScopes,
  run: [...readScopes, "executions:start"],
  full: workspaceKeyScopes.filter((scope) => scope !== "workflows:publish"),
}

export const accessOptions: { value: AccessPreset; label: string }[] = [
  { value: "read", label: "Read only" },
  { value: "run", label: "Run workflows" },
  { value: "full", label: "Full access" },
  { value: "custom", label: "Custom" },
]

export const expiryOptions = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
]

export const customScopes = workspaceKeyScopes.filter(
  (scope) => scope !== "workflows:publish"
)

export function accessLabel(scopes: readonly WorkspaceKeyScope[]): string {
  const granted = new Set(scopes)
  const match = accessOptions.find(
    ({ value }) =>
      value !== "custom" &&
      presetScopes[value].length === granted.size &&
      presetScopes[value].every((scope) => granted.has(scope))
  )
  return match?.label ?? `${scopes.length} scopes`
}
