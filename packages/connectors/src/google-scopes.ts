export const GOOGLE_IDENTITY_SCOPES = Object.freeze(["openid", "email"])

export const GOOGLE_ACTION_SCOPES = Object.freeze({
  gmail_read: "https://www.googleapis.com/auth/gmail.readonly",
  gmail_send: "https://www.googleapis.com/auth/gmail.send",
  calendar_read: "https://www.googleapis.com/auth/calendar.readonly",
  calendar_create: "https://www.googleapis.com/auth/calendar.events",
  calendar_update: "https://www.googleapis.com/auth/calendar.events",
})

export type GoogleActionFamily = keyof typeof GOOGLE_ACTION_SCOPES

export function normalizeGoogleGrantedScopes(value: string): string[] {
  return [
    ...new Set(
      value
        .split(" ")
        .filter(Boolean)
        .map((scope) =>
          scope === "https://www.googleapis.com/auth/userinfo.email"
            ? "email"
            : scope
        )
    ),
  ].sort((left, right) => left.localeCompare(right))
}

export function googleAuthorizationScopes(
  actionFamilies: readonly string[]
): readonly string[] {
  const actionScopes = actionFamilies.map((family) => {
    if (!(family in GOOGLE_ACTION_SCOPES)) {
      throw new Error("Unsupported Google action family")
    }
    return GOOGLE_ACTION_SCOPES[family as GoogleActionFamily]
  })
  return Object.freeze(
    [...new Set([...GOOGLE_IDENTITY_SCOPES, ...actionScopes])].sort(
      (left, right) => left.localeCompare(right)
    )
  )
}
