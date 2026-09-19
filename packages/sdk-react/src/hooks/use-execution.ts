import { useCallback, useEffect, useRef, useState } from "react"
import type { PublicExecution } from "@linea/sdk/user"
import { useLineaUserClient } from "../provider/linea-user-provider.js"

export type ExecutionState = {
  execution: PublicExecution | undefined
  isLoading: boolean
  error: unknown
  refresh: () => Promise<void>
}

export function useExecution(executionId: string): ExecutionState {
  const client = useLineaUserClient()
  const generation = useRef(0)
  const [execution, setExecution] = useState<PublicExecution>()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<unknown>()
  const refresh = useCallback(async () => {
    const currentGeneration = ++generation.current
    setIsLoading(true)
    setError(undefined)
    try {
      const handle = await client.getExecution(executionId)
      if (generation.current === currentGeneration) setExecution(handle.current)
    } catch (cause) {
      if (generation.current === currentGeneration) setError(cause)
    } finally {
      if (generation.current === currentGeneration) setIsLoading(false)
    }
  }, [client, executionId])
  useEffect(() => {
    void refresh()
    return () => {
      generation.current += 1
    }
  }, [refresh])
  return { execution, isLoading, error, refresh }
}
