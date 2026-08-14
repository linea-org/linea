import { useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  EllipsisVerticalIcon,
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
import { Badge } from "@linea/ui/components/badge"
import { Button } from "@linea/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@linea/ui/components/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"

import { InviteMemberDialog } from "../../../../components/members"
import { authClient } from "../../../../lib/auth-client"
import {
  cancelInvitation,
  inviteMembers,
  removeMember,
  updateMemberRole,
} from "../../../../lib/auth-queries"

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
    <main className="flex flex-1 flex-col px-6 py-6 sm:px-8">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <InputGroup className="h-8 max-w-sm rounded-lg border-input/30 bg-input/30 shadow-none">
          <InputGroupAddon>
            <SearchIcon className="size-4 shrink-0 opacity-50" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search members"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlusIcon />
            Invite
          </Button>
        </div>
      </div>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
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
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4">Name</TableHead>
                <TableHead className="px-4">Role</TableHead>
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
                  <TableRow key={member.id}>
                    <TableCell className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {member.user.name}
                        {isSelf ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            You
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {member.user.email}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {isOwner ? (
                        <Badge variant="secondary">Owner</Badge>
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
                    <TableCell className="px-2 py-3 text-right">
                      {!isOwner && !isSelf ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`More options for ${member.user.name}`}
                              />
                            }
                          >
                            <EllipsisVerticalIcon />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-48 min-w-48"
                          >
                            <DropdownMenuItem
                              onClick={() =>
                                setConfirmTarget({
                                  kind: "member",
                                  id: member.id,
                                  label: member.user.name,
                                })
                              }
                            >
                              <Trash2Icon />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {filteredInvites.length > 0 ? (
        <>
          <p className="mt-8 text-sm font-medium text-foreground">
            Pending invitations
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">Email</TableHead>
                  <TableHead className="px-4">Role</TableHead>
                  <TableHead className="w-12 px-2">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvites.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="px-4 py-3 font-medium text-foreground">
                      {invitation.email}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {roleLabel(invitation.role ?? "member")}
                    </TableCell>
                    <TableCell className="px-2 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`More options for ${invitation.email}`}
                            />
                          }
                        >
                          <EllipsisVerticalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-48 min-w-48"
                        >
                          <DropdownMenuItem
                            onClick={() =>
                              setConfirmTarget({
                                kind: "invite",
                                id: invitation.id,
                                label: invitation.email,
                              })
                            }
                          >
                            <Trash2Icon />
                            Cancel invite
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
