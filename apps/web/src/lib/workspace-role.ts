type WorkspaceMember = { userId: string; role: string }

/** Mirrors the API's admin-or-higher role check; the API still decides, this only avoids offering an action it would refuse. */
export function isWorkspaceAdmin(
  members: WorkspaceMember[],
  userId: string | undefined
) {
  const role = members.find((member) => member.userId === userId)?.role
  return role === "admin" || role === "owner"
}
