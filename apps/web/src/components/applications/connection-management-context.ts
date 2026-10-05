import { createContext, useContext } from "react"
type ConnectionManagement = {
  environmentId: string
  connectionId: string
  enabled: boolean
}
export const ConnectionManagementContext =
  createContext<ConnectionManagement | null>(null)
export function useConnectionManagement(): ConnectionManagement {
  const connection = useContext(ConnectionManagementContext)
  if (!connection)
    throw new Error("Connection management requires its owner context")
  return connection
}
