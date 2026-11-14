import { HttpError } from "./http-error.ts"

const segment = "(?!\\.{1,2}(?:/|$))[A-Za-z0-9_.-]+"
const repositoryPattern = new RegExp(`^${segment}/${segment}$`)

/** Parses `owner/name,owner/name`; visitors can only target these, because the Agent runs with your GitHub Connection. */
export function parseAllowedRepositories(list: string): ReadonlySet<string> {
  const repositories = list
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "")
  if (repositories.length === 0)
    throw new Error("ALLOWED_REPOSITORIES must list at least one owner/name")
  for (const repository of repositories)
    if (!repositoryPattern.test(repository))
      throw new Error(
        `ALLOWED_REPOSITORIES has an invalid entry: ${repository}`
      )
  return new Set(repositories)
}

export function allowedRepository(
  allowed: ReadonlySet<string>,
  body: unknown
): string {
  const repository =
    typeof body === "object" && body !== null && "repository" in body
      ? body.repository
      : undefined
  if (typeof repository !== "string" || !repositoryPattern.test(repository))
    throw new HttpError(400, "Enter a repository as owner/name")
  if (!allowed.has(repository.toLowerCase()))
    throw new HttpError(403, "This demo is not set up for that repository")
  return repository
}
