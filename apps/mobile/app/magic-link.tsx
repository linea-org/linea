import { router, useLocalSearchParams } from "expo-router"
import { MagicLinkScreen } from "../src/features/auth/magic-link-screen"

function openWorkspaces() {
  router.replace("/workspaces")
}

export default function MagicLinkRoute() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>()
  return (
    <MagicLinkScreen
      onVerified={openWorkspaces}
      token={Array.isArray(token) ? token[0] : token}
    />
  )
}
