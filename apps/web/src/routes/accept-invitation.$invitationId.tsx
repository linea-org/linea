import { useMutation, useQuery } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"

import { Alert, AlertDescription } from "@linea/ui/components/alert"
import { Button } from "@linea/ui/components/button"

import { AuthShell } from "../components/auth"
import { authClient } from "../lib/auth-client"
import {
  acceptInvitation,
  authQueryKeys,
  fetchInvitation,
  setActiveOrganization,
} from "../lib/auth-queries"
import {
  authErrorMessage,
  getActiveOrganizationSlug,
} from "../lib/auth-redirect"

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: AcceptInvitationPage,
})

function AcceptInvitationPage() {
  const navigate = useNavigate()
  const { invitationId } = Route.useParams()
  const { data: session, isPending: sessionPending } = authClient.useSession()

  const invitationQuery = useQuery({
    queryKey: authQueryKeys.invitation(invitationId),
    queryFn: () => fetchInvitation(invitationId),
  })

  const invite = invitationQuery.data

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const data = await acceptInvitation(invitationId)
      const orgId =
        data?.member?.organizationId ??
        data?.invitation?.organizationId ??
        invite?.organizationId
      if (orgId) {
        await setActiveOrganization(orgId)
      }
      return data
    },
    onSuccess: async () => {
      const slug = await getActiveOrganizationSlug()
      if (slug) {
        await navigate({ to: "/w/$slug", params: { slug } })
        return
      }
      await navigate({ to: "/workspaces" })
    },
  })

  const switchAccountMutation = useMutation({
    mutationFn: async () => {
      await authClient.signOut()
    },
    onSuccess: async () => {
      await navigate({
        to: "/sign-in",
        search: { invitationId, email: invite?.email },
      })
    },
  })

  if (sessionPending || invitationQuery.isPending) {
    return (
      <AuthShell title="Loading invitation…" description="One moment.">
        <p className="text-sm text-muted-foreground">Checking your session…</p>
      </AuthShell>
    )
  }

  if (!session) {
    return (
      <AuthShell
        title="You’re invited"
        description={
          invite?.organizationName
            ? `Join ${invite.organizationName} on Linea. Sign in or create an account to continue.`
            : "Sign in or create an account to accept this invitation."
        }
      >
        <div className="flex flex-col gap-2">
          <Button
            className="w-full"
            size="lg"
            nativeButton={false}
            render={
              <Link
                to="/sign-up"
                search={{
                  invitationId,
                  email: invite?.email,
                }}
              />
            }
          >
            Create account
          </Button>
          <Button
            className="w-full"
            size="lg"
            variant="outline"
            nativeButton={false}
            render={
              <Link
                to="/sign-in"
                search={{
                  invitationId,
                  email: invite?.email,
                }}
              />
            }
          >
            Sign in
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (!session.user.emailVerified) {
    return (
      <AuthShell
        title="Verify your email first"
        description="Confirm your email, then come back to accept this invitation."
      >
        <Button
          className="w-full"
          size="lg"
          nativeButton={false}
          render={
            <Link to="/verify-email" search={{ email: session.user.email }} />
          }
        >
          Go to verification
        </Button>
      </AuthShell>
    )
  }

  const busy = acceptMutation.isPending || switchAccountMutation.isPending
  const actionError = acceptMutation.error
    ? authErrorMessage(acceptMutation.error, "Could not accept invitation")
    : null

  return (
    <AuthShell
      title="Accept invitation"
      description={
        invite?.organizationName
          ? `Join ${invite.organizationName} to collaborate on workflows.`
          : "Accept this workspace invitation to continue."
      }
    >
      <div className="space-y-4">
        {actionError ? (
          <Alert variant="destructive">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}
        {invite?.email &&
        session.user.email.toLowerCase() !== invite.email.toLowerCase() ? (
          <Alert>
            <AlertDescription>
              This invite was sent to {invite.email}. You’re signed in as{" "}
              {session.user.email}.
            </AlertDescription>
          </Alert>
        ) : null}
        <Button
          className="w-full"
          size="lg"
          disabled={busy}
          onClick={() => {
            acceptMutation.mutate()
          }}
        >
          {acceptMutation.isPending ? "Accepting…" : "Accept invitation"}
        </Button>
        <Button
          className="w-full"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            switchAccountMutation.mutate()
          }}
        >
          Use a different account
        </Button>
      </div>
    </AuthShell>
  )
}
