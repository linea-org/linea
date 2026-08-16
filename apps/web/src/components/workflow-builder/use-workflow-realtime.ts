import { useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"

import { mintWorkflowRealtimeTokenFn } from "../../lib/workflows-api"

export type PresenceViewer = {
  userId: string
  name: string
  image: string | null
}

export type DraftUpdatedEvent = {
  graph: Record<string, unknown>
  updatedAt: string
  savedBy: { userId: string; name: string }
}

const API_URL =
  import.meta.env.VITE_API_URL.replace(/\/$/, "") || "http://localhost:3000"

/** Presence + live draft sync for the builder, over a socket.io connection scoped to one workflow's room. Auth is a short-lived token minted per (re)connect attempt via an authenticated REST call — see RealtimeTokenService for why a token rather than the session cookie. */
export function useWorkflowRealtime(
  workflowId: string,
  onDraftUpdated: (event: DraftUpdatedEvent) => void
) {
  const [viewers, setViewers] = useState<PresenceViewer[]>([])
  const [connected, setConnected] = useState(false)
  const onDraftUpdatedRef = useRef(onDraftUpdated)
  onDraftUpdatedRef.current = onDraftUpdated

  useEffect(() => {
    const socket: Socket = io(`${API_URL}/workflows`, {
      withCredentials: true,
      transports: ["websocket"],
      // Re-evaluated on every connection attempt, including automatic reconnects, so an expired token doesn't strand the socket disconnected.
      auth: (cb) => {
        mintWorkflowRealtimeTokenFn({ data: { id: workflowId } })
          .then(({ token }) => cb({ token }))
          .catch(() => cb({}))
      },
    })

    socket.on("connect", () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))
    socket.on("presence", (payload: PresenceViewer[]) => setViewers(payload))
    socket.on("draft:updated", (payload: DraftUpdatedEvent) => {
      onDraftUpdatedRef.current(payload)
    })

    return () => {
      socket.disconnect()
      setViewers([])
      setConnected(false)
    }
  }, [workflowId])

  return { viewers, connected }
}
