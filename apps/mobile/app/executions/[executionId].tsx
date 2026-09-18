import { useLocalSearchParams, useRouter } from "expo-router"
import { useMobileAuth } from "../../src/auth/mobile-auth"
import { ExecutionDetailScreen } from "../../src/features/executions/execution-detail-screen"

export default function ExecutionDetailRoute() {
  const { executionId } = useLocalSearchParams<{ executionId: string }>()
  const router = useRouter()
  const { data: session } = useMobileAuth().useSession()
  const workspaceId = session?.session.activeOrganizationId
  if (!workspaceId) return null
  return (
    <ExecutionDetailScreen
      executionId={executionId}
      goBack={() => router.back()}
      workspaceId={workspaceId}
    />
  )
}
