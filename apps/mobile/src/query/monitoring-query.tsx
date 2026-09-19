import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createContext, type ReactNode, useContext } from "react"

export const monitoringQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 10_000 },
  },
})

export const ClearWorkspaceCacheContext = createContext(() => undefined)

export function MonitoringQueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={monitoringQueryClient}>
      <ClearWorkspaceCacheContext.Provider
        value={() => {
          monitoringQueryClient.removeQueries({ queryKey: ["monitoring"] })
          monitoringQueryClient.removeQueries({ queryKey: ["approvals"] })
        }}
      >
        {children}
      </ClearWorkspaceCacheContext.Provider>
    </QueryClientProvider>
  )
}

export function useClearWorkspaceCache() {
  return useContext(ClearWorkspaceCacheContext)
}
