import { useQuery } from "@tanstack/react-query"
import { ArrowLeftIcon } from "lucide-react-native"
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useMonitoringApi } from "../../api/monitoring-api"
import type { ExecutionStep } from "../../api/monitoring-types"
import { useMonitoringRefresh } from "../../query/use-monitoring-refresh"
import { colors } from "../../theme/colors"
import { formatCost, formatDuration } from "../monitoring/format-monitoring"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../monitoring/monitoring-state"
import { StatusBadge } from "../monitoring/status-badge"

export function ExecutionDetailScreen({
  executionId,
  goBack,
  workspaceId,
}: {
  executionId: string
  goBack: () => void
  workspaceId: string
}) {
  const api = useMonitoringApi()
  const query = useQuery({
    queryKey: ["monitoring", workspaceId, "execution", executionId],
    queryFn: () => api.getExecution(executionId),
  })
  const polling =
    query.data?.execution.status === "running" ||
    query.data?.execution.status === "paused"
  useMonitoringRefresh(() => void query.refetch(), polling || query.isPending)
  if (query.isPending) return <LoadingState label="Loading execution" />
  if (query.isError) {
    return (
      <ErrorState
        message={query.error.message || "Could not load execution"}
        retry={() => void query.refetch()}
      />
    )
  }
  const { execution, steps } = query.data
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
        <View style={styles.titleCopy}>
          <Text style={styles.title}>Execution</Text>
          <Text numberOfLines={1} style={styles.id}>
            {execution.id}
          </Text>
        </View>
        <StatusBadge status={execution.status} />
      </View>
      <View style={styles.stats}>
        <Stat
          label="Duration"
          value={formatDuration(execution.startedAt, execution.completedAt)}
        />
        <Stat
          label="Cost"
          value={formatCost(
            execution.costMicros,
            execution.costUnpriced === true
          )}
        />
        <Stat label="Environment" value={execution.environment} />
      </View>
      {execution.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {execution.error.message}
        </Text>
      ) : null}
      <Text style={styles.sectionTitle}>Steps</Text>
      <FlatList
        contentContainerStyle={styles.steps}
        data={[...steps].sort((left, right) => left.sequence - right.sequence)}
        keyExtractor={(step) => step.id}
        ListEmptyComponent={
          <EmptyState
            description="This execution has not recorded a step yet."
            title="No steps recorded"
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.accent}
          />
        }
        renderItem={({ item }) => <StepRow step={item} />}
      />
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
    </View>
  )
}

function StepRow({ step }: { step: ExecutionStep }) {
  return (
    <View style={styles.step}>
      <View style={styles.timeline} />
      <View style={styles.stepCopy}>
        <View style={styles.stepHeading}>
          <Text style={styles.stepName}>{step.name}</Text>
          <StatusBadge status={step.status} />
        </View>
        <Text style={styles.stepMeta}>
          {formatDuration(step.startedAt, step.endedAt)} ·{" "}
          {formatCost(step.costMicros)}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  back: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    padding: 20,
    paddingTop: 56,
  },
  id: { color: colors.muted, fontFamily: "monospace", fontSize: 11 },
  screen: { backgroundColor: colors.canvas, flex: 1 },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  stat: { flex: 1, gap: 4, minWidth: 0, padding: 12 },
  statLabel: { color: colors.muted, fontSize: 11 },
  statValue: { color: colors.text, fontSize: 13, textTransform: "capitalize" },
  stats: {
    backgroundColor: colors.surface,
    flexDirection: "row",
    marginHorizontal: 20,
  },
  step: { flexDirection: "row", gap: 12 },
  stepCopy: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    flex: 1,
    gap: 8,
    padding: 14,
  },
  stepHeading: { alignItems: "center", flexDirection: "row", gap: 10 },
  stepMeta: { color: colors.muted, fontSize: 12 },
  stepName: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "600" },
  steps: { gap: 10, padding: 20, paddingTop: 12 },
  timeline: { backgroundColor: colors.separator, borderRadius: 2, width: 3 },
  title: { color: colors.text, fontSize: 20, fontWeight: "700" },
  titleCopy: { flex: 1, gap: 3, minWidth: 0 },
})
