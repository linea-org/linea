export const connectionAuthorityRoles = [
  {
    kind: "requester",
    key: "grants",
    label: "Requester",
    description: "May request operations using this installation.",
  },
  {
    kind: "reviewer",
    key: "reviewers",
    label: "Reviewer",
    description:
      "May approve exact writes after signing in to the customer application.",
  },
] as const
