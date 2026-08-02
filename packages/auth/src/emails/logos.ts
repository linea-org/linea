export type EmailLogo = "linea" | "linea-dark"

const LOGO_URLS: Record<EmailLogo, string> = {
  linea:
    "https://nvbo964h3g.ufs.sh/f/mMfKEft9TI3pMTb45zrVwI7YETcJmxbU85F2PNsOeu9AjSgo",
  "linea-dark":
    "https://nvbo964h3g.ufs.sh/f/mMfKEft9TI3pJr7iO0GTwKepNDXSgcnmjz8rBJoPv2i0EGOx",
}

export function resolveEmailLogoUrl(
  logo: EmailLogo = "linea",
  explicitUrl?: string
) {
  if (explicitUrl) return explicitUrl
  return LOGO_URLS[logo]
}
