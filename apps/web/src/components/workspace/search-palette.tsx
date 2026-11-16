import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  BoxesIcon,
  HistoryIcon,
  HouseIcon,
  MessageSquareIcon,
  SparklesIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@linea/ui/components/command"

import { applicationsQueryOptions } from "@/lib/applications-api"
import {
  ASSISTANT_NAME,
  assistantConversationsQueryOptions,
} from "@/lib/assistant-api"
import { workflowsQueryOptions } from "@/lib/workflows-api"

type Destination = {
  label: string
  Icon: LucideIcon
  go: () => Promise<void>
}

/** Pages, Applications, Workflows and Weaver chats, filtered as you type. Loads only once opened. */
export function SearchPalette({
  slug,
  onClose,
}: {
  slug: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const applications = useQuery(applicationsQueryOptions(slug))
  const workflows = useQuery(workflowsQueryOptions(slug))
  const chats = useInfiniteQuery(assistantConversationsQueryOptions(slug, null))
  const open = (go: () => Promise<void>) => () => {
    onClose()
    void go()
  }
  const pages: Destination[] = [
    {
      label: "Home",
      Icon: HouseIcon,
      go: () => navigate({ to: "/w/$slug", params: { slug } }),
    },
    {
      label: ASSISTANT_NAME,
      Icon: SparklesIcon,
      go: () => navigate({ to: "/w/$slug/assistant", params: { slug } }),
    },
    {
      label: "Templates",
      Icon: WorkflowIcon,
      go: () => navigate({ to: "/w/$slug/templates", params: { slug } }),
    },
    {
      label: "Applications",
      Icon: BoxesIcon,
      go: () => navigate({ to: "/w/$slug/applications", params: { slug } }),
    },
    {
      label: "Workflows",
      Icon: WorkflowIcon,
      go: () => navigate({ to: "/w/$slug/workflows", params: { slug } }),
    },
    {
      label: "Executions",
      Icon: HistoryIcon,
      go: () => navigate({ to: "/w/$slug/executions", params: { slug } }),
    },
  ]
  const chatItems = [
    ...(chats.data?.pages[0]?.pinned ?? []),
    ...(chats.data?.pages.flatMap((page) => page.items) ?? []),
  ]
  return (
    <>
      <CommandInput placeholder="Search pages, workflows, chats…" />
      <CommandList>
        <CommandEmpty className="py-10">No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {pages.map(({ label, Icon, go }) => (
            <CommandItem
              key={label}
              value={`page ${label}`}
              onSelect={open(go)}
            >
              <Icon />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
        {(applications.data ?? []).length > 0 ? (
          <CommandGroup heading="Applications">
            {(applications.data ?? []).map((application) => (
              <CommandItem
                key={application.id}
                value={`application ${application.name} ${application.slug}`}
                onSelect={open(() =>
                  navigate({
                    to: "/w/$slug/applications/$applicationId",
                    params: { slug, applicationId: application.id },
                  })
                )}
              >
                <BoxesIcon />
                {application.name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {(workflows.data ?? []).length > 0 ? (
          <CommandGroup heading="Workflows">
            {(workflows.data ?? []).map((workflow) => (
              <CommandItem
                key={workflow.id}
                value={`workflow ${workflow.name} ${workflow.slug} ${workflow.id}`}
                onSelect={open(() =>
                  navigate({
                    to: "/w/$slug/workflows/$workflowId",
                    params: { slug, workflowId: workflow.id },
                  })
                )}
              >
                <WorkflowIcon />
                {workflow.name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {chatItems.length > 0 ? (
          <CommandGroup heading="Chats">
            {chatItems.map((chat) => (
              <CommandItem
                key={chat.id}
                value={`chat ${chat.title} ${chat.id}`}
                onSelect={open(() =>
                  navigate({
                    to: "/w/$slug/assistant",
                    params: { slug },
                    search: { c: chat.id },
                  })
                )}
              >
                <MessageSquareIcon />
                {chat.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </>
  )
}
