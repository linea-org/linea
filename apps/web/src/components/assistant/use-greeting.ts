import { useEffect, useState } from "react"

import { authClient } from "@/lib/auth-client"

function partOfDay(hour: number): string {
  if (hour < 5) return "Good evening"
  if (hour < 12) return "Good morning"
  return hour < 18 ? "Good afternoon" : "Good evening"
}

/** Null until the browser's clock and the signed-in name are known. */
export function useGreeting(): string | null {
  const { data: session } = authClient.useSession()
  const [greeting, setGreeting] = useState<string | null>(null)
  useEffect(() => {
    setGreeting(partOfDay(new Date().getHours()))
  }, [])
  const name = session?.user.name.trim().split(/\s+/)[0]
  if (!greeting || session === null || session === undefined) return null
  return name ? `${greeting}, ${name}` : greeting
}
