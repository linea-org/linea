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

export async function inviteMembers(
  emails: string[],
  role: "member" | "admin" = "member"
) {
  const failures: string[] = []
  for (const email of emails) {
    const { error } = await authClient.organization.inviteMember({
      email,
      role,
    })
    if (error) {
      failures.push(`${email}: ${authErrorMessage(error)}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join(" · "))
  }
}

export async function updateMemberRole(
  memberId: string,
  role: "member" | "admin"
) {
  const { error } = await authClient.organization.updateMemberRole({
    memberId,
    role,
  })
  if (error) {
    throw new Error(authErrorMessage(error, "Could not update role"))
  }
}

export async function removeMember(memberIdOrEmail: string) {
  const { error } = await authClient.organization.removeMember({
    memberIdOrEmail,
  })
  if (error) {
    throw new Error(authErrorMessage(error, "Could not remove member"))
  }
}

export async function updateOrganization(
  organizationId: string,
  input: { name?: string; slug?: string }
) {
  const { error } = await authClient.organization.update({
    organizationId,
    data: input,
  })
  if (error) {
    throw new Error(authErrorMessage(error, "Could not update workspace"))
  }
}

export async function deleteOrganization(organizationId: string) {
  const { error } = await authClient.organization.delete({ organizationId })
  if (error) {
    throw new Error(authErrorMessage(error, "Could not delete workspace"))
  }
}

export async function cancelInvitation(invitationId: string) {
  const { error } = await authClient.organization.cancelInvitation({
    invitationId,
  })
  if (error) {
    throw new Error(authErrorMessage(error, "Could not cancel invitation"))
  }
}
