import { expoClient } from "@better-auth/expo/client"
import { magicLinkClient, organizationClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import * as SecureStore from "expo-secure-store"
import type { MobileAuthClient } from "./mobile-auth"

const baseURL = process.env.EXPO_PUBLIC_API_URL
if (!baseURL) throw new Error("EXPO_PUBLIC_API_URL is required")

const authClient = createAuthClient({
  baseURL,
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
      callbackURL: "/workspaces",
      newUserCallbackURL: "/workspaces",
      errorCallbackURL: "/sign-in",
    }),
  verifyMagicLink: (token) => authClient.magicLink.verify({ query: { token } }),
  listWorkspaces: () => authClient.organization.list(),
  setActiveWorkspace: (organizationId) =>
    authClient.organization.setActive({ organizationId }),
}
