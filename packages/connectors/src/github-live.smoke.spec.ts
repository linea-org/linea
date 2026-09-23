import { describe, expect, it } from "vitest"
import { z } from "zod"
import { githubListIssuesOperation } from "./github-list-issues.operation.js"
import { githubListRepositoriesOperation } from "./github-list-repositories.operation.js"

const token = process.env.GITHUB_LIVE_TOKEN
const repository = process.env.GITHUB_LIVE_REPOSITORY
const enabled = Boolean(token && repository)

describe.skipIf(!enabled)("live GitHub compatibility", () => {
  it("reads bounded repositories and issues through the live REST API", async () => {
    const [owner, name, extra] = repository?.split("/") ?? []
    if (!token || !owner || !name || extra) {
      throw new Error(
        "GITHUB_LIVE_TOKEN and owner/name GITHUB_LIVE_REPOSITORY are required"
      )
    }
    const credential = {
      accountId: "live",
      accessToken: token,
      expiresAt: null,
    }
    const repositories = await githubListRepositoriesOperation.execute(
      { visibility: "public", page: 1, perPage: 10 },
      credential
    )
    const parsedRepositories = z
      .object({ repositories: z.array(z.unknown()).max(10) })
      .passthrough()
      .parse(repositories)
    expect(parsedRepositories.repositories.length).toBeLessThanOrEqual(10)
    const issues = await githubListIssuesOperation.execute(
      { owner, repository: name, state: "all", page: 1, perPage: 10 },
      credential
    )
    const parsedIssues = z
      .object({ issues: z.array(z.unknown()).max(10) })
      .passthrough()
      .parse(issues)
    expect(parsedIssues.issues.length).toBeLessThanOrEqual(10)
  })
})
