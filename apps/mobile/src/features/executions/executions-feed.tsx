import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { ChevronRightIcon } from "lucide-react-native"
import { useMemo, useState } from "react"
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useMonitoringApi } from "../../api/monitoring-api"
import type {
  ExecutionSummary,
  MonitoredExecutionStatus,
} from "../../api/monitoring-types"
import { useMonitoringRefresh } from "../../query/use-monitoring-refresh"
import { colors } from "../../theme/colors"
import { formatCost, formatDuration } from "../monitoring/format-monitoring"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../monitoring/monitoring-state"
import { StatusBadge } from "../monitoring/status-badge"

const statuses: Array<MonitoredExecutionStatus | "all"> = [
  "all",
  "running",
  "failed",
  "paused",
]
const monitoredStatuses = new Set<ExecutionSummary["status"]>([
  "running",
  "failed",
  "paused",
])

export function ExecutionsFeed({ workspaceId }: { workspaceId: string }) {
  const api = useMonitoringApi()
  const router = useRouter()
  const [status, setStatus] = useState<MonitoredExecutionStatus | "all">("all")
  const [workflowId, setWorkflowId] = useState("all")
  const query = useQuery({
    queryKey: ["monitoring", workspaceId, "executions"],
    queryFn: api.listExecutions,
  })
  useMonitoringRefresh(() => void query.refetch())
  const monitored = useMemo(
    () =>
      (query.data?.executions ?? []).filter((execution) =>
        monitoredStatuses.has(execution.status)
      ),
    [query.data]
  )
  const workflows = useMemo(
    () =>
      Array.from(
        new Map(
          monitored.map((execution) => [
            execution.workflowId,
            execution.workflowName,
          ])
        )
      ).sort((left, right) => left[1].localeCompare(right[1])),
    [monitored]
  )
  const executions = monitored.filter(
    (execution) =>
      (status === "all" || execution.status === status) &&
      (workflowId === "all" || execution.workflowId === workflowId)
  )
  if (query.isPending) return <LoadingState label="Loading executions" />
  if (query.isError) {
    return (
      <ErrorState
        message={query.error.message || "Could not load executions"}
        retry={() => void query.refetch()}
      />
    )
  }
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        contentContainerStyle={styles.filters}
        showsHorizontalScrollIndicator={false}
      >
        {statuses.map((value) => (
          <FilterChip
            key={value}
            label={value === "all" ? "All statuses" : value}
            onPress={() => setStatus(value)}
            selected={status === value}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        contentContainerStyle={styles.filters}
        showsHorizontalScrollIndicator={false}
      >
        <FilterChip
          label="All workflows"
          onPress={() => setWorkflowId("all")}
          selected={workflowId === "all"}
        />
        {workflows.map(([id, name]) => (
          <FilterChip
            key={id}
            label={name}
            onPress={() => setWorkflowId(id)}
            selected={workflowId === id}
          />
        ))}
      </ScrollView>
      <FlatList
        contentContainerStyle={styles.list}
        data={executions}
        keyExtractor={(execution) => execution.id}
        ListEmptyComponent={
          <EmptyState
            description={
              status === "all" && workflowId === "all"
                ? "Running, failed, and paused runs will appear here."
                : "Try another workflow or status filter."
            }
            title={
              status === "all" && workflowId === "all"
                ? "No active executions"
                : "No matching executions"
            }
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
          <ExecutionCard
            execution={item}
            open={() =>
              router.push({
                pathname: "/executions/[executionId]",
                params: { executionId: item.id },
              })
            }
          />
        )}
      />
    </View>
  )
}

function FilterChip({
  label,
  onPress,
  selected,
}: {
  label: string
  onPress: () => void
  selected: boolean
}) {
  return (
    <Pressable
      accessibilityLabel={`Filter: ${label}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.filter, selected && styles.filterSelected]}
    >
      <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
        {label}
      </Text>
    </Pressable>
  )
}

function ExecutionCard({
  execution,
  open,
}: {
  execution: ExecutionSummary
  open: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={`Open execution ${execution.workflowName}`}
      accessibilityRole="button"
      onPress={open}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitle}>
          <Text numberOfLines={1} style={styles.name}>
            {execution.workflowName}
          </Text>
          <Text style={styles.slug}>{execution.workflowSlug}</Text>
        </View>
        <StatusBadge status={execution.status} />
      </View>
      <View style={styles.metrics}>
        <Text style={styles.metric}>
          {formatDuration(execution.startedAt, execution.completedAt)}
        </Text>
        <Text style={styles.metric}>
          {formatCost(execution.costMicros, execution.costUnpriced === true)}
        </Text>
        <Text style={styles.metric}>{execution.trigger}</Text>
        <ChevronRightIcon color={colors.muted} size={18} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 16,
    padding: 16,
  },
  cardHeader: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  cardTitle: { flex: 1, gap: 3 },
  container: { flex: 1, gap: 10 },
  filter: {
    borderColor: colors.separator,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  filterSelected: { borderColor: colors.accent },
  filterText: {
    color: colors.muted,
    fontSize: 13,
    textTransform: "capitalize",
  },
  filterTextSelected: { color: colors.accent, fontWeight: "600" },
  filters: { gap: 8, paddingHorizontal: 20 },
  list: { gap: 10, padding: 20, paddingTop: 8 },
  metric: { color: colors.muted, fontSize: 12, textTransform: "capitalize" },
  metrics: { alignItems: "center", flexDirection: "row", gap: 14 },
  name: { color: colors.text, fontSize: 16, fontWeight: "600" },
  pressed: { opacity: 0.7 },
  slug: { color: colors.muted, fontSize: 12 },
})
