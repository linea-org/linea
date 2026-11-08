import { useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  CopyIcon,
  MoreHorizontalIcon,
  SearchIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@linea/ui/components/alert-dialog"
import { Button, buttonVariants } from "@linea/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@linea/ui/components/popover"
import { cn } from "@linea/ui/lib/utils"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"

import { UserAvatar } from "@/components/account/user-avatar"
import { InviteMemberDialog } from "@/components/members"
import { PageToolbar } from "@/components/workspace/page-toolbar"
import { ToolbarSearch } from "@/components/workspace/toolbar-search"
import { authClient } from "@/lib/auth-client"
import {
  cancelInvitation,
  inviteMembers,
  removeMember,
  updateMemberRole,
} from "@/lib/auth-queries"
import { formatDate } from "@/lib/format"

export const Route = createFileRoute("/w/$slug/settings/members")({
  component: MembersPage,
})

const ROLE_OPTIONS = [
  { label: "Member", value: "member" },
  { label: "Admin", value: "admin" },
] as const

function roleLabel(role: string) {
  if (role === "owner") return "Owner"
  if (role === "admin") return "Admin"
  return "Member"
}

function RowOptions({
  label,
  copyValue,
  removeLabel,
  onRemove,
}: {
  label: string
  copyValue: string
  removeLabel?: string
  onRemove?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-xs" }),
          "rounded-md"
        )}
        aria-label={`Options for ${label}`}
      >
        <MoreHorizontalIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 gap-0 p-1">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/40"
          onClick={() => {
            void navigator.clipboard.writeText(copyValue)
            setOpen(false)
          }}
        >
          <CopyIcon className="size-3.5" />
          Copy email
        </button>
        {removeLabel && onRemove ? (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-destructive hover:bg-muted/40"
            onClick={() => {
              setOpen(false)
              onRemove()
            }}
          >
            <Trash2Icon className="size-3.5" />
            {removeLabel}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

type ConfirmTarget =
  | { kind: "member"; id: string; label: string }
  | { kind: "invite"; id: string; label: string }

function confirmTitle(target: ConfirmTarget) {
  switch (target.kind) {
    case "member":
      return `Remove ${target.label}?`
    case "invite":
      return `Cancel invite to ${target.label}?`
    default: {
      const exhaustive: never = target
      return exhaustive
    }
  }
}

function confirmDescription(target: ConfirmTarget) {
  switch (target.kind) {
    case "member":
      return "They'll lose access to this workspace immediately."
    case "invite":
      return "The invite link will stop working."
    default: {
      const exhaustive: never = target
      return exhaustive
    }
  }
}

function MembersPage() {
  const { data: session } = authClient.useSession()
  const {
    data: activeOrg,
    isPending,
    refetch,
  } = authClient.useActiveOrganization()
  const [search, setSearch] = useState("")
  const [inviteOpen, setInviteOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null)
  const invite = useMutation({
    mutationFn: (input: { email: string; role: "member" | "admin" }) =>
      inviteMembers([input.email.trim()], input.role),
    onSuccess: () => refetch(),
  })
  const changeRole = useMutation({
    mutationFn: (input: { memberId: string; role: "member" | "admin" }) =>
      updateMemberRole(input.memberId, input.role),
    onSuccess: () => refetch(),
  })
  const remove = useMutation({
    mutationFn: (memberId: string) => removeMember(memberId),
    onSuccess: async () => {
      setConfirmTarget(null)
      await refetch()
    },
  })
  const cancelInvite = useMutation({
    mutationFn: (invitationId: string) => cancelInvitation(invitationId),
    onSuccess: async () => {
      setConfirmTarget(null)
      await refetch()
    },
  })
  const members = activeOrg?.members ?? []
  const pendingInvitations = (activeOrg?.invitations ?? []).filter(
    (invitation) => invitation.status === "pending"
  )
  const query = search.trim().toLowerCase()
  const filteredMembers = useMemo(() => {
    if (!query) return members
    return members.filter((member) => {
      return (
        member.user.name.toLowerCase().includes(query) ||
        member.user.email.toLowerCase().includes(query)
      )
    })
  }, [members, query])
  const filteredInvites = useMemo(() => {
    if (!query) return pendingInvitations
    return pendingInvitations.filter((invitation) =>
      invitation.email.toLowerCase().includes(query)
    )
  }, [pendingInvitations, query])
  const confirmPending =
    confirmTarget?.kind === "member" ? remove.isPending : cancelInvite.isPending
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <PageToolbar>
        <ToolbarSearch
          value={search}
          onChange={setSearch}
          placeholder="Search members"
        />
        <div className="ml-auto">
          <Button size="xs" onClick={() => setInviteOpen(true)}>
            <UserPlusIcon />
            Invite
          </Button>
        </div>
      </PageToolbar>
      {isPending ? (
        <p className="px-4 py-8 text-xs text-muted-foreground">Loading…</p>
      ) : filteredMembers.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {query ? <SearchIcon /> : <UsersIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {query ? "No matching members" : "No members yet"}
            </EmptyTitle>
            <EmptyDescription>
              {query
                ? "Try a different search."
                : "Invite someone to this workspace."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="px-4 py-2">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 font-normal text-muted-foreground">
                    Member
                  </TableHead>
                  <TableHead className="px-4 font-normal text-muted-foreground">
                    Role
                  </TableHead>
                  <TableHead className="px-4 font-normal text-muted-foreground">
                    Joined
                  </TableHead>
                  <TableHead className="w-12 px-2">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => {
                  const isSelf = member.userId === session?.user.id
                  const isOwner = member.role === "owner"
                  return (
                    <TableRow key={member.id} className="hover:bg-muted/40">
                      <TableCell className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar
                            name={member.user.name}
                            email={member.user.email}
                            image={member.user.image}
                            className="size-8"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">
                              {member.user.name}
                              {isSelf ? (
                                <span className="ml-2 font-normal text-muted-foreground">
                                  You
                                </span>
                              ) : null}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {member.user.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {isOwner ? (
                          roleLabel(member.role)
                        ) : (
                          <Select
                            value={member.role}
                            onValueChange={(value) => {
                              if (value === "member" || value === "admin") {
                                changeRole.mutate({
                                  memberId: member.id,
                                  role: value,
                                })
                              }
                            }}
                          >
                            <SelectTrigger size="sm" className="w-28">
                              <SelectValue>
                                {() => roleLabel(member.role)}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {ROLE_OPTIONS.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                        {formatDate(member.createdAt)}
                      </TableCell>
                      <TableCell className="px-2 py-3 text-right">
                        <RowOptions
                          label={member.user.name}
                          copyValue={member.user.email}
                          removeLabel={
                            !isOwner && !isSelf ? "Remove" : undefined
                          }
                          onRemove={
                            !isOwner && !isSelf
                              ? () =>
                                  setConfirmTarget({
                                    kind: "member",
                                    id: member.id,
                                    label: member.user.name,
                                  })
                              : undefined
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {filteredInvites.length > 0 ? (
        <>
          <p className="px-4 pt-6 pb-2 text-xs font-medium text-foreground">
            Pending invitations
          </p>
          <div className="px-4 pb-2">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4 font-normal text-muted-foreground">
                      Invitation
                    </TableHead>
                    <TableHead className="px-4 font-normal text-muted-foreground">
                      Role
                    </TableHead>
                    <TableHead className="px-4 font-normal text-muted-foreground">
                      Expires
                    </TableHead>
                    <TableHead className="w-12 px-2">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvites.map((invitation) => (
                    <TableRow key={invitation.id} className="hover:bg-muted/40">
                      <TableCell className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar
                            email={invitation.email}
                            className="size-8"
                          />
                          <p className="truncate text-xs font-medium">
                            {invitation.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {roleLabel(invitation.role ?? "member")}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                        {invitation.expiresAt
                          ? formatDate(invitation.expiresAt)
                          : "—"}
                      </TableCell>
                      <TableCell className="px-2 py-3 text-right">
                        <RowOptions
                          label={invitation.email}
                          copyValue={invitation.email}
                          removeLabel="Cancel invite"
                          onRemove={() =>
                            setConfirmTarget({
                              kind: "invite",
                              id: invitation.id,
                              label: invitation.email,
                            })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      ) : null}
      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSubmit={(input) => invite.mutateAsync(input)}
      />
      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget ? confirmTitle(confirmTarget) : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget ? confirmDescription(confirmTarget) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmTarget) return
                if (confirmTarget.kind === "member") {
                  remove.mutate(confirmTarget.id)
                  return
                }
                cancelInvite.mutate(confirmTarget.id)
              }}
              disabled={confirmPending}
            >
              {confirmTarget?.kind === "invite" ? "Cancel invite" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
