import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Network from "expo-network"
import { ArrowLeftIcon } from "lucide-react-native"
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useApprovalApi } from "../../api/approval-api"
import type { ApprovalRequest } from "../../api/approval-types"
import { useMonitoringRefresh } from "../../query/use-monitoring-refresh"
import { colors } from "../../theme/colors"
import { ErrorState, LoadingState } from "../monitoring/monitoring-state"
import {
  resolveApprovalResult,
  unverifiedDecisionMessage,
} from "./approval-result"

export function ApprovalDetailScreen({
  approvalId,
  goBack,
  workspaceId,
}: {
  approvalId: string
  goBack: () => void
  workspaceId: string
}) {
  const api = useApprovalApi()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ["approvals", workspaceId, "detail", approvalId],
    queryFn: () => api.getApproval(approvalId),
  })
  const decision = useMutation({
    mutationFn: async (outcome: "approved" | "rejected") => {
      let network: Network.NetworkState
      try {
        network = await Network.getNetworkStateAsync()
      } catch {
        throw new Error(
          "Connectivity could not be verified. No decision was submitted."
        )
      }
      if (!network.isConnected || network.isInternetReachable === false) {
        throw new Error(
          "You are offline. Reconnect before approving or rejecting this request."
        )
      }
      let responseError: unknown
      try {
        await api.respondToApproval(approvalId, outcome)
      } catch (error) {
        responseError = error
      }
      let authoritative: ApprovalRequest
      try {
        authoritative = await api.getApproval(approvalId)
      } catch {
        throw new Error(unverifiedDecisionMessage(responseError))
      }
      return resolveApprovalResult(authoritative, outcome, responseError)
    },
    retry: false,
    onSuccess: async (result) => {
      queryClient.setQueryData(
        ["approvals", workspaceId, "detail", approvalId],
        result.approval
      )
      await queryClient.invalidateQueries({
        queryKey: ["approvals", workspaceId, "feed"],
      })
    },
  })
  const pending = query.data?.status === "pending"
  useMonitoringRefresh(() => void query.refetch(), pending || query.isPending)
  if (query.isPending) return <LoadingState label="Loading approval" />
  if (query.isError) {
    return (
      <ErrorState
        message={query.error.message || "Could not load approval"}
        retry={() => void query.refetch()}
      />
    )
  }
  const approval = query.data
  const resultMessage = decision.data?.message ?? terminalMessage(approval)
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={goBack}
          style={styles.back}
        >
          <ArrowLeftIcon color={colors.text} size={22} />
        </Pressable>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>APPROVAL REQUEST</Text>
          <Text style={styles.title}>Review decision</Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.card}>
          <Text style={styles.requestTitle}>{approval.display.title}</Text>
          {approval.display.description ? (
            <Text style={styles.description}>
              {approval.display.description}
            </Text>
          ) : null}
          {approval.display.details
            ? Object.entries(approval.display.details).map(([label, value]) => (
                <View key={label} style={styles.detail}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={styles.detailValue}>{value}</Text>
                </View>
              ))
            : null}
        </View>
        {resultMessage ? (
          <Text accessibilityRole="alert" style={styles.result}>
            {resultMessage}
          </Text>
        ) : null}
        {decision.isError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {decision.error.message}
          </Text>
        ) : null}
        {approval.status === "pending" ? (
          <View style={styles.actions}>
            <DecisionButton
              disabled={decision.isPending}
              label={decision.isPending ? "Submitting..." : "Approve"}
              onPress={() => decision.mutate("approved")}
              primary
            />
            <DecisionButton
              disabled={decision.isPending}
              label="Reject"
              onPress={() => decision.mutate("rejected")}
              primary={false}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

function terminalMessage(approval: ApprovalRequest) {
  if (approval.status === "pending") return undefined
  if (approval.timedOut) {
    return `This request timed out and was automatically ${approval.status}.`
  }
  if (approval.status === "cancelled") return "This request was cancelled."
  return `This request was already ${approval.status}.`
}

function DecisionButton({
  disabled,
  label,
  onPress,
  primary,
}: {
  disabled: boolean
  label: string
  onPress: () => void
  primary: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary ? styles.actionPrimary : styles.actionSecondary,
        (pressed || disabled) && styles.actionPressed,
      ]}
    >
      <Text style={primary ? styles.actionPrimaryText : styles.actionText}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    borderColor: colors.accent,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  actionPressed: { opacity: 0.55 },
  actionPrimary: { backgroundColor: colors.accent },
  actionPrimaryText: { color: colors.canvas, fontSize: 15, fontWeight: "700" },
  actionSecondary: { backgroundColor: colors.surface },
  actionText: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 12 },
  back: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
    padding: 18,
  },
  content: { gap: 16, padding: 20 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  detail: { gap: 4 },
  detailLabel: { color: colors.muted, fontSize: 11 },
  detailValue: { color: colors.text, fontSize: 14 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    padding: 20,
    paddingTop: 56,
  },
  heading: { flex: 1, gap: 4 },
  requestTitle: { color: colors.text, fontSize: 22, fontWeight: "700" },
  result: { color: colors.success, fontSize: 13, lineHeight: 19 },
  screen: { backgroundColor: colors.canvas, flex: 1 },
  title: { color: colors.text, fontSize: 20, fontWeight: "700" },
})
