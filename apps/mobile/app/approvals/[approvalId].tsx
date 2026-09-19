import { useLocalSearchParams, useRouter } from "expo-router"
import { useMobileAuth } from "../../src/auth/mobile-auth"
import { ApprovalDetailScreen } from "../../src/features/approvals/approval-detail-screen"

export default function ApprovalDetailRoute() {
  const { approvalId } = useLocalSearchParams<{ approvalId: string }>()
  const router = useRouter()
  const { data: session } = useMobileAuth().useSession()
  const workspaceId = session?.session.activeOrganizationId
  if (!workspaceId) return null
  return (
    <ApprovalDetailScreen
      approvalId={approvalId}
      goBack={() => router.back()}
      workspaceId={workspaceId}
    />
  )
}
