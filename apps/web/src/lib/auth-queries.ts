import { authClient } from "./auth-client"
import { authErrorMessage } from "./auth-redirect"

export const authQueryKeys = {
  session: ["auth", "session"] as const,
  invitation: (id: string) => ["auth", "invitation", id] as const,
  organizations: ["auth", "organizations"] as const,
  activeOrganization: ["auth", "active-organization"] as const,
}

export async function fetchInvitation(invitationId: string) {
  const { data, error } = await authClient.organization.getInvitation({
    query: { id: invitationId },
  })
  if (error) {
    // Guests may not be able to load invite details — treat as soft miss.
    return null
  }
  if (!data) return null
  return {
    organizationName: data.organizationName as string | undefined,
    email: data.email as string | undefined,
    organizationId: data.organizationId as string | undefined,
  }
}

export async function acceptInvitation(invitationId: string) {
  const { data, error } = await authClient.organization.acceptInvitation({
    invitationId,
  })
  if (error) {
    throw new Error(authErrorMessage(error, "Could not accept invitation"))
  }
  return data
}

export async function setActiveOrganization(organizationId: string) {
  const { error } = await authClient.organization.setActive({ organizationId })
  if (error) {
    throw new Error(authErrorMessage(error, "Could not set active workspace"))
  }
}

export async function createOrganization(input: {
  name: string
  slug: string
}) {
  const { data, error } = await authClient.organization.create(input)
  if (error) {
    throw new Error(authErrorMessage(error, "Could not create workspace"))
  }
  return data
}

export async function inviteMembers(emails: string[]) {
  const failures: string[] = []
  for (const email of emails) {
    const { error } = await authClient.organization.inviteMember({
      email,
      role: "member",
    })
    if (error) {
      failures.push(`${email}: ${authErrorMessage(error)}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join(" · "))
  }
}
