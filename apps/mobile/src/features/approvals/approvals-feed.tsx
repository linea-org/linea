import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { ChevronRightIcon } from "lucide-react-native"
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useApprovalApi } from "../../api/approval-api"
import type { ApprovalRequest } from "../../api/approval-types"
import { useMonitoringRefresh } from "../../query/use-monitoring-refresh"
import { colors } from "../../theme/colors"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../monitoring/monitoring-state"

export function ApprovalsFeed({
  userEmail,
  workspaceId,
}: {
  userEmail: string
  workspaceId: string
}) {
  const api = useApprovalApi()
  const router = useRouter()
  const query = useQuery({
    queryKey: ["approvals", workspaceId, "feed"],
    queryFn: api.listApprovals,
  })
  useMonitoringRefresh(() => void query.refetch())
  if (query.isPending) return <LoadingState label="Loading approvals" />
  if (query.isError) {
    return (
      <ErrorState
        message={query.error.message || "Could not load approvals"}
        retry={() => void query.refetch()}
      />
    )
  }
  const normalizedEmail = userEmail.toLowerCase()
  const approvals = query.data.filter(
    (approval) =>
      approval.audience === "workspace" &&
      approval.status === "pending" &&
      (!approval.approverEmails?.length ||
        approval.approverEmails.some(
          (email) => email.toLowerCase() === normalizedEmail
        ))
  )
  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={approvals}
      keyExtractor={(approval) => approval.id}
      ListEmptyComponent={
        <EmptyState
          description="Requests you are eligible to decide will appear here."
          title="Nothing pending"
        />
      }
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.accent}
        />
      }
      renderItem={({ item }) => (
        <ApprovalCard
          approval={item}
          open={() =>
            router.push({
              pathname: "/approvals/[approvalId]",
              params: { approvalId: item.id },
            })
          }
        />
      )}
    />
  )
}

function ApprovalCard({
  approval,
  open,
}: {
  approval: ApprovalRequest
  open: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={`Open approval ${approval.display.title}`}
      accessibilityRole="button"
      onPress={open}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.copy}>
        <Text style={styles.title}>{approval.display.title}</Text>
        {approval.display.description ? (
          <Text numberOfLines={2} style={styles.description}>
            {approval.display.description}
          </Text>
        ) : null}
        <Text style={styles.requested}>
          Requested {new Date(approval.createdAt).toLocaleString()}
        </Text>
      </View>
      <ChevronRightIcon color={colors.muted} size={18} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  copy: { flex: 1, gap: 6 },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  list: { gap: 10, padding: 20, paddingTop: 8 },
  pressed: { opacity: 0.7 },
  requested: { color: colors.muted, fontSize: 11 },
  title: { color: colors.text, fontSize: 16, fontWeight: "600" },
})
