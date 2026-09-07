import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useMobileAuth, type Workspace } from "../../auth/mobile-auth"
import { authErrorMessage } from "../../lib/auth-error"
import { colors } from "../../theme/colors"
import { CreateWorkspaceForm } from "./create-workspace-form"

export function WorkspacesScreen() {
  const auth = useMobileAuth()
  const { data: session } = auth.useSession()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeId, setActiveId] = useState<string | null>(
    session?.session.activeOrganizationId ?? null
  )
  const [pendingId, setPendingId] = useState<string>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setLoadFailed(false)
      setError(undefined)
      try {
        const result = await auth.listWorkspaces()
        if (!active) return
        if (result.error) {
          setError(
            authErrorMessage(result.error, "Could not load your workspaces")
          )
          setLoadFailed(true)
          setLoading(false)
          return
        }
        setWorkspaces(result.data ?? [])
        setLoading(false)
      } catch (loadError) {
        if (!active) return
        setError(authErrorMessage(loadError, "Could not load your workspaces"))
        setLoadFailed(true)
        setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [auth, loadAttempt])
  async function createWorkspace(input: { name: string; slug: string }) {
    setError(undefined)
    try {
      const creation = await auth.createWorkspace(input)
      if (creation.error) {
        setError(authErrorMessage(creation.error, "Could not create workspace"))
        return
      }
      if (!creation.data) {
        setError("Could not create workspace")
        return
      }
      setWorkspaces([creation.data])
      setPendingId(creation.data.id)
      const activation = await auth.setActiveWorkspace(creation.data.id)
      setPendingId(undefined)
      if (activation.error) {
        setError(
          authErrorMessage(activation.error, "Could not activate workspace")
        )
        return
      }
      setActiveId(creation.data.id)
    } catch (creationError) {
      setPendingId(undefined)
      setError(authErrorMessage(creationError, "Could not create workspace"))
    }
  }
  async function selectWorkspace(workspace: Workspace) {
    if (workspace.id === activeId || pendingId) return
    setError(undefined)
    setPendingId(workspace.id)
    try {
      const result = await auth.setActiveWorkspace(workspace.id)
      setPendingId(undefined)
      if (result.error) {
        setError(authErrorMessage(result.error, "Could not switch workspace"))
        return
      }
      setActiveId(workspace.id)
    } catch (switchError) {
      setPendingId(undefined)
      setError(authErrorMessage(switchError, "Could not switch workspace"))
    }
  }
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeId
  )
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>SIGNED IN AS {session?.user.name}</Text>
        <Text style={styles.title}>Workspaces</Text>
        <Text style={styles.description}>
          Choose the workspace you want to monitor.
        </Text>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {loading ? (
        <ActivityIndicator color={colors.accent} size="large" />
      ) : loadFailed ? (
        <ActionButton
          label="Try again"
          onPress={() => setLoadAttempt((attempt) => attempt + 1)}
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={workspaces}
          keyExtractor={(workspace) => workspace.id}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.description}>
                You do not belong to a workspace yet.
              </Text>
              <CreateWorkspaceForm onSubmit={createWorkspace} />
            </View>
          }
          renderItem={({ item }) => {
            const selected = item.id === activeId
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: !!pendingId }}
                disabled={!!pendingId}
                onPress={() => void selectWorkspace(item)}
                style={({ pressed }) => [
                  styles.workspace,
                  selected && styles.workspaceSelected,
                  pressed && styles.workspacePressed,
                ]}
              >
                <View style={styles.workspaceCopy}>
                  <Text style={styles.workspaceName}>{item.name}</Text>
                  <Text style={styles.workspaceSlug}>{item.slug}</Text>
                </View>
                <Text style={styles.workspaceState}>
                  {pendingId === item.id
                    ? "Switching..."
                    : selected
                      ? "Current"
                      : "Open"}
                </Text>
              </Pressable>
            )
          }}
        />
      )}
      {activeWorkspace ? (
        <Text style={styles.current}>
          Current workspace: {activeWorkspace.name}
        </Text>
      ) : null}
    </View>
  )
}

function ActionButton({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        pressed && styles.workspacePressed,
      ]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    borderColor: colors.accent,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  actionText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  container: {
    backgroundColor: colors.canvas,
    flex: 1,
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 64,
  },
  current: {
    color: colors.muted,
    fontSize: 13,
    paddingBottom: 24,
    textAlign: "center",
  },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 14 },
  empty: { gap: 16, paddingTop: 12 },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  header: { gap: 8 },
  list: { gap: 10 },
  title: { color: colors.text, fontSize: 30, fontWeight: "700" },
  workspace: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  workspaceCopy: { flex: 1, gap: 4 },
  workspaceName: { color: colors.text, fontSize: 17, fontWeight: "600" },
  workspacePressed: { opacity: 0.7 },
  workspaceSelected: { borderColor: colors.accent, borderWidth: 1 },
  workspaceSlug: { color: colors.muted, fontSize: 13 },
  workspaceState: { color: colors.accent, fontSize: 13, fontWeight: "600" },
})
