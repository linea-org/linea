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

export function WorkspacesScreen() {
  const auth = useMobileAuth()
  const { data: session } = auth.useSession()
  const [workspaces, setWorkspaces] = useState<Workspace[]>()
  const [activeId, setActiveId] = useState<string | null>(
    session?.session.activeOrganizationId ?? null
  )
  const [pendingId, setPendingId] = useState<string>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let active = true
    async function load() {
      const result = await auth.listWorkspaces()
      if (!active) return
      if (result.error) {
        setError(
          authErrorMessage(result.error, "Could not load your workspaces")
        )
        return
      }
      setWorkspaces(result.data ?? [])
    }
    void load()
    return () => {
      active = false
    }
  }, [auth])
  async function selectWorkspace(workspace: Workspace) {
    if (workspace.id === activeId || pendingId) return
    setError(undefined)
    setPendingId(workspace.id)
    const result = await auth.setActiveWorkspace(workspace.id)
    setPendingId(undefined)
    if (result.error) {
      setError(authErrorMessage(result.error, "Could not switch workspace"))
      return
    }
    setActiveId(workspace.id)
  }
  const activeWorkspace = workspaces?.find(
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
      {!workspaces ? (
        <ActivityIndicator color={colors.accent} size="large" />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={workspaces}
          keyExtractor={(workspace) => workspace.id}
          ListEmptyComponent={
            <Text style={styles.description}>No workspaces found.</Text>
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

const styles = StyleSheet.create({
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
