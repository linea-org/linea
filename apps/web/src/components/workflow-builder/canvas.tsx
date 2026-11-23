import { PublishTemplateDialog } from "@/components/templates/publish-template-dialog"
import { Spinner } from "@linealabs/ui/components/spinner"
import { ToolbarIconButton } from "./toolbar-icon-button"
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  ConnectionLineType,
  ConnectionMode,
  getBezierPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type ConnectionLineComponentProps,
  type Node,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTheme } from "next-themes"
import {
  nodeRegistry,
  type NodeTypeId,
  type WorkflowGraph,
} from "@linealabs/runtime/browser"
import { Button } from "@linealabs/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@linealabs/ui/components/dialog"
import { Textarea } from "@linealabs/ui/components/textarea"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@linealabs/ui/components/resizable"
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  CheckIcon,
  MessageCircleIcon,
  GitCommitHorizontalIcon,
  PlayIcon,
  Redo2Icon,
  RefreshCwIcon,
  WandSparklesIcon,
  Undo2Icon,
} from "lucide-react"
import { cn } from "@linealabs/ui/lib/utils"
import { UserAvatar } from "../account"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@linealabs/ui/components/tooltip"
import { ASSISTANT_NAME } from "@/lib/assistant-api"
import { authClient } from "@/lib/auth-client"
import { modelSettingsQueryOptions } from "@/lib/model-settings-api"
import { isWorkspaceAdmin } from "@/lib/workspace-role"
import {
  executionsQueryOptions,
  testRunFn,
  type JsonValue,
} from "@/lib/executions-api"
import { AssistantPanel } from "./assistant-panel"
import { ChatPreviewPanel } from "./chat-preview-panel"
import {
  createWorkflowVersionFn,
  publishWorkflowVersionFn,
  saveWorkflowDraftFn,
  workflowQueryOptions,
} from "@/lib/workflows-api"
import { WorkflowPalette, PALETTE_DRAG_MIME } from "./palette"
import { WorkflowTitle } from "./workflow-title"
import { NodeConfigPanel } from "./node-config-panel"
import { NodeShell } from "./node-shell"
import { RunPanel, RunPanelTrigger } from "./run-panel"
import { useOpenFirstTrace } from "./use-open-first-trace"
import { useUndoHistory } from "./use-undo-history"
import {
  useWorkflowRealtime,
  type DraftUpdatedEvent,
} from "./use-workflow-realtime"
import { isValidConnection } from "./connection-validation"
import { categoryStroke } from "./node-category-colors"
import {
  flowToGraph,
  graphToFlow,
  ensureStartNode,
  startConfigToTrigger,
  WORKFLOW_NODE_TYPE,
  type WorkflowBuilderNodeData,
} from "./graph-conversion"
import { FLOW_THEME_VARS } from "./flow-theme"

const nodeTypes: NodeTypes = { [WORKFLOW_NODE_TYPE]: NodeShell }

function defaultNodeConfig(
  nodeType: NodeTypeId,
  stepModel: string | null
): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  for (const field of nodeRegistry[nodeType].ui.fields) {
    if (field.widget !== "select" || field.showIf || !field.options?.[0]) {
      continue
    }
    const preferred =
      field.key === "model" &&
      field.options.some((option) => option.value === stepModel)
        ? stepModel
        : null
    config[field.key] = preferred ?? field.options[0].value
  }
  return config
}

const DRAFT_SAVE_DEBOUNCE_MS = 1200

function CategoryConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  fromNode,
}: ConnectionLineComponentProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  })
  const data = fromNode?.data
  const nodeType =
    data && typeof data === "object" && "nodeType" in data
      ? data.nodeType
      : undefined
  const stroke = categoryStroke(
    typeof nodeType === "string" ? nodeType : undefined
  )
  return (
    <path
      d={path}
      fill="none"
      className="react-flow__connection-path"
      style={{ stroke, strokeWidth: 2 }}
    />
  )
}

