import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  BellIcon,
  BookOpenIcon,
  BoxesIcon,
  BotIcon,
  CircleCheckIcon,
  HistoryIcon,
  HouseIcon,
  KeyRoundIcon,
  KeySquareIcon,
  LayoutTemplateIcon,
  MessageSquareIcon,
  MoonIcon,
  SettingsIcon,
  WandSparklesIcon,
  SunIcon,
  UserIcon,
  UsersIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"
import { useTheme } from "next-themes"

import {
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@linealabs/ui/components/command"

import { PlayfulAvatar } from "../avatar"
import { applicationsQueryOptions } from "@/lib/applications-api"
import {
  ASSISTANT_NAME,
  assistantConversationsQueryOptions,
} from "@/lib/assistant-api"
import { setActiveOrganization } from "@/lib/auth-queries"
import { workflowsQueryOptions } from "@/lib/workflows-api"
import type { WorkspaceOption } from "./workspace-switcher"

type GroupProps = {
  slug: string
  run: (action: () => unknown) => void
  searching: boolean
}

/** With nothing typed, each group lists only its first few items. */
const IDLE_LIMIT = 5

function shown<T>(items: T[], searching: boolean) {
  return searching ? items : items.slice(0, IDLE_LIMIT)
}

const pages: Array<{
  label: string
  icon: LucideIcon
  to:
    | "/w/$slug"
    | "/w/$slug/assistant"
    | "/w/$slug/templates"
    | "/w/$slug/applications"
    | "/w/$slug/workflows"
    | "/w/$slug/executions"
    | "/w/$slug/approvals"
    | "/w/$slug/notifications"
    | "/w/$slug/settings/members"
    | "/w/$slug/settings/secrets"
    | "/w/$slug/settings/api-keys"
    | "/w/$slug/settings"
  keywords: string[]
}> = [
  { label: "Home", icon: HouseIcon, to: "/w/$slug", keywords: ["dashboard"] },
  {
    label: ASSISTANT_NAME,
    icon: WandSparklesIcon,
    to: "/w/$slug/assistant",
    keywords: ["assistant", "chat", "weaver"],
  },

  {
    label: "Applications",
    icon: BoxesIcon,
    to: "/w/$slug/applications",
    keywords: ["apps", "agents"],
  },
  {
    label: "Workflows",
    icon: WorkflowIcon,
    to: "/w/$slug/workflows",
    keywords: ["flows"],
  },
  {
    label: "Executions",
    icon: HistoryIcon,
    to: "/w/$slug/executions",
    keywords: ["runs", "history"],
  },
  {
    label: "Templates",
    icon: LayoutTemplateIcon,
    to: "/w/$slug/templates",
    keywords: ["starter", "community"],
  },
  {
    label: "Approvals",
    icon: CircleCheckIcon,
    to: "/w/$slug/approvals",
    keywords: ["review"],
  },
  {
    label: "Notifications",
    icon: BellIcon,
    to: "/w/$slug/notifications",
    keywords: ["inbox"],
  },
  {
    label: "Members",
    icon: UsersIcon,
    to: "/w/$slug/settings/members",
    keywords: ["team", "invite"],
  },
  {
    label: "Secrets",
    icon: KeyRoundIcon,
    to: "/w/$slug/settings/secrets",
    keywords: ["keys", "env"],
  },
  {
    label: "API keys",
    icon: KeySquareIcon,
    to: "/w/$slug/settings/api-keys",
    keywords: ["token", "sdk", "access"],
  },
  {
    label: "Settings",
    icon: SettingsIcon,
    to: "/w/$slug/settings",
    keywords: ["workspace", "preferences"],
  },
]

export function PagesGroup({ slug, run, searching }: Readonly<GroupProps>) {
  const navigate = useNavigate()
  return (
    <CommandGroup heading="Pages">
      {shown(pages, searching).map((page) => (
        <CommandItem
          key={page.to}
          value={`page ${page.label}`}
          keywords={page.keywords}
          onSelect={() =>
            run(() => navigate({ to: page.to, params: { slug } }))
          }
        >
          <page.icon />
          {page.label}
        </CommandItem>
      ))}
      {searching ? (
        <CommandItem
          value="page Account"
          keywords={["profile", "sessions"]}
          onSelect={() =>
            run(() => navigate({ to: "/w/$slug/account", params: { slug } }))
          }
        >
          <UserIcon />
          Account
        </CommandItem>
      ) : null}
    </CommandGroup>
  )
}

export function WorkflowsGroup({ slug, run, searching }: Readonly<GroupProps>) {
  const navigate = useNavigate()
  const { data } = useQuery(workflowsQueryOptions(slug))
  const applications = useQuery(applicationsQueryOptions(slug))
  const applicationNames = new Map(
    (applications.data ?? []).map((application) => [
      application.id,
      application.name,
    ])
  )
  const workflows = data?.filter((workflow) => !workflow.archivedAt) ?? []
  if (workflows.length === 0) return null
  return (
    <CommandGroup heading="Workflows">
      {shown(workflows, searching).map((workflow) => (
        <CommandItem
          key={workflow.id}
          value={`workflow ${workflow.name} ${workflow.id}`}
          keywords={[
            workflow.slug,
            applicationNames.get(workflow.applicationId) ?? "",
          ]}
          onSelect={() =>
            run(() =>
              navigate({
                to: "/w/$slug/workflows/$workflowId",
                params: { slug, workflowId: workflow.id },
              })
            )
          }
        >
          <WorkflowIcon />
          <span className="truncate">{workflow.name}</span>
          <CommandShortcut className="truncate tracking-normal">
            {applicationNames.get(workflow.applicationId)}
          </CommandShortcut>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

export function ApplicationsGroup({
  slug,
  run,
  searching,
}: Readonly<GroupProps>) {
  const navigate = useNavigate()
  const { data } = useQuery(applicationsQueryOptions(slug))
  if (!data?.length) return null
  return (
    <CommandGroup heading="Applications">
      {shown(data, searching).map((application) => (
        <CommandItem
          key={application.id}
          value={`application ${application.name} ${application.id}`}
          keywords={[application.slug]}
          onSelect={() =>
            run(() =>
              navigate({
                to: "/w/$slug/applications/$applicationId",
                params: { slug, applicationId: application.id },
              })
            )
          }
        >
          <BoxesIcon />
          <span className="truncate">{application.name}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

export function ChatsGroup({ slug, run, searching }: Readonly<GroupProps>) {
  const navigate = useNavigate()
  const { data } = useInfiniteQuery(
    assistantConversationsQueryOptions(slug, null)
  )
  const chats = [
    ...(data?.pages[0]?.pinned ?? []),
    ...(data?.pages.flatMap((page) => page.items) ?? []),
  ]
  if (chats.length === 0) return null
  return (
    <CommandGroup heading="Chats">
      {shown(chats, searching).map((chat) => (
        <CommandItem
          key={chat.id}
          value={`chat ${chat.title} ${chat.id}`}
          onSelect={() =>
            run(() =>
              navigate({
                to: "/w/$slug/assistant",
                params: { slug },
                search: { c: chat.id },
              })
            )
          }
        >
          <MessageSquareIcon />
          <span className="truncate">{chat.title}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

export function ActionsGroup({ slug, run }: Readonly<GroupProps>) {
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  return (
    <CommandGroup heading="Actions">
      <CommandItem
        value="action Add Agent"
        keywords={["new", "create"]}
        onSelect={() =>
          run(() => navigate({ to: "/w/$slug/agents/new", params: { slug } }))
        }
      >
        <BotIcon />
        Add Agent
      </CommandItem>
      <CommandItem
        value="action Toggle theme"
        keywords={["dark", "light", "mode", "appearance"]}
        onSelect={() => run(() => setTheme(isDark ? "light" : "dark"))}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
        Switch to {isDark ? "light" : "dark"} theme
      </CommandItem>
      <CommandItem
        value="action Documentation"
        keywords={["help", "docs", "learn"]}
        onSelect={() =>
          run(() =>
            window.open(
              "https://docs.getlinea.app",
              "_blank",
              "noopener,noreferrer"
            )
          )
        }
      >
        <BookOpenIcon />
        Open documentation
      </CommandItem>
    </CommandGroup>
  )
}

export function WorkspacesGroup({
  slug,
  run,
  searching,
  workspaces,
}: Readonly<GroupProps & { workspaces: WorkspaceOption[] }>) {
  const navigate = useNavigate()
  const others = workspaces.filter((workspace) => workspace.slug !== slug)
  if (others.length === 0) return null
  async function switchTo(workspace: WorkspaceOption) {
    await setActiveOrganization(workspace.id)
    await navigate({ to: "/w/$slug", params: { slug: workspace.slug } })
  }
  return (
    <CommandGroup heading="Switch workspace">
      {shown(others, searching).map((workspace) => (
        <CommandItem
          key={workspace.id}
          value={`workspace ${workspace.name} ${workspace.slug}`}
          onSelect={() => run(() => switchTo(workspace))}
        >
          <PlayfulAvatar
            name={workspace.name}
            shape="rounded"
            className="size-4"
          />
          <span className="truncate">{workspace.name}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
