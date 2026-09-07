import { createContext, type ReactNode, useContext } from "react"

export type MobileSession = {
  user: { id: string; name: string; email: string }
  session: { activeOrganizationId?: string | null }
}

export type Workspace = {
  id: string
  name: string
  slug: string
}

type AuthResult<T> = Promise<{ data: T; error: unknown }>

export type MobileAuthClient = {
  useSession: () => { data: MobileSession | null; isPending: boolean }
  requestMagicLink: (email: string) => AuthResult<unknown>
  verifyMagicLink: (token: string) => AuthResult<unknown>
  listWorkspaces: () => AuthResult<Workspace[] | null>
  setActiveWorkspace: (workspaceId: string) => AuthResult<unknown>
}

const MobileAuthContext = createContext<MobileAuthClient | null>(null)

export function MobileAuthProvider({
  children,
  client,
}: {
  children: ReactNode
  client: MobileAuthClient
}) {
  return (
    <MobileAuthContext.Provider value={client}>
      {children}
    </MobileAuthContext.Provider>
  )
}

export function useMobileAuth() {
  const client = useContext(MobileAuthContext)
  if (!client) throw new Error("MobileAuthProvider is required")
  return client
}