export type WorkflowBuilderGraph = {
  entryNodeId?: string
  trigger?: Record<string, unknown>
  nodes: {
    id: string
    type: string
    config?: Record<string, unknown>
    position?: { x: number; y: number }
  }[]
  edges: { from: string; to: string; condition?: string }[]
}

type WorkflowBuilderCanvasProps = {
  workflowId: string
  slug: string
  initialGraph: WorkflowBuilderGraph
  openChat: boolean
}

export function WorkflowBuilderCanvas(props: WorkflowBuilderCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function WorkflowBuilderCanvasInner({
  workflowId,
  slug,
  initialGraph,
  openChat,
}: WorkflowBuilderCanvasProps) {
  const { data: workflow } = useQuery(workflowQueryOptions(slug, workflowId))
  const { data: modelSettings } = useQuery(modelSettingsQueryOptions(slug))
  const seeded = ensureStartNode(initialGraph)
  const initial = graphToFlow(seeded)
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const entryNodeId =
    nodes.find((node) => node.data.nodeType === "start")?.id ??
    seeded.entryNodeId
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  // Which of the two right-hand panels is visible — kept as one variable, not two
  // independent booleans, so a node selection and the chat toggle can never both
  // decide to show a panel at the same time.
  const [rightPanel, setRightPanel] = useState<
    "config" | "chat" | "assistant" | null
  >(openChat ? "chat" : null)
  const { resolvedTheme } = useTheme()
  const { screenToFlowPosition } = useReactFlow<Node<WorkflowBuilderNodeData>>()
  const history = useUndoHistory({ nodes: initial.nodes, edges: initial.edges })
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nodeTypeById = new Map(
    nodes.map((n) => [n.id, n.data.nodeType] as const)
  )
  // Chat preview only makes sense for a graph with something conversational to preview — a pure
  // data-pipeline workflow (no Agent node) has nothing for it to exercise, and showing it anyway
  // just makes "which button actually runs this" ambiguous next to Test run.
  const hasAgentNode = nodes.some((n) => n.data.nodeType === "ai")
  // Closes the chat panel if it was open and the last Agent node just got deleted — its trigger
  // button has already disappeared at that point, so leaving the panel open would orphan it.
  useEffect(() => {
    if (!hasAgentNode && rightPanel === "chat") setRightPanel(null)
  }, [hasAgentNode, rightPanel])
  function buildGraph(currentEntryNodeId: string): Record<string, JsonValue> {
    const startNode = nodes.find((n) => n.data.nodeType === "start")
    return {
      version: 1,
      trigger: startConfigToTrigger(startNode?.data.config ?? {}),
      ...flowToGraph(nodes, edges, currentEntryNodeId),
    } as Record<string, JsonValue>
  }
  const saveDraft = useMutation({
    mutationFn: (graph: Record<string, JsonValue>) =>
      saveWorkflowDraftFn({ data: { id: workflowId, graph } }),
  })
  // Serializes draft saves to one in-flight request at a time — otherwise two overlapping PUTs can land out of order and an older save can overwrite newer builder state.
  const draftSaveInFlight = useRef(false)
  const pendingDraftGraph = useRef<Record<string, JsonValue> | null>(null)
  const pendingDraftGeneration = useRef(0)
  // True whenever this tab has made a local edit not yet confirmed saved — gates whether a collaborator's live update can apply straight to the canvas or has to wait for the user to say so.
  const dirtyRef = useRef(false)
  // Bumped during render, not in a passive effect — a save resolving in the post-paint gap before
  // an effect runs would otherwise see a stale generation and wrongly clear dirtyRef.
  const editGeneration = useRef(0)
  const { mutateAsync: saveDraftAsync } = saveDraft
  // "Saving…" while a save is in flight, then "Saved" for a couple seconds so the confirmation is actually visible instead of flickering past in the time it takes a fast request to round-trip.
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  )
  const savedIndicatorTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  useEffect(() => {
    return () => {
      if (savedIndicatorTimeout.current) {
        clearTimeout(savedIndicatorTimeout.current)
      }
    }
  }, [])
  const flushDraftSave = useCallback(
    async (graph: Record<string, JsonValue>, generation: number) => {
      if (draftSaveInFlight.current) {
        pendingDraftGraph.current = graph
        pendingDraftGeneration.current = generation
        return
      }
      draftSaveInFlight.current = true
      setSaveStatus("saving")
      let succeeded = false
      try {
        await saveDraftAsync(graph)
        succeeded = true
        // Only clear dirty if no edit has happened since this save was queued — comparing against the live counter, not just whether a follow-up flush already exists, is what closes the race above.
        if (editGeneration.current === generation) dirtyRef.current = false
      } finally {
        draftSaveInFlight.current = false
        const next = pendingDraftGraph.current
        const nextGeneration = pendingDraftGeneration.current
        if (next) {
          pendingDraftGraph.current = null
          void flushDraftSave(next, nextGeneration)
        } else {
          setSaveStatus(succeeded ? "saved" : "idle")
          if (succeeded) {
            if (savedIndicatorTimeout.current) {
              clearTimeout(savedIndicatorTimeout.current)
            }
            savedIndicatorTimeout.current = setTimeout(
              () => setSaveStatus("idle"),
              2000
            )
          }
        }
      }
    },
    // mutateAsync is stable across renders (TanStack Query memoizes it) — the mutation object itself isn't, and depending on it here re-triggers this callback's identity (and the debounce effect below, which lists flushDraftSave) after every save settles, causing a self-perpetuating save loop even with no further edits.
    [saveDraftAsync]
  )
  const { data: session } = authClient.useSession()
  const currentUserId = session?.user.id
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const canPublish = isWorkspaceAdmin(
    activeOrganization?.members ?? [],
    currentUserId
  )
  const [pendingRemoteUpdate, setPendingRemoteUpdate] =
    useState<DraftUpdatedEvent | null>(null)
  // Applying a collaborator's graph mutates `nodes`/`edges` the same way a local edit does — this one-shot flag tells the draft-save effect below to skip scheduling a save for that render instead of re-saving (and re-broadcasting) what was just received.
  const suppressNextSaveRef = useRef(false)
  const applyRemoteGraph = useCallback(
    (event: DraftUpdatedEvent) => {
      const remoteSeeded = ensureStartNode(
        event.graph as unknown as WorkflowBuilderGraph
      )
      const remoteFlow = graphToFlow(remoteSeeded)
      suppressNextSaveRef.current = true
      setNodes(remoteFlow.nodes)
      setEdges(remoteFlow.edges)
      history.reset({ nodes: remoteFlow.nodes, edges: remoteFlow.edges })
      dirtyRef.current = false
      setPendingRemoteUpdate(null)
    },
    [history, setNodes, setEdges]
  )
  const { viewers } = useWorkflowRealtime(workflowId, (event) => {
    if (event.savedBy.userId === currentUserId) return
    if (dirtyRef.current) {
      setPendingRemoteUpdate(event)
      return
    }
    applyRemoteGraph(event)
  })
  const otherViewers = viewers.filter((v) => v.userId !== currentUserId)
  // The run panel shows this execution, and stays open across runs — a later chat turn or
  // Test run just swaps which execution it points at, rather than closing and reopening.
  const queryClient = useQueryClient()
  const { data: recentExecutions } = useQuery(
    executionsQueryOptions(slug, workflowId)
  )
  const latestExecutionId = recentExecutions?.[0]?.id ?? null
  const [activeRunExecutionId, setActiveRunExecutionId] = useState<
    string | null
  >(null)
  const [startedRunId, setStartedRunId] = useState<string | null>(null)
  useOpenFirstTrace(slug, startedRunId, dirtyRef)
  const [runPanelOpen, setRunPanelOpen] = useState(false)
  const hasRun = (activeRunExecutionId ?? latestExecutionId) !== null
  function rememberExecution(executionId: string) {
    setActiveRunExecutionId(executionId)
    setStartedRunId(executionId)
    void queryClient.invalidateQueries({
      queryKey: executionsQueryOptions(slug, workflowId).queryKey,
    })
  }
  function toggleRunPanel() {
    if (runPanelOpen) {
      setRunPanelOpen(false)
      return
    }
    const executionId = activeRunExecutionId ?? latestExecutionId
    if (!executionId) return
    setActiveRunExecutionId(executionId)
    setRunPanelOpen(true)
  }
  const testRun = useMutation({
    mutationFn: () =>
      testRunFn({
        data: { workflowId, graph: buildGraph(entryNodeId) },
      }),
    onSuccess: (execution) => {
      rememberExecution(execution.id)
      setRunPanelOpen(true)
    },
  })
  const [paletteCollapsed, setPaletteCollapsed] = useState(false)
  const [commitDialog, setCommitDialog] = useState<"commit" | "publish" | null>(
    null
  )
  const [commitMessage, setCommitMessage] = useState("")
  const saveVersion = useMutation({
    mutationFn: (message?: string) => {
      return createWorkflowVersionFn({
        data: { id: workflowId, graph: buildGraph(entryNodeId), message },
      })
    },
  })
  const publish = useMutation({
    mutationFn: async (message?: string) => {
      const version = await saveVersion.mutateAsync(message)
      return publishWorkflowVersionFn({
        data: { id: workflowId, versionId: version.id },
      })
    },
  })
  function confirmCommit() {
    const message = commitMessage.trim() || undefined
    if (commitDialog === "commit") saveVersion.mutate(message)
    else if (commitDialog === "publish") publish.mutate(message)
    setCommitDialog(null)
    setCommitMessage("")
  }
  const pushHistory = useCallback(
    (nextNodes: typeof nodes, nextEdges: typeof edges) => {
      history.push({ nodes: nextNodes, edges: nextEdges })
    },
    [history]
  )
  // Detected during render, not the effect below, so there's no window for a settling save promise
  // to observe a stale generation. Safe under double-invocation (e.g. StrictMode) since prevNodesRef
  // is already updated by the first pass; seeded with the initial nodes/edges so mount isn't an edit.
  const prevNodesRef = useRef(nodes)
  const prevEdgesRef = useRef(edges)
  // The generation the currently-scheduled debounced save is for, so the effect below can tell a
  // real edit apart from a re-render that didn't touch identity for an edit reason.
  const scheduledGeneration = useRef(0)
  if (prevNodesRef.current !== nodes || prevEdgesRef.current !== edges) {
    prevNodesRef.current = nodes
    prevEdgesRef.current = edges
    if (suppressNextSaveRef.current) {
      suppressNextSaveRef.current = false
    } else {
      dirtyRef.current = true
      editGeneration.current += 1
    }
  }
  useEffect(() => {
    if (editGeneration.current === scheduledGeneration.current) return
    scheduledGeneration.current = editGeneration.current
    const generation = editGeneration.current
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      void flushDraftSave(buildGraph(entryNodeId), generation)
    }, DRAFT_SAVE_DEBOUNCE_MS)
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
    }
  }, [nodes, edges, entryNodeId, flushDraftSave])
  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<WorkflowBuilderNodeData>>[]) => {
      onNodesChange(
        changes.filter(
          (change) => !(change.type === "remove" && change.id === entryNodeId)
        )
      )
    },
    [onNodesChange, entryNodeId]
  )
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection, edges, nodeTypeById, entryNodeId)) {
        return
      }
      const nextEdges = addEdge(
        { ...connection, label: connection.sourceHandle ?? undefined },
        edges
      )
      setEdges(nextEdges)
      pushHistory(nodes, nextEdges)
    },
    [edges, nodes, entryNodeId, setEdges, pushHistory]
  )
  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      const nodeType = event.dataTransfer.getData(
        PALETTE_DRAG_MIME
      ) as NodeTypeId
      if (!nodeType || nodeType === "start" || !nodeRegistry[nodeType]) return
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const id = `${nodeType}-${crypto.randomUUID().slice(0, 8)}`
      const newNode: Node<WorkflowBuilderNodeData> = {
        id,
        type: WORKFLOW_NODE_TYPE,
        position,
        selected: true,
        data: {
          nodeType,
          config: defaultNodeConfig(nodeType, modelSettings?.stepModel ?? null),
        },
      }
      const nextNodes = [
        ...nodes.map((n) => ({ ...n, selected: false })),
        newNode,
      ]
      setNodes(nextNodes)
      setSelectedNodeId(id)
      setRightPanel("config")
      pushHistory(nextNodes, edges)
    },
    [nodes, edges, screenToFlowPosition, setNodes, pushHistory, modelSettings]
  )
  function applyAssistantGraph(proposal: WorkflowGraph) {
    const flow = graphToFlow(ensureStartNode(proposal))
    setNodes(flow.nodes)
    setEdges(flow.edges)
    setSelectedNodeId(null)
    pushHistory(flow.nodes, flow.edges)
  }
  function undo() {
    const snapshot = history.undo()
    if (!snapshot) return
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
  }
  function redo() {
    const snapshot = history.redo()
    if (!snapshot) return
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
  }
  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  const displayEdges = edges.map((edge) => ({
    ...edge,
    type: "default",
    style: {
      ...edge.style,
      stroke: categoryStroke(nodeTypeById.get(edge.source)),
      strokeWidth: 2,
    },
  }))
  const router = useRouter()
  const navigate = useNavigate()
  const canGoBack = useCanGoBack()
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-card">
      <div className="flex shrink-0 items-center justify-between gap-2 p-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Back"
            onClick={() => {
              if (canGoBack) router.history.back()
              else
                void navigate({
                  to: "/w/$slug/workflows/$workflowId",
                  params: { slug, workflowId },
                })
            }}
          >
            <ArrowLeftIcon />
          </Button>
          {workflow && <WorkflowTitle slug={slug} workflow={workflow} />}
        </div>
        <div className="flex items-center justify-end gap-2">
          {otherViewers.length > 0 && (
            <TooltipProvider>
              <div className="mr-1 flex -space-x-2">
                {otherViewers.slice(0, 5).map((viewer) => (
                  <Tooltip key={viewer.userId}>
                    <TooltipTrigger
                      render={
                        <span className="rounded-full ring-2 ring-card" />
                      }
                    >
                      <UserAvatar
                        name={viewer.name}
                        image={viewer.image}
                        size="sm"
                      />
                    </TooltipTrigger>
                    <TooltipContent>{viewer.name}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={undo}
            disabled={!history.canUndo()}
            aria-label="Undo"
          >
            <Undo2Icon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={redo}
            disabled={!history.canRedo()}
            aria-label="Redo"
          >
            <Redo2Icon />
          </Button>
          {saveStatus === "saving" && (
            <span className="text-sm text-muted-foreground">Saving…</span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <CheckIcon className="size-3.5" />
              Saved
            </span>
          )}
          <ToolbarIconButton
            label={ASSISTANT_NAME}
            pressed={rightPanel === "assistant"}
            onClick={() =>
              setRightPanel((current) =>
                current === "assistant" ? null : "assistant"
              )
            }
          >
            <WandSparklesIcon />
          </ToolbarIconButton>
          {hasAgentNode && (
            <ToolbarIconButton
              label="Chat preview"
              pressed={rightPanel === "chat"}
              onClick={() =>
                setRightPanel((current) => (current === "chat" ? null : "chat"))
              }
            >
              <MessageCircleIcon />
            </ToolbarIconButton>
          )}
          {workflow ? (
            <PublishTemplateDialog
              slug={slug}
              workflowId={workflowId}
              workflowName={workflow.name}
            />
          ) : null}
          <ToolbarIconButton
            label={testRun.isPending ? "Running…" : "Test run"}
            onClick={() => testRun.mutate()}
            disabled={testRun.isPending}
          >
            {testRun.isPending ? <Spinner /> : <PlayIcon />}
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Commit"
            onClick={() => setCommitDialog("commit")}
            disabled={saveVersion.isPending}
          >
            <GitCommitHorizontalIcon />
          </ToolbarIconButton>
          {canPublish ? (
            <Button
              type="button"
              onClick={() => setCommitDialog("publish")}
              disabled={publish.isPending}
            >
              Publish
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      disabled
                      focusableWhenDisabled
                      className="cursor-not-allowed opacity-50"
                    />
                  }
                >
                  Publish
                </TooltipTrigger>
                <TooltipContent>
                  Only workspace admins can publish. Commit your changes and ask
                  an admin to publish them.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      {(saveVersion.isError || publish.isError || testRun.isError) && (
        <p className="border-b border-border bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {(saveVersion.error ?? publish.error ?? testRun.error)?.message}
        </p>
      )}
      {pendingRemoteUpdate && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary px-3 py-2 text-sm">
          <span>
            <strong>{pendingRemoteUpdate.savedBy.name}</strong> made changes
            while you were editing. Reloading replaces your unsaved changes with
            theirs.
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingRemoteUpdate(null)}
            >
              Dismiss
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => applyRemoteGraph(pendingRemoteUpdate)}
            >
              <RefreshCwIcon />
              Reload
            </Button>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <WorkflowPalette
          collapsed={paletteCollapsed}
          onCollapsedChange={setPaletteCollapsed}
        />
        <ResizablePanelGroup
          orientation="horizontal"
          className={cn(
            "min-h-0 min-w-0 flex-1 pb-2 transition-all duration-500 ease-in",
            paletteCollapsed && "pl-2",
            !rightPanel && "pr-2"
          )}
        >
          <ResizablePanel id="builder-canvas" minSize={280} className="min-h-0">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-canvas">
              <ResizablePanelGroup
                orientation="vertical"
                className="min-h-0 flex-1"
              >
                <ResizablePanel
                  id="builder-canvas-flow"
                  minSize={150}
                  className="min-h-0"
                >
                  <div
                    className="h-full min-h-0"
                    style={FLOW_THEME_VARS}
                    onDrop={onDrop}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <ReactFlow
                      className="h-full [&_.react-flow__node]:overflow-visible [&_.react-flow__node]:rounded-lg [&_.react-flow__node]:bg-transparent [&_.react-flow__node]:p-0 [&_.react-flow__node]:shadow-none"
                      nodes={nodes}
                      edges={displayEdges}
                      nodeTypes={nodeTypes}
                      onNodesChange={handleNodesChange}
                      onEdgesChange={onEdgesChange}
                      onConnect={onConnect}
                      onNodeDragStop={() => pushHistory(nodes, edges)}
                      // A direct click always means "show this node's config" — unlike
                      // onSelectionChange below, it isn't re-fired by React Flow on unrelated
                      // updates while a node merely stays selected, so it can't fight the chat
                      // panel for a slot it didn't just get clicked into.
                      onNodeClick={() => setRightPanel("config")}
                      onSelectionChange={({ nodes: selected }) => {
                        setSelectedNodeId(selected[0]?.id ?? null)
                      }}
                      isValidConnection={(connection) =>
                        isValidConnection(
                          connection,
                          edges,
                          nodeTypeById,
                          entryNodeId
                        )
                      }
                      connectionMode={ConnectionMode.Loose}
                      connectOnClick
                      connectionLineType={ConnectionLineType.Bezier}
                      connectionLineComponent={CategoryConnectionLine}
                      defaultEdgeOptions={{
                        type: "default",
                        style: { strokeWidth: 2 },
                      }}
                      colorMode={resolvedTheme === "dark" ? "dark" : "light"}
                      minZoom={0.25}
                      maxZoom={1.5}
                      fitView
                      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
                      proOptions={{ hideAttribution: true }}
                      onInit={(instance) => {
                        void instance.fitView({ padding: 0.2, maxZoom: 1 })
                      }}
                    >
                      <Background gap={16} size={1} />
                      <Controls
                        showInteractive={false}
                        className="overflow-hidden rounded-lg border border-border bg-card shadow-none"
                      />
                      <MiniMap
                        pannable
                        zoomable
                        nodeBorderRadius={8}
                        nodeStrokeColor="transparent"
                        nodeColor={(node) => {
                          const data = node.data
                          const nodeType =
                            data &&
                            typeof data === "object" &&
                            "nodeType" in data
                              ? data.nodeType
                              : undefined
                          return categoryStroke(
                            typeof nodeType === "string" ? nodeType : undefined
                          )
                        }}
                        className="overflow-hidden rounded-lg border border-border"
                      />
                    </ReactFlow>
                  </div>
                </ResizablePanel>
                <div className="relative z-20 h-0 w-full shrink-0">
                  <RunPanelTrigger
                    open={runPanelOpen}
                    hasRun={hasRun}
                    onToggle={toggleRunPanel}
                  />
                </div>
                {runPanelOpen && activeRunExecutionId && (
                  <>
                    <ResizableHandle className="h-0 bg-transparent" />
                    <ResizablePanel
                      id="builder-run"
                      defaultSize={260}
                      minSize={140}
                      maxSize={560}
                      groupResizeBehavior="preserve-pixel-size"
                      className="min-h-0"
                    >
                      <RunPanel
                        key={activeRunExecutionId}
                        slug={slug}
                        workflowId={workflowId}
                        applicationId={workflow?.applicationId}
                        executionId={activeRunExecutionId}
                        onSelectExecution={setActiveRunExecutionId}
                      />
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </div>
          </ResizablePanel>
          {rightPanel === "config" && selectedNode && (
            <>
              <ResizableHandle className="w-0 bg-transparent" />
              <ResizablePanel
                id="builder-config"
                defaultSize={340}
                minSize={280}
                maxSize={640}
                groupResizeBehavior="preserve-pixel-size"
                className="min-h-0"
              >
                <NodeConfigPanel
                  key={selectedNode.id}
                  nodeType={selectedNode.data.nodeType}
                  config={selectedNode.data.config}
                  applicationId={workflow?.applicationId}
                  onClose={() => {
                    setRightPanel(null)
                    setSelectedNodeId(null)
                    setNodes((current) =>
                      current.map((n) =>
                        n.selected ? { ...n, selected: false } : n
                      )
                    )
                  }}
                  onChange={(config) => {
                    const nextNodes = nodes.map((n) =>
                      n.id === selectedNode.id
                        ? { ...n, data: { ...n.data, config } }
                        : n
                    )
                    setNodes(nextNodes)
                  }}
                />
              </ResizablePanel>
            </>
          )}
          {rightPanel === "assistant" && (
            <>
              <ResizableHandle className="w-0 bg-transparent" />
              <ResizablePanel
                id="builder-assistant"
                defaultSize={340}
                minSize={280}
                maxSize={640}
                groupResizeBehavior="preserve-pixel-size"
                className="min-h-0"
              >
                <AssistantPanel
                  slug={slug}
                  workflowId={workflowId}
                  applicationId={workflow?.applicationId}
                  graph={buildGraph(entryNodeId)}
                  onApply={applyAssistantGraph}
                  onClose={() => setRightPanel(null)}
                />
              </ResizablePanel>
            </>
          )}
          {rightPanel === "chat" && (
            <>
              <ResizableHandle className="w-0 bg-transparent" />
              <ResizablePanel
                id="builder-chat"
                defaultSize={340}
                minSize={280}
                maxSize={640}
                groupResizeBehavior="preserve-pixel-size"
                className="min-h-0"
              >
                <ChatPreviewPanel
                  slug={slug}
                  workflowId={workflowId}
                  applicationId={workflow?.applicationId}
                  graph={buildGraph(entryNodeId)}
                  onClose={() => setRightPanel(null)}
                  onExecutionStarted={rememberExecution}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
      <Dialog
        open={commitDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCommitDialog(null)
            setCommitMessage("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {commitDialog === "publish"
                ? "Publish workflow"
                : "Commit changes"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            autoFocus
            placeholder="What changed? (optional)"
            rows={3}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCommitDialog(null)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={confirmCommit}>
              {commitDialog === "publish" ? "Publish" : "Commit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
