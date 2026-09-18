import { useLocalSearchParams, useRouter } from "expo-router"
import { useMobileAuth } from "../../src/auth/mobile-auth"
import { SignalDetailScreen } from "../../src/features/signals/signal-detail-screen"

export default function SignalDetailRoute() {
  const { signalId } = useLocalSearchParams<{ signalId: string }>()
  const router = useRouter()
  const { data: session } = useMobileAuth().useSession()
  const workspaceId = session?.session.activeOrganizationId
  if (!workspaceId) return null
  return (
    <SignalDetailScreen
      goBack={() => router.back()}
      signalId={signalId}
      workspaceId={workspaceId}
    />
  )
}
