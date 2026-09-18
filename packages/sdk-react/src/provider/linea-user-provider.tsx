import { createContext, useContext, type ReactNode } from "react"
import type { LineaUserClient } from "@linea/sdk/user"

const LineaUserContext = createContext<LineaUserClient | undefined>(undefined)

export type LineaUserProviderProps = {
  client: LineaUserClient
  children: ReactNode
}

export function LineaUserProvider({
  client,
  children,
}: LineaUserProviderProps): ReactNode {
  return (
    <LineaUserContext.Provider value={client}>
      {children}
    </LineaUserContext.Provider>
  )
}

export function useLineaUserClient(): LineaUserClient {
  const client = useContext(LineaUserContext)
  if (!client) throw new Error("Linea hooks require LineaUserProvider")
  return client
}
