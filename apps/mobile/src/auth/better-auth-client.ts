import { expoClient } from "@better-auth/expo/client"
import { magicLinkClient, organizationClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import * as SecureStore from "expo-secure-store"
import type { MobileAuthClient } from "./mobile-auth"

const baseURL = process.env.EXPO_PUBLIC_API_URL
if (!baseURL) throw new Error("EXPO_PUBLIC_API_URL is required")
const appURL = process.env.EXPO_PUBLIC_APP_URL
if (!appURL) throw new Error("EXPO_PUBLIC_APP_URL is required")
const magicLinkURL = new URL("/magic-link", appURL).toString()

const authClient = createAuthClient({
  baseURL,
  basePath: "/v1/auth",
  plugins: [
    expoClient({
      scheme: "linea",
      storagePrefix: "linea",
      storage: SecureStore,
    }),
    organizationClient(),
    magicLinkClient(),
  ],
})

export const mobileAuthClient: MobileAuthClient = {
  useSession: authClient.useSession,
  requestMagicLink: (email) =>
    authClient.signIn.magicLink({
      email,
      callbackURL: magicLinkURL,
      newUserCallbackURL: magicLinkURL,
      errorCallbackURL: magicLinkURL,
    }),
  verifyMagicLink: (token) => authClient.magicLink.verify({ query: { token } }),
  listWorkspaces: () => authClient.organization.list(),
  createWorkspace: (input) => authClient.organization.create(input),
  setActiveWorkspace: (organizationId) =>
    authClient.organization.setActive({ organizationId }),
}

export const getMobileSessionCookie = () => authClient.getCookie()
