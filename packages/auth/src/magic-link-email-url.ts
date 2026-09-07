export function createMagicLinkEmailUrl(
  authUrl: string,
  webAppUrl: string
): string {
  const incoming = new URL(authUrl)
  const token = incoming.searchParams.get("token")
  if (!token) throw new Error("Auth email link is missing a token")
  const callbackURL = incoming.searchParams.get("callbackURL") ?? ""
  const landing = new URL("/magic-link", webAppUrl)
  landing.searchParams.set("token", token)
  const invitation = /\/accept-invitation\/([^/?#]+)/.exec(callbackURL)?.[1]
  if (invitation) landing.searchParams.set("invitationId", invitation)
  return landing.toString()
}
