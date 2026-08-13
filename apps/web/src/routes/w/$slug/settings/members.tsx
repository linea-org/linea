import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Trash2Icon, UserPlusIcon } from "lucide-react"

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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@linea/ui/components/card"
import { Input } from "@linea/ui/components/input"
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
]

function roleLabel(role: string) {
  if (role === "owner") return "Owner"
  if (role === "admin") return "Admin"
  return "Member"
}

function MembersPage() {
  const { data: session } = authClient.useSession()
  const {
    data: activeOrg,
    isPending,
    refetch,
  } = authClient.useActiveOrganization()
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member")
  const [removeTarget, setRemoveTarget] = useState<{
    id: string
    label: string
  } | null>(null)

  const invite = useMutation({
    mutationFn: () => inviteMembers([inviteEmail.trim()], inviteRole),
    onSuccess: async () => {
      setInviteEmail("")
      await refetch()
    },
  })

  const changeRole = useMutation({
    mutationFn: (input: { memberId: string; role: "member" | "admin" }) =>
      updateMemberRole(input.memberId, input.role),
    onSuccess: async () => {
      await refetch()
    },
  })

  const remove = useMutation({
    mutationFn: (memberId: string) => removeMember(memberId),
    onSuccess: async () => {
      setRemoveTarget(null)
      await refetch()
    },
  })

  const cancelInvite = useMutation({
    mutationFn: (invitationId: string) => cancelInvitation(invitationId),
    onSuccess: async () => {
      await refetch()
    },
  })

  const members = activeOrg?.members ?? []
  const pendingInvitations = (activeOrg?.invitations ?? []).filter(
    (invitation) => invitation.status === "pending"
  )

  return (
    <main className="flex flex-1 flex-col px-6 py-8 sm:px-8 sm:py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Members
      </h1>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        Manage who has access to this workspace.
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Invite a member</CardTitle>
          <CardDescription>
            They&apos;ll get an email with a link to join.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (inviteEmail.trim()) invite.mutate()
            }}
          >
            <Input
              type="email"
              placeholder="teammate@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="max-w-xs"
              required
            />
            <Select
              value={inviteRole}
              onValueChange={(value) => {
                if (value === "member" || value === "admin") {
                  setInviteRole(value)
                }
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={invite.isPending}>
              <UserPlusIcon />
              {invite.isPending ? "Inviting…" : "Invite"}
            </Button>
          </form>
          {invite.isError && (
            <p className="mt-2 text-sm text-destructive">
              {invite.error.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Current members</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const isSelf = member.userId === session?.user.id
                  const isOwner = member.role === "owner"
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <p className="font-medium text-foreground">
                          {member.user.name}
                          {isSelf && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.user.email}
                        </p>
                      </TableCell>
                      <TableCell>
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
                      <TableCell>
                        {!isOwner && !isSelf && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${member.user.name}`}
                            onClick={() =>
                              setRemoveTarget({
                                id: member.id,
                                label: member.user.name,
                              })
                            }
                          >
                            <Trash2Icon />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pendingInvitations.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="text-foreground">
                      {invitation.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {roleLabel(invitation.role ?? "member")}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Cancel invitation to ${invitation.email}`}
                        onClick={() => cancelInvite.mutate(invitation.id)}
                        disabled={cancelInvite.isPending}
                      >
                        <Trash2Icon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll lose access to this workspace immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeTarget && remove.mutate(removeTarget.id)}
              disabled={remove.isPending}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
