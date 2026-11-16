export const PERSONAL_WORKSPACE_METADATA = { personal: true } as const

/** Metadata arrives as a JSON string from the database and as an object from the auth API. */
export function isPersonalWorkspace(metadata: unknown): boolean {
  if (!metadata) return false
  const parsed: unknown =
    typeof metadata === "string" ? JSON.parse(metadata) : metadata
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    "personal" in parsed &&
    parsed.personal === true
  )
}
