import { createAuthClient } from "better-auth/react"
import { organizationClient } from "better-auth/client/plugins"

const baseURL =
  import.meta.env.VITE_APP_URL?.replace(/\/$/, "") || "http://localhost:3001"

export const authClient = createAuthClient({
  baseURL,
  plugins: [organizationClient()],
})

export type SessionData = {
  user: {
    id: string
    email: string
    name: string
    emailVerified: boolean
    image?: string | null
  }
  session: {
    id: string
    userId: string
    token: string
    expiresAt: Date
    createdAt: Date
    updatedAt: Date
    activeOrganizationId?: string | null
  }
}
